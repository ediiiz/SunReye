/**
 * Scaffold a new profile-authoring project: the layout an author works in to
 * define profiles as code and then `profile build` into an installable repo.
 * Pure — returns the file set as data; the CLI (`cmdInit`) decides where to
 * write it and whether to install deps / init git.
 */

export interface InitOptions {
  /** package.json `name` for the authoring project. */
  packageName: string;
  /** Display name baked into the `build` script (becomes `index.json.name`). */
  repoName: string;
  /** Optional maintainer baked into the `build` script (`index.json.maintainer`). */
  maintainer?: string;
  /** The starter profile stub written to `src/profiles.ts`. */
  profile: { id: string; name: string; manufacturer: string };
  /** Version of `@sunreye/profile-sdk` to depend on (usually the running CLI's). */
  sdkVersion: string;
}

/**
 * Build the file set for a new authoring project. Keys are repo-relative paths;
 * values are file contents (each newline-terminated to match `buildRepo`).
 */
export function scaffoldProject(opts: InitOptions): Record<string, string> {
  const { packageName, repoName, maintainer, profile, sdkVersion } = opts;
  const esc = (s: string) => s.replace(/"/g, '\\"');
  const buildCmd =
    `profile build ./src/profiles.ts --out . --name "${esc(repoName)}"` +
    (maintainer ? ` --maintainer "${esc(maintainer)}"` : "");

  const pkg = {
    name: packageName,
    version: "0.1.0",
    private: true,
    type: "module",
    scripts: {
      build: buildCmd,
    },
    devDependencies: {
      "@sunreye/profile-sdk": `^${sdkVersion}`,
      "@types/bun": "latest",
      typescript: "^5",
    },
  };

  const tsconfig = {
    compilerOptions: {
      target: "ESNext",
      module: "ESNext",
      moduleResolution: "bundler",
      strict: true,
      skipLibCheck: true,
      noEmit: true,
      types: ["bun"],
    },
    include: ["src"],
  };

  return {
    "package.json": `${JSON.stringify(pkg, null, 2)}\n`,
    "tsconfig.json": `${JSON.stringify(tsconfig, null, 2)}\n`,
    ".gitignore": ["node_modules", "*.log", ""].join("\n"),
    "README.md": readmeTemplate(packageName, repoName),
    "src/profiles.ts": profilesTemplate(profile),
  };
}

/** Derive a safe JS identifier from a profile id, e.g. `acme-hybrid` → `acmeHybrid`. */
export function toIdentifier(id: string): string {
  const parts = id.split(/[^a-zA-Z0-9]+/).filter(Boolean);
  if (parts.length === 0) return "profile";
  const camel =
    parts[0]!.replace(/^[0-9]+/, "") +
    parts
      .slice(1)
      .map((p) => p[0]!.toUpperCase() + p.slice(1))
      .join("");
  return /^[a-zA-Z_$]/.test(camel) ? camel : `p${camel}`;
}

/** Title-case a profile id for a default display name, e.g. `acme-hybrid` → `Acme Hybrid`. */
export function titleFromId(id: string): string {
  const words = id
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((p) => p[0]!.toUpperCase() + p.slice(1));
  return words.length > 0 ? words.join(" ") : id;
}

function profilesTemplate(profile: InitOptions["profile"]): string {
  const ident = toIdentifier(profile.id);
  const modelId = `${profile.id}-lite`;
  return [
    `import { defineFamily, metric } from "@sunreye/profile-sdk";`,
    ``,
    `// A family = one shared register map + per-model tweaks. Picking a role forces`,
    `// you to supply exactly what that role needs, or this won't compile. Each entry`,
    `// in 'models' becomes its own self-contained profile (keyed by its id), so a`,
    `// user picks their exact model in the UI and its limits follow. Run`,
    `// 'bun run build' to emit an installable repo (index.json + profiles/*.json).`,
    `//`,
    `// defineFamily returns [base, ...models]; exporting it lets 'profile build' pick`,
    `// up every profile at once.`,
    `export const ${ident} = defineFamily({`,
    `  id: ${JSON.stringify(profile.id)},`,
    `  name: ${JSON.stringify(profile.name)},`,
    `  manufacturer: ${JSON.stringify(profile.manufacturer)},`,
    `  version: "0.1.0",`,
    `  metrics: [`,
    `    metric("dc/pv1/power", {`,
    `      label: "PV1 Power",`,
    `      group: "solar",`,
    `      role: "pv.string.power",`,
    `      index: 1,`,
    `      addr: 672,`,
    `      unit: "W",`,
    `    }),`,
    `    metric("dc/pv2/power", {`,
    `      label: "PV2 Power",`,
    `      group: "solar",`,
    `      role: "pv.string.power",`,
    `      index: 2,`,
    `      addr: 673,`,
    `      unit: "W",`,
    `    }),`,
    `    metric("battery/soc", {`,
    `      label: "Battery SoC",`,
    `      group: "battery",`,
    `      role: "battery.soc",`,
    `      addr: 588,`,
    `      unit: "%",`,
    `    }),`,
    `    metric("settings/battery/maximum_discharge_current", {`,
    `      label: "Max battery discharge current",`,
    `      group: "settings",`,
    `      role: "setting.battery.max_discharge_current",`,
    `      access: "rw",`,
    `      addr: 109,`,
    `      unit: "A",`,
    `      range: { min: 0, max: 300 }, // generic ceiling; models tighten it below`,
    `    }),`,
    `  ],`,
    `  // Keys autocomplete from the base map; a mistyped patch/remove target`,
    `  // throws when you 'bun run build'.`,
    `  models: {`,
    `    // A smaller SKU: one PV string, a lower discharge ceiling.`,
    `    ${JSON.stringify(modelId)}: {`,
    `      name: ${JSON.stringify(`${profile.name} Lite`)},`,
    `      metrics: {`,
    `        "dc.pv2.power": null, // drop a PV string -> capabilities show 1`,
    `        "settings.battery.maximum_discharge_current": { max: 120 }, // 0-120 A slider + write clamp`,
    `      },`,
    `    },`,
    `  },`,
    `});`,
    ``,
  ].join("\n");
}

function readmeTemplate(packageName: string, repoName: string): string {
  return [
    `# ${repoName}`,
    ``,
    `SunReye inverter profiles authored with [\`@sunreye/profile-sdk\`](https://github.com/SunReye/SunReye/tree/master/packages/profile-sdk).`,
    ``,
    `## Develop`,
    ``,
    "```sh",
    `bun install`,
    `bun run build   # validate every profile in src/profiles.ts and emit index.json + profiles/*.json`,
    "```",
    ``,
    `Edit \`src/profiles.ts\` — every profile you export is picked up, including each`,
    `model of a \`defineFamily(...)\` (one self-contained profile per SKU). \`bun run build\``,
    `validates them and writes the installable repo layout into this directory.`,
    ``,
    `## Publish`,
    ``,
    `Commit \`index.json\` and \`profiles/*.json\`, push to a public git repo, then install`,
    `it in SunReye from Settings → Profiles.`,
    ``,
    `_Scaffolded by \`profile init\` into \`${packageName}\`._`,
    ``,
  ].join("\n");
}
