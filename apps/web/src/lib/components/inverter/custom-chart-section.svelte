<script lang="ts">
	import Plus from 'phosphor-svelte/lib/Plus';
	import ChartLine from 'phosphor-svelte/lib/ChartLine';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import CustomChartCard from '$lib/components/inverter/custom-chart-card.svelte';
	import CustomChartEditor from '$lib/components/inverter/custom-chart-editor.svelte';
	import RangeSwitcher from '$lib/components/inverter/range-switcher.svelte';
	import { useAppSession } from '$lib/session';
	import {
		CHART_TYPES,
		type ChartType,
		type CustomChart,
		customCharts
	} from '$lib/inverter/custom-charts.svelte';
	import type { HistoryRange } from '$lib/inverter/ranges';

	let { range }: { range: HistoryRange } = $props();

	const session = useAppSession();
	const isAdmin = $derived($session.data?.user.role === 'admin');

	// Global render style for every custom chart (view-only, shared across charts).
	let chartType = $state<ChartType>('area');
	const typeOptions = CHART_TYPES.map((t) => ({ id: t, label: t === 'area' ? 'Area' : 'Line' }));

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
			<h2 class="text-sm font-medium">Custom charts</h2>
			<div class="flex items-center gap-2">
				{#if charts.length > 0}
					<RangeSwitcher options={typeOptions} bind:value={chartType} />
				{/if}
				{#if isAdmin}
					<Button size="sm" variant="outline" onclick={openCreate}>
						<Plus class="size-4" />
						New chart
					</Button>
				{/if}
			</div>
		</div>

		{#if charts.length === 0}
			<div
				class="flex h-40 flex-col items-center justify-center gap-2 border border-dashed border-border text-sm text-muted-foreground"
			>
				<ChartLine class="size-6" />
				<span>No custom charts yet.</span>
				{#if isAdmin}
					<Button size="sm" variant="ghost" onclick={openCreate}>Create your first chart</Button>
				{/if}
			</div>
		{:else}
			<div class="grid gap-4 lg:grid-cols-2">
				{#each charts as chart (chart.id)}
					<CustomChartCard
						{chart}
						{range}
						type={chartType}
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
					<Dialog.Title>Delete chart</Dialog.Title>
					<Dialog.Description>
						Delete “{pendingDelete?.name}”? This can't be undone.
					</Dialog.Description>
				</Dialog.Header>
				{#if deleteError}
					<p class="text-sm text-destructive">{deleteError}</p>
				{/if}
				<Dialog.Footer>
					<Button variant="outline" onclick={() => (pendingDelete = null)}>Cancel</Button>
					<Button variant="destructive" disabled={deleting} onclick={confirmDelete}>
						{deleting ? 'Deleting…' : 'Delete'}
					</Button>
				</Dialog.Footer>
			</Dialog.Content>
		</Dialog.Root>
	{/if}
{/if}
