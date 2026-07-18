<script lang="ts">
	import Plus from 'phosphor-svelte/lib/Plus';
	import ChartLine from 'phosphor-svelte/lib/ChartLine';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import * as m from '$lib/paraglide/messages';
	import CustomChartCard from '$lib/components/inverter/custom-chart-card.svelte';
	import CustomChartEditor from '$lib/components/inverter/custom-chart-editor.svelte';
	import { useAppSession } from '$lib/session';
	import { type CustomChart, customCharts } from '$lib/inverter/custom-charts.svelte';
	import type { HistoryRange } from '$lib/inverter/ranges';

	let { range }: { range: HistoryRange } = $props();

	const session = useAppSession();
	const isAdmin = $derived($session.data?.user.role === 'admin');

	// Load saved charts once (idempotent).
	customCharts.start();

	let editorOpen = $state(false);
	let editing = $state<CustomChart | null>(null);
	let pendingDelete = $state<CustomChart | null>(null);
	let deleting = $state(false);
	let deleteError = $state<string | null>(null);

	function openCreate() {
		editing = null;
		editorOpen = true;
	}
	function openEdit(chart: CustomChart) {
		editing = chart;
		editorOpen = true;
	}

	async function confirmDelete() {
		if (!pendingDelete) return;
		deleting = true;
		deleteError = null;
		const err = await customCharts.remove(pendingDelete.id);
		deleting = false;
		if (err) {
			deleteError = err;
			return;
		}
		pendingDelete = null;
	}

	const charts = $derived(customCharts.charts);
	// Hide the whole section for non-admins when there's nothing saved yet.
	const show = $derived(isAdmin || charts.length > 0);
</script>

{#if show}
	<section class="flex flex-col gap-4">
		<div class="flex items-center justify-between gap-3 border-b border-border py-2">
			<h2 class="text-sm font-medium">{m.chart_custom_charts()}</h2>
			{#if isAdmin}
				<Button size="sm" variant="outline" onclick={openCreate}>
					<Plus class="size-4" />
					{m.chart_new_chart()}
				</Button>
			{/if}
		</div>

		{#if charts.length === 0}
			<div
				class="flex h-40 flex-col items-center justify-center gap-2 border border-dashed border-border text-sm text-muted-foreground"
			>
				<ChartLine class="size-6" />
				<span>{m.chart_none_yet()}</span>
				{#if isAdmin}
					<Button size="sm" variant="ghost" onclick={openCreate}>{m.chart_create_first()}</Button>
				{/if}
			</div>
		{:else}
			<div class="grid gap-4 lg:grid-cols-2">
				{#each charts as chart (chart.id)}
					<CustomChartCard
						{chart}
						{range}
						{isAdmin}
						onEdit={() => openEdit(chart)}
						onDelete={() => (pendingDelete = chart)}
					/>
				{/each}
			</div>
		{/if}
	</section>

	{#if isAdmin}
		<CustomChartEditor bind:open={editorOpen} chart={editing} />

		<Dialog.Root
			open={pendingDelete !== null}
			onOpenChange={(v) => {
				if (!v) pendingDelete = null;
			}}
		>
			<Dialog.Content class="sm:max-w-sm">
				<Dialog.Header>
					<Dialog.Title>{m.chart_delete_chart()}</Dialog.Title>
					<Dialog.Description>
						{m.chart_delete_confirm({ name: pendingDelete?.name ?? '' })}
					</Dialog.Description>
				</Dialog.Header>
				{#if deleteError}
					<p class="text-sm text-destructive">{deleteError}</p>
				{/if}
				<Dialog.Footer>
					<Button variant="outline" onclick={() => (pendingDelete = null)}>{m.action_cancel()}</Button>
					<Button variant="destructive" disabled={deleting} onclick={confirmDelete}>
						{deleting ? m.action_deleting() : m.action_delete()}
					</Button>
				</Dialog.Footer>
			</Dialog.Content>
		</Dialog.Root>
	{/if}
{/if}
