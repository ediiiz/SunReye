# SunReye Docs

The documentation site for [SunReye](../../README.md), built with
[Astro Starlight](https://starlight.astro.build/).

## Develop

```bash
bun dev        # local dev server at http://localhost:4321
bun build      # build the static site to ./dist/
bun preview    # preview the build
```

Run from this directory, or from the repo root with `-F docs`.

## Structure

- Pages are Markdown / MDX under `src/content/docs/`. Each file is a route based on its path.
- The sidebar and site config live in `astro.config.mjs`.
- Brand styling is in `src/styles/theme.css`; assets in `src/assets/`.

When adding a page, create the Markdown file **and** add it to the `sidebar` in
`astro.config.mjs` (Starlight validates that sidebar slugs resolve to real pages at build
time).
