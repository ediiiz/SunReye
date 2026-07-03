<script lang="ts">
	import { Progress } from '$lib/components/ui/progress';
	import { formatNumber, formatMagnitude } from '$lib/inverter/format';

	let {
		soc,
		power
	}: {
		soc: number | undefined;
		power: number | undefined;
	} = $props();

	// Sign convention: power > 0 charging, < 0 discharging.
	const state = $derived(
		power === undefined || power === 0 ? 'Idle' : power > 0 ? 'Charging' : 'Discharging'
	);
</script>

<div class="flex flex-col gap-3">
	<div class="flex items-end justify-between">
		<div class="flex items-baseline gap-1.5">
			<span class="text-3xl font-semibold tabular-nums leading-none">
				{soc === undefined ? '—' : formatNumber(soc)}
			</span>
			<span class="text-sm text-muted-foreground">%</span>
		</div>
		<div class="text-right">
			<div class="text-xs uppercase tracking-wide text-muted-foreground">{state}</div>
			<div class="text-sm font-medium tabular-nums">{formatMagnitude(power)} W</div>
		</div>
	</div>
	<Progress value={soc ?? 0} max={100} />
</div>
