<script lang="ts">
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/ui/button';
	import { Label } from '$lib/components/ui/label';
	import SettingsSection from './settings-section.svelte';
	import OptionSelect from './option-select.svelte';
	import { display, TIME_ZONE_AUTO, type DisplayConfig } from '$lib/display.svelte';
	import { getLocale, locales, localeName, setLocale } from '$lib/i18n';
	import * as m from '$lib/paraglide/messages';
	import { useAppSession } from '$lib/session';

	const session = useAppSession();
	const isAdmin = $derived($session.data?.user.role === 'admin');

	// Language is a per-browser preference (localStorage). Switching calls
	// setLocale, which reloads the page (Paraglide default) so every message
	// re-renders — hence no admin gate and no draft/save cycle.
	const LANGUAGES = locales.map((l) => ({ value: l, label: localeName(l) }));

	const HOUR_CYCLES = [
		{ value: 'auto', label: m.clock_auto() },
		{ value: '24h', label: m.clock_24h() },
		{ value: '12h', label: m.clock_12h() }
	];

	// System zones (~hundreds) plus the "follow the viewer" sentinel. `undefined`
	// timeZone in Intl means the runtime zone, which is exactly what auto renders.
	const SYSTEM_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;
	const ZONES = [
		{ value: TIME_ZONE_AUTO, label: m.zone_auto({ zone: SYSTEM_ZONE }) },
		...(typeof Intl.supportedValuesOf === 'function'
			? Intl.supportedValuesOf('timeZone').map((z) => ({ value: z, label: z }))
			: [])
	];

	let draft = $state<DisplayConfig | null>(null);
	let saving = $state(false);

	onMount(async () => {
		await display.load();
		draft = { ...display.config };
	});

	// Live sample of how the current draft renders "now", so the choice is
	// concrete before saving.
	const preview = $derived.by(() => {
		if (!draft) return '';
		const hour12 = draft.hourCycle === 'auto' ? undefined : draft.hourCycle === '12h';
		const timeZone = draft.timeZone === TIME_ZONE_AUTO ? undefined : draft.timeZone;
		return new Intl.DateTimeFormat(undefined, {
			weekday: 'short',
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit',
			hour12,
			timeZone
		}).format(new Date());
	});

	async function save() {
		if (!draft) return;
		saving = true;
		const ok = await display.save(draft);
		saving = false;
		if (ok) toast.success(m.toast_display_saved());
		else toast.error(m.toast_display_error());
	}
</script>

<SettingsSection title={m.settings_language()}>
	<p class="text-sm text-muted-foreground">{m.settings_language_desc()}</p>
	<div class="flex flex-col gap-2">
		<Label for="language">{m.settings_language()}</Label>
		<OptionSelect
			value={getLocale()}
			items={LANGUAGES}
			onchange={(v) => setLocale(v as (typeof locales)[number])}
			triggerClass="max-w-xs"
		/>
	</div>
</SettingsSection>

<SettingsSection title={m.settings_datetime()}>
	{#if !draft}
		<p class="text-sm text-muted-foreground">{m.app_loading()}</p>
	{:else}
		<p class="text-sm text-muted-foreground">{m.settings_datetime_desc()}</p>

		<div class="flex flex-col gap-2">
			<Label for="hour-cycle">{m.settings_clock_format()}</Label>
			<OptionSelect
				value={draft.hourCycle}
				items={HOUR_CYCLES}
				onchange={(v) => (draft && (draft.hourCycle = v as DisplayConfig['hourCycle']))}
				triggerClass="max-w-xs"
			/>
		</div>

		<div class="flex flex-col gap-2">
			<Label for="time-zone">{m.settings_time_zone()}</Label>
			<OptionSelect
				value={draft.timeZone}
				items={ZONES}
				onchange={(v) => (draft && (draft.timeZone = v))}
				triggerClass="max-w-xs"
			/>
		</div>

		<div class="flex flex-col gap-1 border border-border p-3">
			<span class="text-xs uppercase tracking-wide text-muted-foreground">{m.settings_preview()}</span>
			<span class="font-mono text-sm tabular-nums">{preview}</span>
		</div>

		<div class="flex items-center gap-3">
			<Button onclick={save} disabled={!isAdmin || saving}>
				{saving ? m.action_saving() : m.action_save()}
			</Button>
			{#if !isAdmin}
				<span class="text-xs text-muted-foreground">{m.settings_admin_only()}</span>
			{/if}
		</div>
	{/if}
</SettingsSection>
