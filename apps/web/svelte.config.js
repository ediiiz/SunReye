import adapter from "@sveltejs/adapter-node";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

/** @type {import('@sveltejs/kit').Config} */
const config = {
  // Consult https://svelte.dev/docs/kit/integrations
  // for more information about preprocessors
  preprocess: vitePreprocess(),

  kit: {
    // adapter-node builds a standalone Node server (run with `node build/index.js`).
    adapter: adapter(),
    // Hash-based routing keeps the document URL pinned to wherever the app was
    // served from, so the same build works at `/`, behind a direct port, and
    // behind a path-prefixed reverse proxy (Home Assistant ingress serves the
    // app at /api/hassio_ingress/<token>/ — absolute-path navigation would
    // escape the prefix). Implies SSR off and requires a single client bundle.
    // Constraint: no +page.server.ts/+layout.server.ts or per-page options may
    // be added — all data flows through the Eden treaty client.
    router: { type: "hash" },
    output: { bundleStrategy: "single" },
  },
};

export default config;
