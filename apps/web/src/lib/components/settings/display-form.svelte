<script lang="ts">
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/ui/button';
	import { Label } from '$lib/components/ui/label';
	import SettingsSection from './settings-section.svelte';
	import OptionSelect from './option-select.svelte';
	import { display, TIME_ZONE_AUTO, type DisplayConfig } from '$lib/display.svelte';
	import { useAppSession } from '$lib/session';

	const session = useAppSession();
	const isAdmin = $derived($session.data?.user.role === 'admin');

	const HOUR_CYCLES = [
		{ value: 'auto', label: 'Automatic (locale)' },
		{ value: '24h', label: '24-hour (14:05)' },
		{ value: '12h', label: '12-hour (2:05 PM)' }
	];

	// System zones (~hundreds) plus the "follow the viewer" sentinel. `undefined`
	// timeZone in Intl means the runtime zone, which is exactly what auto renders.
	const SYSTEM_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;
	const ZONES = [
		{ value: TIME_ZONE_AUTO, label: `Automatic (${SYSTEM_ZONE})` },
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
		if (ok) toast.success('Display preferences saved');
		else toast.error('Failed to save display preferences');
	}
</script>

<SettingsSection title="Date & time">
	{#if !draft}
		<p class="text-sm text-muted-foreground">Loading…</p>
	{:else}
		<p class="text-sm text-muted-foreground">
			How timestamps render across charts and history. Applies to everyone using this instance.
		</p>

		<div class="flex flex-col gap-2">
			<Label for="hour-cycle">Clock format</Label>
			<OptionSelect
				value={draft.hourCycle}
				items={HOUR_CYCLES}
				onchange={(v) => (draft && (draft.hourCycle = v as DisplayConfig['hourCycle']))}
				triggerClass="max-w-xs"
			/>
		</div>

		<div class="flex flex-col gap-2">
			<Label for="time-zone">Time zone</Label>
			<OptionSelect
				value={draft.timeZone}
				items={ZONES}
				onchange={(v) => (draft && (draft.timeZone = v))}
				triggerClass="max-w-xs"
			/>
		</div>

		<div class="flex flex-col gap-1 border border-border p-3">
			<span class="text-xs uppercase tracking-wide text-muted-foreground">Preview</span>
			<span class="font-mono text-sm tabular-nums">{preview}</span>
		</div>

		<div class="flex items-center gap-3">
			<Button onclick={save} disabled={!isAdmin || saving}>
				{saving ? 'Saving…' : 'Save'}
			</Button>
			{#if !isAdmin}
				<span class="text-xs text-muted-foreground">Only admins can change this setting.</span>
			{/if}
		</div>
	{/if}
</SettingsSection>
