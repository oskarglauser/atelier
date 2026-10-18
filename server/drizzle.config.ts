import { defineConfig } from "drizzle-kit";

try {
  // The repo root holds the .env; the server is a package inside it.
  process.loadEnvFile("../.env");
} catch {
  // No .env file: rely on the shell environment.
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  casing: "snake_case",
  dbCredentials: { url: process.env.DATABASE_URL! },
});
