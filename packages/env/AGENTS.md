# packages/env

Single source of truth for env vars.

## What it is

- `src/web.ts` = public/browser-safe env schema.
- `src/server.ts` = private server env schema.
- Uses `@t3-oss/env-core` + `zod` to validate env at import time.

## How it works

- Add every new env var here first.
- Do not create app-local or package-local env schemas.
- Apps/packages import from `@sveltekit-convex-shadcn-monorepo-starter/env/web` or `@sveltekit-convex-shadcn-monorepo-starter/env/server`.
- Add vars to file that owns them.
- Public vars must start `PUBLIC_`.
- Keep browser-safe and server-only vars split.
- `runtimeEnv` reads real process/import env, schema validates shape.
- If no server vars needed, keep `server: {}`. Preserve package export, add vars later.

## Example envs

`apps/web/.env.example`

```bash
PUBLIC_CONVEX_URL=http://127.0.0.1:3220
```

## Rules

- Add only vars app actually uses.
- Delete dead vars fast.
- No duplicate env vars, no duplicate schemas, no direct `process.env` validation outside this package.
- If export paths change, update `package.json` too.
