<script lang="ts">
	import type { Snippet } from 'svelte';
	import Logo from '$lib/components/logo.svelte';

	let { title, subtitle, children }: { title: string; subtitle: string; children: Snippet } =
		$props();
</script>

<div class="relative grid min-h-svh place-items-center overflow-hidden bg-background p-4">
	<!-- Faint blueprint grid; industrial-console backdrop. -->
	<div
		class="pointer-events-none absolute inset-0 opacity-[0.35] bg-[linear-gradient(to_right,var(--color-border)_1px,transparent_1px),linear-gradient(to_bottom,var(--color-border)_1px,transparent_1px)] bg-size-[44px_44px] mask-[radial-gradient(ellipse_at_center,black,transparent_75%)]"
		aria-hidden="true"
	></div>

	<div
		class="relative flex w-full max-w-sm flex-col gap-6 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:duration-500"
	>
		<div class="flex flex-col items-center gap-3 text-center">
			<Logo class="size-12 text-primary" />
			<div>
				<h1 class="text-xl font-semibold tracking-tight">{title}</h1>
				<p class="text-sm text-muted-foreground">{subtitle}</p>
			</div>
		</div>

		{@render children()}
	</div>
</div>
