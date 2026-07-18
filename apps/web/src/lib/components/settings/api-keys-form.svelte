<script lang="ts">
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { api } from '$lib/api';
	import { authClient } from '$lib/auth-client';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Table from '$lib/components/ui/table';
	import OptionSelect from './option-select.svelte';
	import SettingsSection from './settings-section.svelte';
	import CopyIcon from 'phosphor-svelte/lib/Copy';
	import PlusIcon from 'phosphor-svelte/lib/Plus';
	import TrashIcon from 'phosphor-svelte/lib/Trash';
	import * as m from '$lib/paraglide/messages';

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
		{ value: 'never', label: m.apikeys_expiry_never(), seconds: null },
		{ value: '30d', label: m.apikeys_expiry_30d(), seconds: 30 * 86400 },
		{ value: '90d', label: m.apikeys_expiry_90d(), seconds: 90 * 86400 },
		{ value: '1y', label: m.apikeys_expiry_1y(), seconds: 365 * 86400 }
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

	const userItems = $derived(users.map((u) => ({ value: u.id, label: u.email })));
	const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleDateString() : '—');

	async function loadUsers() {
		const { data, error } = await authClient.admin.listUsers({ query: { limit: 100 } });
		if (error) toast.error(m.users_toast_load_error());
		else users = (data?.users ?? []) as UserRow[];
	}

	async function loadKeys() {
		loading = true;
		const { data, error } = await api.api.admin['api-keys'].get({
			query: filterUserId ? { userId: filterUserId } : {}
		});
		if (error) toast.error(m.apikeys_toast_load_error());
		else keys = (data ?? []) as KeyRow[];
		loading = false;
	}

	onMount(async () => {
		await Promise.all([loadUsers(), loadKeys()]);
	});

	async function create(e: SubmitEvent) {
		e.preventDefault();
		if (!ownerId) {
			toast.error(m.apikeys_toast_pick_user());
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
			toast.error((error.value as { message?: string })?.message ?? m.apikeys_toast_create_error());
			return;
		}
		createdKey = data?.key ?? null;
		name = '';
		expiry = 'never';
		await loadKeys();
	}

	async function revoke(id: string, label: string) {
		if (!confirm(m.apikeys_revoke_confirm({ label }))) return;
		const { error } = await api.api.admin['api-keys'].revoke.post({ id });
		if (error) toast.error(m.apikeys_toast_revoke_error());
		else {
			toast.success(m.apikeys_toast_revoked());
			await loadKeys();
		}
	}

	async function copyKey() {
		if (!createdKey) return;
		await navigator.clipboard.writeText(createdKey);
		toast.success(m.apikeys_toast_copied());
	}
</script>

<SettingsSection title={m.apikeys_issue_title()}>
	<form class="grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto_auto]" onsubmit={create}>
		<div class="flex flex-col gap-1.5">
			<Label>{m.users_role_user()}</Label>
			<OptionSelect
				value={ownerId}
				items={userItems}
				onchange={(v) => (ownerId = v)}
				placeholder={m.apikeys_select_user()}
				triggerClass="w-full"
			/>
		</div>
		<div class="flex flex-col gap-1.5">
			<Label for="k-name">{m.auth_field_name()}</Label>
			<Input id="k-name" bind:value={name} placeholder={m.apikeys_name_placeholder()} required />
		</div>
		<div class="flex flex-col gap-1.5">
			<Label>{m.apikeys_field_expires()}</Label>
			<OptionSelect
				value={expiry}
				items={EXPIRY}
				onchange={(v) => (expiry = v)}
				placeholder={m.apikeys_expiry_never()}
				triggerClass="w-32"
			/>
		</div>
		<Button type="submit" disabled={creating}>
			<PlusIcon class="size-4" />
			{creating ? m.apikeys_creating() : m.apikeys_create()}
		</Button>
	</form>
</SettingsSection>

<SettingsSection title={m.apikeys_list_title()}>
	{#snippet actions()}
		<OptionSelect
			value={filterUserId}
			items={[{ value: '', label: m.apikeys_all_users() }, ...userItems]}
			onchange={(v) => {
				filterUserId = v;
				loadKeys();
			}}
			placeholder={m.apikeys_all_users()}
			triggerClass="w-48"
		/>
	{/snippet}
	{#if loading}
		<p class="text-sm text-muted-foreground">{m.apikeys_loading()}</p>
	{:else if keys.length === 0}
		<p class="text-sm text-muted-foreground">{m.apikeys_empty()}</p>
	{:else}
		<Table.Root>
			<Table.Header>
				<Table.Row>
					<Table.Head>{m.auth_field_name()}</Table.Head>
					<Table.Head>{m.apikeys_col_owner()}</Table.Head>
					<Table.Head>{m.apikeys_col_key()}</Table.Head>
					<Table.Head class="w-24">{m.apikeys_col_created()}</Table.Head>
					<Table.Head class="w-24">{m.apikeys_field_expires()}</Table.Head>
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
								aria-label={m.apikeys_revoke_aria()}
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

<Dialog.Root open={createdKey !== null} onOpenChange={(o) => !o && (createdKey = null)}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>{m.apikeys_dialog_title()}</Dialog.Title>
			<Dialog.Description>
				{m.apikeys_dialog_desc()}
			</Dialog.Description>
		</Dialog.Header>
		<div class="flex items-center gap-2">
			<Input readonly value={createdKey ?? ''} class="font-mono text-xs" />
			<Button variant="outline" size="icon" onclick={copyKey} aria-label={m.apikeys_copy_aria()}>
				<CopyIcon class="size-4" />
			</Button>
		</div>
		<Dialog.Footer>
			<Button onclick={() => (createdKey = null)}>{m.apikeys_done()}</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
