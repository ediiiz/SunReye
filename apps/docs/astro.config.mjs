import starlight from "@astrojs/starlight";
// @ts-check
import { defineConfig } from "astro/config";

const github = "https://github.com/ediiiz/SunReye";

// GitHub Pages project site: https://ediiiz.github.io/SunReye/
// If a custom domain is ever configured, set `base: "/"` (or drop it) and point
// `site` at the domain.
const site = "https://ediiiz.github.io";
const base = "/SunReye";

// Starlight's own nav/sidebar links are base-aware, but hand-written
// root-absolute markdown links (e.g. `[Settings](/use/settings/)`) are not
// rewritten by Astro. This rehype plugin prepends `base` to them at build time
// so every internal link works under the `/SunReye/` path prefix without
// touching the content.
const prefix = base.replace(/\/$/, "");
function rehypeBaseAbsoluteLinks() {
  const rewrite = (href) =>
    typeof href === "string" &&
    href.startsWith("/") &&
    !href.startsWith("//") &&
    href !== prefix &&
    !href.startsWith(`${prefix}/`)
      ? prefix + href
      : href;
  const walk = (node) => {
    if (node.type === "element" && node.tagName === "a" && node.properties) {
      node.properties.href = rewrite(node.properties.href);
    }
    for (const child of node.children ?? []) walk(child);
  };
  return (tree) => walk(tree);
}

// https://astro.build/config
export default defineConfig({
  site,
  base,
  markdown: {
    rehypePlugins: [rehypeBaseAbsoluteLinks],
  },
  integrations: [
    starlight({
      title: "SunReye",
      description:
        "Self-hosted monitoring, control, and integration platform for solar / hybrid inverters. An inverter is data, not code.",
      logo: {
        src: "./src/assets/logo.svg",
        alt: "SunReye",
        replacesTitle: false,
      },
      social: [{ icon: "github", label: "GitHub", href: github }],
      editLink: {
        baseUrl: `${github}/edit/master/apps/docs/`,
      },
      customCss: ["./src/styles/theme.css"],
      sidebar: [
        {
          label: "Start Here",
          items: [
            { label: "Introduction", slug: "start/introduction" },
            { label: "Architecture", slug: "start/architecture" },
            { label: "Quick Start", slug: "start/quick-start" },
          ],
        },
        {
          label: "Install & Deploy",
          items: [
            { label: "Requirements", slug: "deploy/requirements" },
            { label: "Manual Setup", slug: "deploy/manual-setup" },
            { label: "Docker Compose", slug: "deploy/docker" },
          ],
        },
        {
          label: "Using SunReye",
          items: [
            { label: "Dashboard", slug: "use/dashboard" },
            { label: "History & Analytics", slug: "use/history" },
            { label: "Controls", slug: "use/controls" },
            { label: "Costs & Tariffs", slug: "use/costs" },
            { label: "Settings", slug: "use/settings" },
            { label: "Users & Roles", slug: "use/users" },
          ],
        },
        {
          label: "Integrations",
          items: [
            { label: "REST API", slug: "integrations/rest-api" },
            { label: "MQTT Bridge", slug: "integrations/mqtt" },
            { label: "Home Assistant", slug: "integrations/home-assistant" },
          ],
        },
        {
          label: "Inverter Profiles",
          items: [
            { label: "Profiles as Data", slug: "profiles/concept" },
            { label: "Supported Inverters", slug: "profiles/supported" },
            { label: "Authoring a Profile", slug: "profiles/authoring" },
            { label: "Distributing Profiles", slug: "profiles/distribution" },
          ],
        },
        {
          label: "Reference",
          items: [
            { label: "Environment Variables", slug: "reference/environment" },
            { label: "Scripts", slug: "reference/scripts" },
            { label: "Architecture Deep-Dive", slug: "reference/internals" },
            { label: "Roadmap", slug: "reference/roadmap" },
          ],
        },
        {
          label: "Contributing",
          items: [{ label: "Contributing", slug: "contributing" }],
        },
      ],
    }),
  ],
});
