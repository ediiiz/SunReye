<script lang="ts">
	import CarProfile from 'phosphor-svelte/lib/CarProfile';
	import * as Dialog from '$lib/components/ui/dialog';
	import { EVCC_MODES, evcc, type EvccLoadpoint } from '$lib/evcc/store.svelte';
	import { socColor } from '$lib/inverter/power-graph';
	import { useAppSession } from '$lib/session';
	import * as m from '$lib/paraglide/messages';
	import AnimatedNumber from './animated-number.svelte';
	import EvQuickSettings from './ev-quick-settings.svelte';

	// Same tile surface as the daily-energy cards so the strip reads as one row.
	const CARD_CLASS =
		'flex w-full flex-col gap-2 rounded-xl border border-border/60 bg-card p-3 text-left sm:p-4';
	const TRIGGER_CLASS = `${CARD_CLASS} transition-colors hover:border-border hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`;

	const session = useAppSession();
	// Commands are admin-only server-side; everyone else gets the read-only tile.
	const isAdmin = $derived($session.data?.user.role === 'admin');

	$effect(() => evcc.connect());

	const statusText = (lp: EvccLoadpoint) =>
		lp.charging ? m.flow_charging() : lp.connected ? m.flow_plugged() : m.evcc_status_disconnected();

	const modeLabel = (mode: string | null) =>
		EVCC_MODES.find((x) => x.value === mode)?.label() ?? (mode ?? '—');
</script>

{#snippet body(lp: EvccLoadpoint)}
	<span class="flex items-start justify-between gap-2">
		<span
			class="text-[0.65rem] font-medium uppercase tracking-wider text-muted-foreground sm:text-xs 2xl:text-sm"
		>
			{lp.title ?? m.evcc_card_title()}
		</span>
		<span class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-chart-2/15 2xl:size-10">
			<CarProfile class="size-4.5 text-chart-2 2xl:size-5" weight="duotone" />
		</span>
	</span>
	<span class="text-2xl font-semibold tabular-nums leading-none xl:text-3xl">
		<AnimatedNumber value={lp.chargePower} unit="W" />
		<span class="ml-1 text-sm font-normal text-muted-foreground 2xl:text-base">W</span>
	</span>
	<span class="flex items-center justify-between gap-2 text-xs text-muted-foreground">
		<span class={lp.charging ? 'text-amber-500' : ''}>{statusText(lp)}</span>
		{#if lp.mode}
			<span class="rounded-full border border-border px-2 py-0.5 text-[0.65rem] font-medium">
				{modeLabel(lp.mode)}
			</span>
		{/if}
	</span>
	{#if lp.vehicleTitle || lp.vehicleSoc !== null}
		<span class="flex items-baseline justify-between gap-2 border-t border-border/40 pt-2 text-xs">
			<span class="min-w-0 truncate text-muted-foreground">{lp.vehicleTitle ?? ''}</span>
			<span class="flex shrink-0 items-center gap-2 tabular-nums">
				{#if lp.vehicleSoc !== null}
					<span class="font-semibold" style={`color:${socColor(lp.vehicleSoc)}`}>
						{Math.round(lp.vehicleSoc)}%
					</span>
				{/if}
				{#if lp.vehicleRange !== null}
					<span class="text-muted-foreground">{Math.round(lp.vehicleRange)} km</span>
				{/if}
			</span>
		</span>
	{/if}
{/snippet}

{#if evcc.active}
	<div class="flex flex-col gap-3 sm:gap-4">
		{#each evcc.loadpoints as lp (lp.index)}
			{#if isAdmin}
				<Dialog.Root>
					<Dialog.Trigger class={TRIGGER_CLASS}>
						{@render body(lp)}
					</Dialog.Trigger>
					<Dialog.Content class="sm:max-w-md">
						<Dialog.Header>
							<Dialog.Title>{lp.title ?? m.evcc_card_title()}</Dialog.Title>
							{#if lp.vehicleTitle}
								<Dialog.Description>{lp.vehicleTitle}</Dialog.Description>
							{/if}
						</Dialog.Header>
						<EvQuickSettings {lp} />
					</Dialog.Content>
				</Dialog.Root>
			{:else}
				<div class={CARD_CLASS}>
					{@render body(lp)}
				</div>
			{/if}
		{/each}
	</div>
{/if}
