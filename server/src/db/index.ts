import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "../env.js";
import * as schema from "./schema/index.js";

function createDb() {
  const client = postgres(env.DATABASE_URL, { max: 10 });
  return drizzle(client, { schema, casing: "snake_case" });
}

type Db = ReturnType<typeof createDb>;

let db: Db | undefined;

export function getDb(): Db {
  db ??= createDb();
  return db;
}
