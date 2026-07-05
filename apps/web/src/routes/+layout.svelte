<script lang="ts">
	import '../app.css';
	import { ModeWatcher } from 'mode-watcher';
	import { Toaster } from '$lib/components/ui/sonner';

	const { children } = $props();
</script>

<ModeWatcher defaultMode="dark" />
<Toaster />

{@render children()}
