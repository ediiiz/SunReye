---
title: Scripts
description: The workspace commands you'll use to develop, build, and operate SunReye.
---

All commands run from the repo root with [bun](https://bun.sh/). Turborepo fans them out
across the workspace.

## Develop

| Script | Description |
| --- | --- |
| `bun run dev` | Start all apps + DB in dev mode. |
| `bun run dev:web` | Start only the web dashboard. |
| `bun run dev:server` | Start only the core engine. |
| `bun run preview` | Preview built web + server. |

## Build & check

| Script | Description |
| --- | --- |
| `bun run build` | Build all apps. |
| `bun run check-types` | TypeScript type-check across the monorepo. |
| `bun run check` | Oxlint + Oxfmt (lint and format). |

## Database

| Script | Description |
| --- | --- |
| `bun run db:start` | Start the local TimescaleDB container. |
| `bun run db:watch` | Tail the DB container logs. |
| `bun run db:stop` / `db:down` | Stop / remove the DB container. |
| `bun run db:push` | Push the Drizzle schema to the database (local prototyping only — releases ship migrations). |
| `bun run db:timescale` | Apply the TimescaleDB pipeline (journaled structural files + policies). |
| `bun run db:generate` | Generate a Drizzle migration from schema changes — required before a schema change ships. |
| `bun run db:migrate` | Run the full migration runner (downgrade guard, baseline stamping, drizzle migrations, TimescaleDB pipeline) — what production runs. |
| `bun run db:studio` | Open Drizzle Studio. |

## Docker

| Script | Description |
| --- | --- |
| `bun run docker:build` | Build the Compose images. |
| `bun run docker:up` | Build & start the full stack (detached). |
| `bun run docker:logs` | Tail Compose logs. |
| `bun run docker:down` | Stop the stack. |

## Profiles

| Command | Description |
| --- | --- |
| `bunx profile validate <file>` | Validate a `ProfileData` JSON file. |
| `bunx profile coverage <file>` | Report which canonical roles a profile maps. |
| `bunx profile scaffold <csv>` | Generate a starter profile from a register-table CSV. |

See [Authoring a Profile](/profiles/authoring/) for the profile toolchain.

## Misc

| Script | Description |
| --- | --- |
| `bun run prepare` | Initialize Git hooks (Husky). |
