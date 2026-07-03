import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  // LayerChart ships raw .svelte files; bundle it for SSR so Node doesn't try
  // to import .svelte directly (ERR_UNKNOWN_FILE_EXTENSION).
  ssr: {
    noExternal: ["layerchart"],
  },
});
