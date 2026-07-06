#!/usr/bin/env node
// Distribute canonical brand assets from packages/brand into the app locations
// that must hold a physical file (Astro's asset pipeline and static-served
// favicons). The web app imports `@SunReye/brand/logo.svg` directly, so it is
// not copied here. Run from the repo root: `bun run sync:brand`.
import { copyFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = (name) => join(root, "packages/brand", name);

const targets = [
  ["logo.svg", "apps/docs/src/assets/logo.svg"],
  ["mark.svg", "apps/docs/public/favicon.svg"],
  ["mark.svg", "apps/web/static/favicon.svg"],
];

for (const [from, to] of targets) {
  await copyFile(src(from), join(root, to));
  console.log(`brand: ${from} -> ${to}`);
}
