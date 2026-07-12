import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { Client } from "pg";

// Load the server env file before importing the env schema, so this works when
// run via turbo (CWD = packages/db) the same way `drizzle.config.ts` does.
dotenv.config({ path: fileURLToPath(new URL("../../../apps/server/.env", import.meta.url)) });
const { env } = await import("@SunReye/env/server");
const { applyTimescale } = await import("./migrate");

/**
 * Applies only the TimescaleDB pipeline (journaled structural files from
 * `timescale/` + the always-reapplied `timescale/policies.sql`) — the same
 * code path `bun run db:migrate` runs after the relational migrations.
 * Standalone entry for local development after a `db:push`:
 *
 *   bun run db:timescale
 */
async function main() {
  const client = new Client({ connectionString: env.DATABASE_URL });
  await client.connect();
  try {
    await applyTimescale(client);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("TimescaleDB setup failed:", error);
  process.exit(1);
});
