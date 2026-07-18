<script lang="ts">
	import TouSlotEditor from './tou-slot-editor.svelte';
	import * as msg from '$lib/paraglide/messages';
	import {
		hhmmToMinutes,
		hhmmToLabel,
		minutesToLabel,
		type TouController,
		type TouSlot
	} from '$lib/inverter/tou.svelte';

	let { controller }: { controller: TouController } = $props();

	const MIN_PER_DAY = 24 * 60;
	const HOUR_TICKS = [0, 6, 12, 18, 24];

	const slots = $derived(controller.slots);
	// Battery mode decides the per-slot target: voltage (lead-acid) or SOC (lithium).
	const mode = $derived(controller.targetMode);

	// Live "now" marker so the user can see which period is active right now.
	let nowMin = $state(currentMinutes());
	function currentMinutes(): number {
		const d = new Date();
		return d.getHours() * 60 + d.getMinutes();
	}
	$effect(() => {
		const id = setInterval(() => (nowMin = currentMinutes()), 30_000);
		return () => clearInterval(id);
	});

	function fieldVal(slot: TouSlot, field: 'time' | 'power' | 'voltage' | 'soc' | 'enabled') {
		const m = slot.metrics[field];
		return m ? controller.value(m.key) : undefined;
	}

	// Lay the six slots out on a real 00:00→24:00 axis. A period runs from its
	// start until the *next start in clock order* (not slot-index order) — so the
	// blocks always tile the day without overlap even when the times aren't in
	// ascending index order, and duplicate/unused starts collapse to zero width
	// instead of ballooning to a full day. The block that crosses midnight is
	// drawn as two pieces. When starts aren't all known yet, or every slot shares
	// one start, the axis is meaningless — fall back to equal-width index blocks.
	const layout = $derived.by(() => {
		const entries = slots.map((slot) => {
			const v = fieldVal(slot, 'time');
			return { slot, startMin: v === undefined ? null : hhmmToMinutes(v) };
		});
		const known = entries.filter(
			(e): e is { slot: TouSlot; startMin: number } => e.startMin !== null
		);
		const realAxis = known.length === slots.length && new Set(known.map((e) => e.startMin)).size > 1;

		type Piece = { slot: TouSlot; startMin: number; lenMin: number; leftPct: number; widthPct: number };
		const pieces: Piece[] = [];

		if (!realAxis) {
			const w = slots.length ? 100 / slots.length : 100;
			slots.forEach((slot, i) => {
				pieces.push({ slot, startMin: 0, lenMin: 0, leftPct: i * w, widthPct: w });
			});
			return { realAxis, pieces };
		}

		// Clock order, ties broken by slot index for stability.
		const sorted = [...known].sort((a, b) => a.startMin - b.startMin || a.slot.index - b.slot.index);
		const n = sorted.length;
		const pct = (min: number) => (min / MIN_PER_DAY) * 100;
		for (let i = 0; i < n; i++) {
			const cur = sorted[i].startMin;
			// Last block wraps to the first start of the next day.
			const next = i + 1 < n ? sorted[i + 1].startMin : sorted[0].startMin + MIN_PER_DAY;
			const dur = next - cur;
			if (dur <= 0) continue; // duplicate start → zero-length period, nothing to draw
			const slot = sorted[i].slot;
			const end = cur + dur;
			if (end <= MIN_PER_DAY) {
				pieces.push({ slot, startMin: cur, lenMin: dur, leftPct: pct(cur), widthPct: pct(dur) });
			} else {
				const first = MIN_PER_DAY - cur;
				pieces.push({ slot, startMin: cur, lenMin: first, leftPct: pct(cur), widthPct: pct(first) });
				pieces.push({ slot, startMin: 0, lenMin: end - MIN_PER_DAY, leftPct: 0, widthPct: pct(end - MIN_PER_DAY) });
			}
		}
		return { realAxis, pieces };
	});

	// The slot whose period contains "now", used as the default selection.
	const activeIndex = $derived.by(() => {
		if (!layout.realAxis) return slots[0]?.index ?? null;
		for (const p of layout.pieces) {
			if (nowMin >= p.startMin && nowMin < p.startMin + p.lenMin) return p.slot.index;
		}
		return slots[0]?.index ?? null;
	});

	let selectedIndex = $state<number | null>(null);
	const selected = $derived(
		slots.find((s) => s.index === selectedIndex) ??
			slots.find((s) => s.index === activeIndex) ??
			slots[0] ??
			null
	);

	// The inverter stores only a start time per slot; a period ends where the
	// next slot begins (the manual shows this derived end as a second column).
	const selectedRange = $derived.by(() => {
		if (!selected || slots.length < 2) return null;
		const pos = slots.findIndex((s) => s.index === selected.index);
		const next = slots[(pos + 1) % slots.length];
		const startV = selected.metrics.time ? controller.value(selected.metrics.time.key) : undefined;
		const endV = next.metrics.time ? controller.value(next.metrics.time.key) : undefined;
		if (startV === undefined || endV === undefined) return null;
		return `${hhmmToLabel(startV)} → ${hhmmToLabel(endV)}`;
	});

	// Precompute everything the timeline blocks and picker chips render, so the
	// markup below stays branch-free (keeps the template's complexity in budget).
	const renderPieces = $derived.by(() => {
		// Voltage targets have no natural 0–100 range, so normalize the bar height
		// across the slots' min–max span; SOC maps directly to a percentage.
		const useVoltage = mode === 'voltage';
		const targetOf = (p: (typeof layout.pieces)[number]) =>
			(useVoltage ? fieldVal(p.slot, 'voltage') : fieldVal(p.slot, 'soc')) ?? 0;
		const vals = layout.pieces.map(targetOf);
		const min = Math.min(...vals);
		const span = Math.max(...vals) - min;
		const unit = useVoltage ? 'V' : '%';
		return layout.pieces.map((p) => {
			const target = targetOf(p);
			const grid = fieldVal(p.slot, 'enabled') === 1;
			const range = layout.realAxis
				? ` · ${minutesToLabel(p.startMin)}–${minutesToLabel(p.startMin + p.lenMin)}`
				: '';
			return {
				...p,
				target,
				unit,
				grid,
				fillHeight: useVoltage
					? span > 0
						? ((target - min) / span) * 100
						: 50
					: Math.max(0, Math.min(100, target)),
				blockClass: grid
					? 'border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20'
					: 'border-sky-500/40 bg-sky-500/10 hover:bg-sky-500/20',
				fillClass: grid ? 'bg-amber-500/25' : 'bg-sky-500/25',
				label: layout.realAxis ? minutesToLabel(p.startMin) : msg.tou_slot_n({ index: p.slot.index }),
				showLabel: p.widthPct > 10,
				showTarget: p.widthPct > 7,
				title: `${msg.tou_slot_n({ index: p.slot.index })}${range} · ${useVoltage ? msg.tou_target_label() : 'SOC'} ${target}${unit}${grid ? ` · ${msg.tou_grid_charge_lower()}` : ''}`
			};
		});
	});

	const chips = $derived(
		slots.map((s) => ({
			slot: s,
			grid: fieldVal(s, 'enabled') === 1,
			time: hhmmToLabel(fieldVal(s, 'time'))
		}))
	);
