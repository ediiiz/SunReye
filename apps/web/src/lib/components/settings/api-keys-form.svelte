<script lang="ts">
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { api } from '$lib/api';
	import { authClient } from '$lib/auth-client';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Select from '$lib/components/ui/select';
	import * as Table from '$lib/components/ui/table';
	import CopyIcon from 'phosphor-svelte/lib/Copy';
	import PlusIcon from 'phosphor-svelte/lib/Plus';
	import TrashIcon from 'phosphor-svelte/lib/Trash';

	type KeyRow = {
		id: string;
		name: string | null;
		prefix: string | null;
		start: string | null;
		enabled: boolean;
		expiresAt: string | null;
		lastRequest: string | null;
		createdAt: string;
		userId: string;
		userEmail: string;
		userName: string;
	};
	type UserRow = { id: string; name: string; email: string };

	// Expiry presets → seconds (null = never expires).
	const EXPIRY: { value: string; label: string; seconds: number | null }[] = [
		{ value: 'never', label: 'Never', seconds: null },
		{ value: '30d', label: '30 days', seconds: 30 * 86400 },
		{ value: '90d', label: '90 days', seconds: 90 * 86400 },
		{ value: '1y', label: '1 year', seconds: 365 * 86400 }
	];

	let users = $state<UserRow[]>([]);
	let keys = $state<KeyRow[]>([]);
	let loading = $state(true);

	// Issue-key form.
	let ownerId = $state('');
	let name = $state('');
	let expiry = $state('never');
	let creating = $state(false);

	// List filter ('' = all users).
	let filterUserId = $state('');

	// One-time secret reveal.
	let createdKey = $state<string | null>(null);

	const userLabel = (id: string) => users.find((u) => u.id === id)?.email ?? 'Select user';
	const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleDateString() : '—');

	async function loadUsers() {
		const { data, error } = await authClient.admin.listUsers({ query: { limit: 100 } });
		if (error) toast.error('Failed to load users');
		else users = (data?.users ?? []) as UserRow[];
	}

	async function loadKeys() {
		loading = true;
		const { data, error } = await api.api.admin['api-keys'].get({
			query: filterUserId ? { userId: filterUserId } : {}
		});
		if (error) toast.error('Failed to load API keys');
		else keys = (data ?? []) as KeyRow[];
		loading = false;
	}

	onMount(async () => {
		await Promise.all([loadUsers(), loadKeys()]);
	});

	async function create(e: SubmitEvent) {
		e.preventDefault();
		if (!ownerId) {
			toast.error('Pick a user for the key');
			return;
		}
		creating = true;
		const seconds = EXPIRY.find((x) => x.value === expiry)?.seconds ?? null;
		const { data, error } = await api.api.admin['api-keys'].post({
			userId: ownerId,
			name,
			expiresIn: seconds
		});
		creating = false;
		if (error) {
			toast.error((error.value as { message?: string })?.message ?? 'Failed to create key');
			return;
		}
		createdKey = data?.key ?? null;
		name = '';
		expiry = 'never';
		await loadKeys();
	}

	async function revoke(id: string, label: string) {
		if (!confirm(`Revoke key "${label}"? Applications using it will stop working.`)) return;
		const { error } = await api.api.admin['api-keys'].revoke.post({ id });
		if (error) toast.error('Failed to revoke key');
		else {
			toast.success('Key revoked');
			await loadKeys();
		}
	}

	async function copyKey() {
		if (!createdKey) return;
		await navigator.clipboard.writeText(createdKey);
		toast.success('Copied to clipboard');
	}
</script>

