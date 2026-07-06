<script lang="ts">
	// In-app SunReye mark. Flat + monochrome: draws in `currentColor` so it takes
	// the app palette (e.g. `text-primary`) and sits cleanly among the phosphor
	// line-icons and the sharp, cool industrial console. Same geometry as the
	// fixed-color files in @SunReye/brand (docs + favicons).
	let { class: className = 'size-8' }: { class?: string } = $props();
</script>

<svg
	class={className}
	viewBox="0 0 48 48"
	fill="none"
	role="img"
	aria-label="SunReye"
	xmlns="http://www.w3.org/2000/svg"
>
	<g class="rays" stroke="currentColor" stroke-width="2.4" stroke-linecap="round">
		<line x1="24" y1="4" x2="24" y2="9.5" />
		<line x1="24" y1="38.5" x2="24" y2="44" />
		<line x1="4" y1="24" x2="9.5" y2="24" />
		<line x1="38.5" y1="24" x2="44" y2="24" />
		<line x1="10.1" y1="10.1" x2="14" y2="14" />
		<line x1="34" y1="34" x2="37.9" y2="37.9" />
		<line x1="37.9" y1="10.1" x2="34" y2="14" />
		<line x1="14" y1="34" x2="10.1" y2="37.9" />
	</g>
	<circle cx="24" cy="24" r="8" fill="currentColor" />
</svg>

<style>
	.rays {
		transform-box: view-box;
		transform-origin: center;
		animation: spin 44s linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.rays {
			animation: none;
		}
	}
</style>