</script>

<div class="flex flex-col gap-5">
	<!-- 24-hour timeline -->
	<div class="flex flex-col gap-1.5">
		<div class="relative h-24 w-full">
			{#if layout.realAxis}
				<!-- hour gridlines -->
				{#each HOUR_TICKS as h (h)}
					<div
						class="absolute inset-y-0 w-px bg-border/60"
						style="left: {(h / 24) * 100}%"
					></div>
				{/each}
			{/if}

			{#each renderPieces as piece, i (i)}
				<button
					type="button"
					onclick={() => (selectedIndex = piece.slot.index)}
					title={piece.title}
					class="group absolute inset-y-0 flex flex-col justify-between overflow-hidden rounded-sm border p-1.5 text-left transition-colors {piece.blockClass} {selected?.index ===
					piece.slot.index
						? 'ring-2 ring-primary ring-offset-1 ring-offset-background'
						: ''}"
					style="left: {piece.leftPct}%; width: calc({piece.widthPct}% - 2px);"
				>
					<!-- SOC target fill: bar height maps to the battery target for this period -->
					<div
						class="absolute inset-x-0 bottom-0 {piece.fillClass}"
						style="height: {piece.fillHeight}%"
					></div>

					<div class="relative flex items-center gap-1">
						{#if piece.grid}
							<!-- lightning bolt = grid charging enabled this period -->
							<svg viewBox="0 0 24 24" class="size-3 shrink-0 text-amber-600 dark:text-amber-400" fill="currentColor" aria-hidden="true">
								<path d="M13 2 3 14h7l-1 8 10-12h-7l1-8z" />
							</svg>
						{/if}
						{#if piece.showLabel}
							<span class="truncate text-[10px] font-medium text-muted-foreground">{piece.label}</span>
						{/if}
					</div>
					{#if piece.showTarget}
						<span class="relative text-xs font-semibold tabular-nums">{piece.target}{piece.unit}</span>
					{/if}
				</button>
			{/each}

			{#if layout.realAxis}
				<!-- now marker -->
				<div
					class="pointer-events-none absolute inset-y-0 z-10 w-0.5 bg-foreground/70"
					style="left: {(nowMin / MIN_PER_DAY) * 100}%"
				>
					<span class="absolute -top-0.5 left-1/2 size-1.5 -translate-x-1/2 rounded-full bg-foreground/70"></span>
				</div>
			{/if}
		</div>

		{#if layout.realAxis}
			<div class="relative h-4 text-[10px] text-muted-foreground">
				{#each HOUR_TICKS as h (h)}
					<span
						class="absolute -translate-x-1/2 tabular-nums first:translate-x-0 last:-translate-x-full"
						style="left: {(h / 24) * 100}%"
					>
						{String(h).padStart(2, '0')}:00
					</span>
				{/each}
			</div>
		{/if}

		<!-- legend -->
		<div class="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 text-xs text-muted-foreground">
			<span class="flex items-center gap-1.5">
				<span class="size-2.5 rounded-sm border border-amber-500/40 bg-amber-500/25"></span>
				{msg.tou_legend_grid_charge()}
			</span>
			<span class="flex items-center gap-1.5">
				<span class="size-2.5 rounded-sm border border-sky-500/40 bg-sky-500/25"></span>
				{msg.tou_legend_discharge()}
			</span>
			<span class="flex items-center gap-1.5">
				<span class="h-2.5 w-0.5 bg-foreground/70"></span>
				{msg.tou_now()}
			</span>
			<span>{mode === 'voltage' ? msg.tou_bar_height_voltage() : msg.tou_bar_height_soc()}</span>
		</div>
	</div>

	<!-- Slot picker: every slot stays reachable even when its block is thin or
		 collapsed (duplicate start times), which the timeline can't guarantee. -->
	<div class="flex flex-wrap gap-1.5">
		{#each chips as chip (chip.slot.index)}
			<button
				type="button"
				onclick={() => (selectedIndex = chip.slot.index)}
				class="flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors {selected?.index ===
				chip.slot.index
					? 'border-primary bg-primary/10 font-medium'
					: 'border-border hover:bg-muted'}"
			>
				<span class="size-2 rounded-full {chip.grid ? 'bg-amber-500' : 'bg-sky-500'}"></span>
				<span>{msg.tou_slot_n({ index: chip.slot.index })}</span>
				<span class="tabular-nums text-muted-foreground">{chip.time}</span>
				{#if activeIndex === chip.slot.index}
					<span class="text-[10px] font-medium text-primary">{msg.tou_now_short()}</span>
				{/if}
			</button>
		{/each}
	</div>

	<!-- Editor for the selected slot; keyed so its SOC draft resets per slot. -->
	{#if selected}
		{#key selected.index}
			<TouSlotEditor {controller} slot={selected} range={selectedRange} slotCount={slots.length} />
		{/key}
	{/if}
</div>
