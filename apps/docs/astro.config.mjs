import starlight from "@astrojs/starlight";
// @ts-check
import { defineConfig } from "astro/config";

const github = "https://github.com/ediiiz/SunReye";

// https://astro.build/config
export default defineConfig({
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
