import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  // Expose PUBLIC_ vars on `import.meta.env` (Vite only exposes VITE_ by
  // default) so the shared `@SunReye/env/web` schema can read them.
  envPrefix: ["VITE_", "PUBLIC_"],
  // LayerChart ships raw .svelte files; bundle it for SSR so Node doesn't try
  // to import .svelte directly (ERR_UNKNOWN_FILE_EXTENSION).
  ssr: {
    noExternal: ["layerchart"],
  },
});