<section class="flex flex-col gap-4 border border-border p-4">
	<h2 class="text-sm font-medium uppercase tracking-wide text-muted-foreground">Issue key</h2>
	<form class="grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto_auto]" onsubmit={create}>
		<div class="flex flex-col gap-1.5">
			<Label>User</Label>
			<Select.Root type="single" value={ownerId} onValueChange={(v) => (ownerId = v)}>
				<Select.Trigger class="w-full">{userLabel(ownerId)}</Select.Trigger>
				<Select.Content>
					{#each users as u (u.id)}
						<Select.Item value={u.id}>{u.email}</Select.Item>
					{/each}
				</Select.Content>
			</Select.Root>
		</div>
		<div class="flex flex-col gap-1.5">
			<Label for="k-name">Name</Label>
			<Input id="k-name" bind:value={name} placeholder="e.g. Grafana" required />
		</div>
		<div class="flex flex-col gap-1.5">
			<Label>Expires</Label>
			<Select.Root type="single" value={expiry} onValueChange={(v) => (expiry = v)}>
				<Select.Trigger class="w-32">
					{EXPIRY.find((x) => x.value === expiry)?.label ?? 'Never'}
				</Select.Trigger>
				<Select.Content>
					{#each EXPIRY as e (e.value)}
						<Select.Item value={e.value}>{e.label}</Select.Item>
					{/each}
				</Select.Content>
			</Select.Root>
		</div>
		<Button type="submit" disabled={creating}>
			<PlusIcon class="size-4" />
			{creating ? 'Creating…' : 'Create'}
		</Button>
	</form>
</section>

<section class="flex flex-col gap-4 border border-border p-4">
	<div class="flex items-center justify-between gap-4">
		<h2 class="text-sm font-medium uppercase tracking-wide text-muted-foreground">API keys</h2>
		<Select.Root
			type="single"
			value={filterUserId}
			onValueChange={(v) => {
				filterUserId = v;
				loadKeys();
			}}
		>
			<Select.Trigger class="w-48">
				{filterUserId ? userLabel(filterUserId) : 'All users'}
			</Select.Trigger>
			<Select.Content>
				<Select.Item value="">All users</Select.Item>
				{#each users as u (u.id)}
					<Select.Item value={u.id}>{u.email}</Select.Item>
				{/each}
			</Select.Content>
		</Select.Root>
	</div>
	{#if loading}
		<p class="text-sm text-muted-foreground">Loading API keys…</p>
	{:else if keys.length === 0}
		<p class="text-sm text-muted-foreground">No API keys yet.</p>
	{:else}
		<Table.Root>
			<Table.Header>
				<Table.Row>
					<Table.Head>Name</Table.Head>
					<Table.Head>Owner</Table.Head>
					<Table.Head>Key</Table.Head>
					<Table.Head class="w-24">Created</Table.Head>
					<Table.Head class="w-24">Expires</Table.Head>
					<Table.Head class="w-12"></Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each keys as k (k.id)}
					<Table.Row>
						<Table.Cell class="font-medium">{k.name ?? '—'}</Table.Cell>
						<Table.Cell class="text-muted-foreground">{k.userEmail}</Table.Cell>
						<Table.Cell class="font-mono text-xs text-muted-foreground">
							{k.start ?? k.prefix ?? ''}…
						</Table.Cell>
						<Table.Cell class="text-muted-foreground">{fmtDate(k.createdAt)}</Table.Cell>
						<Table.Cell class="text-muted-foreground">{fmtDate(k.expiresAt)}</Table.Cell>
						<Table.Cell>
							<Button
								variant="ghost"
								size="icon"
								onclick={() => revoke(k.id, k.name ?? k.userEmail)}
								aria-label="Revoke key"
							>
								<TrashIcon class="size-4" />
							</Button>
						</Table.Cell>
					</Table.Row>
				{/each}
			</Table.Body>
		</Table.Root>
	{/if}
</section>

<Dialog.Root open={createdKey !== null} onOpenChange={(o) => !o && (createdKey = null)}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Copy your API key</Dialog.Title>
			<Dialog.Description>
				This is the only time the full key is shown. Store it somewhere safe.
			</Dialog.Description>
		</Dialog.Header>
		<div class="flex items-center gap-2">
			<Input readonly value={createdKey ?? ''} class="font-mono text-xs" />
			<Button variant="outline" size="icon" onclick={copyKey} aria-label="Copy key">
				<CopyIcon class="size-4" />
			</Button>
		</div>
		<Dialog.Footer>
			<Button onclick={() => (createdKey = null)}>Done</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
