<script lang="ts">
	import { Badge } from '$lib/components/ui/badge';

	// Small connection-state pill: green when healthy, muted otherwise.
	let { ok = false, label }: { ok?: boolean; label: string } = $props();
</script>

<Badge variant={ok ? 'default' : 'secondary'} class={ok ? 'bg-emerald-500 text-white' : ''}>
	<span class="mr-1.5 inline-block size-1.5 rounded-full {ok ? 'bg-white' : 'bg-muted-foreground'}"
	></span>
	{label}
</Badge>
