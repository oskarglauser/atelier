import { sql } from "drizzle-orm";
import { Hono } from "hono";
import { getDb } from "../db/index.js";

const TIMEOUT_MS = 2000;

/**
 * Coolify's health check. 200 only when the app can actually serve, which
 * means reaching the database — an app that cannot is not healthy just
 * because it is listening.
 */
export const health = new Hono().get("/health", async (c) => {
  try {
    await Promise.race([
      getDb().execute(sql`select 1`),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), TIMEOUT_MS),
      ),
    ]);
    return c.json({ ok: true });
  } catch (error) {
    console.error("[health] database check failed:", error);
    return c.json({ ok: false }, 503);
  }
});
