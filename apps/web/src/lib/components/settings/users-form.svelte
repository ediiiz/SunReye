<script lang="ts">
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { authClient } from '$lib/auth-client';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Table from '$lib/components/ui/table';
	import OptionSelect from './option-select.svelte';
	import SettingsSection from './settings-section.svelte';
	import PlusIcon from 'phosphor-svelte/lib/Plus';
	import TrashIcon from 'phosphor-svelte/lib/Trash';

	type Role = 'user' | 'admin';
	type Row = { id: string; name: string; email: string; role?: string | null };

	const ROLES: { value: Role; label: string }[] = [
		{ value: 'user', label: 'User' },
		{ value: 'admin', label: 'Admin' }
	];
	let users = $state<Row[]>([]);
	let loading = $state(true);

	// New-user form.
	let name = $state('');
	let email = $state('');
	let password = $state('');
	let role = $state<Role>('user');
	let creating = $state(false);

	async function load() {
		loading = true;
		const { data, error } = await authClient.admin.listUsers({ query: { limit: 100 } });
		if (error) toast.error('Failed to load users');
		else users = (data?.users ?? []) as Row[];
		loading = false;
	}

	onMount(load);

	async function create(e: SubmitEvent) {
		e.preventDefault();
		creating = true;
		const { error } = await authClient.admin.createUser({ name, email, password, role });
		creating = false;
		if (error) {
			toast.error(error.message ?? 'Failed to create user');
			return;
		}
		toast.success(`Created ${email}`);
		name = email = password = '';
		role = 'user';
		await load();
	}

	async function setRole(userId: string, next: Role) {
		const { error } = await authClient.admin.setRole({ userId, role: next });
		if (error) toast.error('Failed to update role');
		else {
			toast.success('Role updated');
			await load();
		}
	}

	async function remove(userId: string, label: string) {
		if (!confirm(`Remove ${label}? This cannot be undone.`)) return;
		const { error } = await authClient.admin.removeUser({ userId });
		if (error) toast.error('Failed to remove user');
		else {
			toast.success('User removed');
			await load();
		}
	}
</script>

<SettingsSection title="Add user">
	<form class="grid items-end gap-3 sm:grid-cols-[1fr_1fr_1fr_auto_auto]" onsubmit={create}>
		<div class="flex flex-col gap-1.5">
			<Label for="u-name">Name</Label>
			<Input id="u-name" bind:value={name} required />
		</div>
		<div class="flex flex-col gap-1.5">
			<Label for="u-email">Email</Label>
			<Input id="u-email" type="email" autocomplete="off" bind:value={email} required />
		</div>
		<div class="flex flex-col gap-1.5">
			<Label for="u-password">Password</Label>
			<Input
				id="u-password"
				type="password"
				autocomplete="new-password"
				minlength={8}
				bind:value={password}
				required
			/>
		</div>
		<div class="flex flex-col gap-1.5">
			<Label>Role</Label>
			<OptionSelect
				value={role}
				items={ROLES}
				onchange={(v) => (role = v as Role)}
				placeholder="User"
				triggerClass="w-28"
			/>
		</div>
		<Button type="submit" disabled={creating}>
			<PlusIcon class="size-4" />
			{creating ? 'Adding…' : 'Add'}
		</Button>
	</form>
</SettingsSection>

<SettingsSection title="Users">
	{#if loading}
		<p class="text-sm text-muted-foreground">Loading users…</p>
	{:else}
		<Table.Root>
			<Table.Header>
				<Table.Row>
					<Table.Head>Name</Table.Head>
					<Table.Head>Email</Table.Head>
					<Table.Head class="w-32">Role</Table.Head>
					<Table.Head class="w-12"></Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each users as u (u.id)}
					<Table.Row>
						<Table.Cell class="font-medium">{u.name}</Table.Cell>
						<Table.Cell class="text-muted-foreground">{u.email}</Table.Cell>
						<Table.Cell>
							<OptionSelect
								value={u.role ?? 'user'}
								items={ROLES}
								onchange={(v) => setRole(u.id, v as Role)}
								placeholder="User"
								triggerClass="w-28"
							/>
						</Table.Cell>
						<Table.Cell>
							<Button
								variant="ghost"
								size="icon"
								onclick={() => remove(u.id, u.email)}
								aria-label="Remove user"
							>
								<TrashIcon class="size-4" />
							</Button>
						</Table.Cell>
					</Table.Row>
				{/each}
			</Table.Body>
		</Table.Root>
	{/if}
</SettingsSection>
