<script lang="ts">
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/ui/button';
	import { Switch } from '$lib/components/ui/switch';
	import { Label } from '$lib/components/ui/label';
	import SettingsSection from './settings-section.svelte';
	import { inverter } from '$lib/inverter/store.svelte';
	import type { ManifestMetric } from '$lib/inverter/types';
	import { uiPrefs, type UiPrefs } from '$lib/ui-prefs.svelte';
	import * as m from '$lib/paraglide/messages';
	import { useAppSession } from '$lib/session';

	const session = useAppSession();
	const isAdmin = $derived($session.data?.user.role === 'admin');

	// Translated names for the well-known subsystem groups; anything else falls
	// back to a title-cased version of the raw group id from the profile.
	const GROUP_LABELS: Record<string, () => string> = {
		solar: m.label_solar,
		battery: m.label_battery,
		grid: m.label_grid,
		load: m.label_load,
		generator: m.label_generator,
		inverter: m.label_inverter
	};
	const groupLabel = (id: string) => GROUP_LABELS[id]?.() ?? id.charAt(0).toUpperCase() + id.slice(1);

	// The full (unfiltered) catalog, grouped in profile order so the form lists
	// every sensor — including the ones currently hidden.
	const groups = $derived.by(() => {
		const byGroup = new Map<string, ManifestMetric[]>();
		for (const metric of inverter.allMetrics) {
			const list = byGroup.get(metric.group) ?? [];
			list.push(metric);
			byGroup.set(metric.group, list);
		}
		return [...byGroup].map(([id, metrics]) => ({ id, label: groupLabel(id), metrics }));
	});

	// Local edit buffer (arrays match the saved shape). Reassigned on every toggle
	// so the reactive reads below recompute.
	let draft = $state<UiPrefs | null>(null);
	let saving = $state(false);

	onMount(async () => {
		await uiPrefs.load();
		draft = {
			hiddenKeys: [...uiPrefs.config.hiddenKeys],
			hiddenGroups: [...uiPrefs.config.hiddenGroups]
		};
	});

	const isGroupVisible = (id: string) => !draft?.hiddenGroups.includes(id);
	const isMetricVisible = (metric: ManifestMetric) =>
		!draft?.hiddenGroups.includes(metric.group) && !draft?.hiddenKeys.includes(metric.key);

	function setGroupVisible(id: string, visible: boolean) {
		if (!draft) return;
		draft.hiddenGroups = visible
			? draft.hiddenGroups.filter((g) => g !== id)
			: [...draft.hiddenGroups.filter((g) => g !== id), id];
	}

	function setMetricVisible(key: string, visible: boolean) {
		if (!draft) return;
		draft.hiddenKeys = visible
			? draft.hiddenKeys.filter((k) => k !== key)
			: [...draft.hiddenKeys.filter((k) => k !== key), key];
	}

	async function save() {
		if (!draft) return;
		saving = true;
		const ok = await uiPrefs.save(draft);
		saving = false;
		if (ok) toast.success(m.toast_sensors_saved());
		else toast.error(m.toast_sensors_error());
	}
</script>

<SettingsSection title={m.settings_sensors_title()}>
	<p class="max-w-prose text-sm text-muted-foreground">{m.settings_sensors_desc()}</p>

	{#if !draft}
		<p class="text-sm text-muted-foreground">{m.app_loading()}</p>
	{:else if groups.length === 0}
		<p class="text-sm text-muted-foreground">{m.settings_sensors_empty()}</p>
	{:else}
		<div class="flex flex-col gap-4">
			{#each groups as group (group.id)}
				{@const visibleCount = group.metrics.filter(isMetricVisible).length}
				<div class="flex flex-col gap-3 border border-border p-3">
					<div class="flex items-center justify-between gap-4">
						<div class="flex flex-col gap-0.5">
							<span class="text-sm font-medium">{group.label}</span>
							<span class="text-xs text-muted-foreground tabular-nums">
								{m.settings_sensors_count({ visible: visibleCount, total: group.metrics.length })}
							</span>
						</div>
						<Switch
							checked={isGroupVisible(group.id)}
							disabled={!isAdmin || saving}
							aria-label={group.label}
							onCheckedChange={(v) => setGroupVisible(group.id, v)}
						/>
					</div>

					{#if isGroupVisible(group.id)}
						<div class="flex flex-col divide-y divide-border border-t border-border">
							{#each group.metrics as metric (metric.key)}
								<div class="flex items-center justify-between gap-4 py-2">
									<div class="flex min-w-0 flex-col">
										<Label for="sensor-{metric.key}" class="truncate">{metric.label}</Label>
										<span class="truncate font-mono text-xs text-muted-foreground">{metric.key}</span>
									</div>
									<Switch
										id="sensor-{metric.key}"
										size="sm"
										checked={isMetricVisible(metric)}
										disabled={!isAdmin || saving}
										onCheckedChange={(v) => setMetricVisible(metric.key, v)}
									/>
								</div>
							{/each}
						</div>
					{:else}
						<p class="text-xs text-muted-foreground">{m.settings_sensors_group_hidden()}</p>
					{/if}
				</div>
			{/each}
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
