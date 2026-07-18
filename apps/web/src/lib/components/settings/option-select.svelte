<script lang="ts">
	import * as Select from '$lib/components/ui/select';
	import * as m from '$lib/paraglide/messages';

	let {
		value,
		items,
		onchange,
		placeholder = m.option_select_placeholder(),
		triggerClass
	}: {
		value: string;
		items: { value: string; label: string }[];
		onchange: (value: string) => void;
		/** Trigger text when `value` matches no item. */
		placeholder?: string;
		triggerClass?: string;
	} = $props();

	const current = $derived(items.find((i) => i.value === value)?.label ?? placeholder);
</script>

<Select.Root type="single" {value} onValueChange={onchange}>
	<Select.Trigger class={triggerClass}>{current}</Select.Trigger>
	<Select.Content>
		{#each items as i (i.value)}
			<Select.Item value={i.value}>{i.label}</Select.Item>
		{/each}
	</Select.Content>
</Select.Root>
