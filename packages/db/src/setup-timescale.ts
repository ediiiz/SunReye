import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { Client } from "pg";

// Load the server env file before importing the env schema, so this works when
// run via turbo (CWD = packages/db) the same way `drizzle.config.ts` does.
dotenv.config({ path: fileURLToPath(new URL("../../../apps/server/.env", import.meta.url)) });
const { env } = await import("@ReyeON/env/server");

/**
 * Applies the TimescaleDB DDL (hypertable + continuous aggregates + policies)
 * that drizzle-kit cannot generate. Run once after `db:push`:
 *
 *   bun run db:timescale
 */
async function main() {
  const sqlPath = join(dirname(fileURLToPath(import.meta.url)), "timescale.sql");
  const statements = readFileSync(sqlPath, "utf8")
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.split("\n").every((line) => line.trim().startsWith("--")));

  const client = new Client({ connectionString: env.DATABASE_URL });
  await client.connect();
  try {
    for (const statement of statements) {
      await client.query(statement);
    }
    console.log(`Applied ${statements.length} TimescaleDB statement(s).`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("TimescaleDB setup failed:", error);
  process.exit(1);
});
