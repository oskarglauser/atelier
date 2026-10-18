import { z } from "zod";
import { features } from "./config.js";

const isProduction = process.env.NODE_ENV === "production";

const optional = z.string().min(1).optional();
const required = z.string().min(1);
const url = z.url().refine((v) => !v.endsWith("/"), "no trailing slash");

/** Required in production when the feature is on; otherwise optional. */
const forFeature = (enabled: boolean) =>
  enabled && isProduction ? required : optional;

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().default(3006),
  APP_URL: url,

  DATABASE_URL: z.url(),

  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: url,
  GOOGLE_CLIENT_ID: forFeature(features.google),
  GOOGLE_CLIENT_SECRET: forFeature(features.google),

  // Without SMTP_HOST (normal in development) sign-in codes print to the
  // console instead of being sent.
  SMTP_HOST: forFeature(true),
  SMTP_PORT: z.coerce.number().int().default(587),
  SMTP_USER: optional,
  SMTP_PASSWORD: optional,
  EMAIL_FROM: forFeature(true),

  R2_ACCOUNT_ID: forFeature(features.r2),
  R2_ACCESS_KEY_ID: forFeature(features.r2),
  R2_SECRET_ACCESS_KEY: forFeature(features.r2),
  R2_BUCKET: forFeature(features.r2),
  R2_PUBLIC_URL: optional,

  APPSCOPE_KEY: optional,
  APPSCOPE_SECRET_KEY: optional,
});

export type Env = z.infer<typeof schema>;

let parsed: Env | undefined;

/**
 * Validates and returns the environment. Called before the server listens, so
 * a missing variable stops it rather than surfacing as a confusing failure on
 * the first request that needs it.
 */
export function getEnv(): Env {
  if (parsed) return parsed;
  // `KEY=` in a .env file means "not set", not "set to an empty string".
  const values = Object.fromEntries(
    Object.entries(process.env).filter(([, v]) => v !== ""),
  );
  const result = schema.safeParse(values);
  if (!result.success) {
    const problems = result.error.issues
      .map((i) => {
        const key = i.path.join(".");
        return `  ${key}: ${values[key] === undefined ? "missing" : i.message}`;
      })
      .join("\n");
    throw new Error(`Invalid environment variables:\n${problems}`);
  }
  parsed = result.data;
  return parsed;
}

/** Lazy view of getEnv(), so modules can read `env.X` without parsing at import time. */
export const env = new Proxy({} as Env, {
  get: (_, key) => getEnv()[key as keyof Env],
});
