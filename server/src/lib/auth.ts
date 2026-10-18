import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { emailOTP } from "better-auth/plugins/email-otp";
import { features } from "../config.js";
import { getDb } from "../db/index.js";
import * as schema from "../db/schema/index.js";
import { env } from "../env.js";
import { sendSignInCode } from "./email.js";

/** Where `npm run dev` serves the editor (vite.config.ts). */
const DEV_EDITOR_ORIGIN = "http://localhost:1420";

export function createAuth() {
  const google =
    features.google && env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? {
          google: {
            clientId: env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET,
          },
        }
      : {};

  return betterAuth({
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    trustedOrigins: [
      env.APP_URL,
      // In development the editor is served by Vite on its own port and
      // proxies /api here, so requests genuinely carry that origin. In
      // production both are the same host and this adds nothing.
      ...(env.NODE_ENV === "development" ? [DEV_EDITOR_ORIGIN] : []),
    ],
    database: drizzleAdapter(getDb(), { provider: "pg", schema }),
    emailAndPassword: { enabled: false },
    advanced: {
      // Rate limits are per client IP. Behind Cloudflare, X-Forwarded-For
      // holds proxy hops, so CF-Connecting-IP is the visitor. Only
      // trustworthy because the origin accepts 80/443 from Cloudflare alone
      // (infra runbooks/harden-server.md).
      ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] },
    },
    socialProviders: google,
    plugins: [
      emailOTP({
        storeOTP: "hashed",
        async sendVerificationOTP({ email, otp, type }) {
          if (type === "sign-in") await sendSignInCode(email, otp);
        },
      }),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
export type Session = Auth["$Infer"]["Session"];

let auth: Auth | undefined;

export function getAuth(): Auth {
  auth ??= createAuth();
  return auth;
}

/**
 * The signed-in user for a request, or null.
 *
 * Takes plain headers so it works for both HTTP requests and the WebSocket
 * upgrade, which is not a Hono request but carries the same cookie.
 */
export async function getSession(headers: Headers): Promise<Session | null> {
  return getAuth().api.getSession({ headers });
}
