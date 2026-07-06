<script lang="ts">
	import * as Dialog from "$lib/components/ui/dialog";
	import { ScrollArea } from "$lib/components/ui/scroll-area";
	import * as Table from "$lib/components/ui/table";

	type SnapshotMetric = {
		key: string;
		label: string;
		unit: string | null;
		group: string;
		value: number;
		display?: string;
	};

	let {
		open = $bindable(false),
		result
	}: {
		open?: boolean;
		result: { metricCount?: number; durationMs?: number; metrics?: SnapshotMetric[] } | null;
	} = $props();
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-2xl">
		<Dialog.Header>
			<Dialog.Title>Captured snapshot</Dialog.Title>
			<Dialog.Description>
				{result?.metricCount} values read in {result?.durationMs} ms. Check
				them for plausibility before saving.
			</Dialog.Description>
		</Dialog.Header>
		<ScrollArea class="h-[60vh] w-full min-w-0 pr-3">
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>Metric</Table.Head>
						<Table.Head>Group</Table.Head>
						<Table.Head class="text-right">Value</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each result?.metrics ?? [] as m (m.key)}
						<Table.Row>
							<Table.Cell class="font-medium">{m.label}</Table.Cell>
							<Table.Cell class="text-muted-foreground">{m.group}</Table.Cell>
							<Table.Cell class="text-right tabular-nums">
								{#if m.display}
									{m.display}
									<span class="ml-1 text-xs text-muted-foreground">({m.value})</span>
								{:else}
									{m.value}{#if m.unit}&nbsp;{m.unit}{/if}
								{/if}
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</ScrollArea>
	</Dialog.Content>
</Dialog.Root>
