<script lang="ts">
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { Switch } from '$lib/components/ui/switch';
	import { Label } from '$lib/components/ui/label';
	import SettingsSection from './settings-section.svelte';
	import { api } from '$lib/api';
	import { useAppSession } from '$lib/session';

	const session = useAppSession();
	const isAdmin = $derived($session.data?.user.role === 'admin');

	let publicDashboard = $state<boolean | null>(null);
	let saving = $state(false);

	onMount(async () => {
		const { data } = await api.api.settings.access.get();
		if (data) publicDashboard = data.publicDashboard;
	});

	async function toggle(next: boolean) {
		if (publicDashboard === null) return;
		const prev = publicDashboard;
		publicDashboard = next; // optimistic
		saving = true;
		const { error } = await api.api.settings.access.put({ publicDashboard: next });
		saving = false;
		if (error) {
			publicDashboard = prev; // revert on failure
			toast.error('Failed to update access setting');
		} else {
			toast.success(next ? 'Public dashboard enabled' : 'Public dashboard disabled');
		}
	}
</script>

<SettingsSection title="Access">
	{#if publicDashboard === null}
		<p class="text-sm text-muted-foreground">Loading…</p>
	{:else}
		<div class="flex items-start justify-between gap-4">
			<div class="flex flex-col gap-1">
				<Label for="public-dashboard">Public read-only dashboard</Label>
				<p class="max-w-prose text-sm text-muted-foreground">
					Let anyone view the live dashboard without signing in — for wall displays and kiosks. The
					dashboard is read-only: changing settings and controlling the inverter still require an
					admin login.
				</p>
			</div>
			<Switch
				id="public-dashboard"
				checked={publicDashboard}
				disabled={!isAdmin || saving}
				onCheckedChange={toggle}
			/>
		</div>
		{#if !isAdmin}
			<span class="text-xs text-muted-foreground">Only admins can change this setting.</span>
		{/if}
	{/if}
</SettingsSection>
