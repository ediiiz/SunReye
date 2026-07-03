import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "@ReyeON/env/server";
import { Client } from "pg";

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
