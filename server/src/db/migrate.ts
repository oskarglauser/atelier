import path from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { env } from "../env.js";

/**
 * Applies pending migrations from ./drizzle. Runs at server start, so a deploy
 * migrates itself and the health check only passes once it has.
 */
export async function runMigrations() {
  // Resolve relative to this file rather than the working directory: in the
  // container the app is started from /app, but during `tsx watch` it is not.
  const here = path.dirname(fileURLToPath(import.meta.url));
  const folder = path.resolve(here, "../../drizzle");

  const client = postgres(env.DATABASE_URL, { max: 1, onnotice: () => {} });
  try {
    await migrate(drizzle(client), { migrationsFolder: folder });
  } finally {
    await client.end();
  }
}
