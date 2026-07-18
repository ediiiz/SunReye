import { paraglideVitePlugin } from "@inlang/paraglide-js";
import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { paraglideOptions } from "./i18n.config";

export default defineConfig({
  plugins: [
    tailwindcss(),
    // i18n (Paraglide). Options are shared with the compile script in
    // ./i18n.config.ts; see there for the SPA/hash-router constraints.
    paraglideVitePlugin(paraglideOptions),
    sveltekit(),
  ],
  // Expose PUBLIC_ vars on `import.meta.env` (Vite only exposes VITE_ by
  // default) for any future build-time vars in the `@SunReye/env/web` schema.
  // Runtime vars (PUBLIC_SERVER_URL) go through $env/dynamic/public instead.
  envPrefix: ["VITE_", "PUBLIC_"],
  // LayerChart ships raw .svelte files; bundle it for SSR so Node doesn't try
  // to import .svelte directly (ERR_UNKNOWN_FILE_EXTENSION).
  ssr: {
    noExternal: ["layerchart"],
  },
  // Dev is same-origin like production deployments: the client resolves its
  // API base from the document URL (see src/lib/server-url.ts), so proxy the
  // engine surface to the core server instead of hitting it cross-origin.
  server: {
    proxy: {
      "/api": "http://localhost:3000",
      "/openapi": "http://localhost:3000",
      "/ws": { target: "ws://localhost:3000", ws: true },
    },
  },
});
