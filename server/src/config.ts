/**
 * Per-project feature switches, following the house convention
 * (infra INFRA.md, starter src/config.ts).
 *
 * Enabled:  the feature's env vars are required in production and optional
 *           in development, where the feature is simply unavailable.
 * Disabled: its vars are ignored and its routes 404.
 *
 * Email-code sign-in and Postgres are always on.
 */
export const site = {
  name: "Atelier",
  description: "A local-first vector design tool, with collaboration.",
  locale: "en_US",
} as const;

export const features = {
  google: true,
  /** Images in cloud documents go to R2 rather than into the document. */
  r2: true,
  /** Not in the first version; the hosted plan arrives with it. */
  stripe: false,
} as const;
