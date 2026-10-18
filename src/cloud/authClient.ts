import { createAuthClient } from "better-auth/react"
import { emailOTPClient } from "better-auth/client/plugins"

/**
 * The hosted account, as seen from the editor.
 *
 * Same origin as the app, in development too — Vite proxies /api to the
 * server — so the session cookie behaves identically in both and there is no
 * CORS configuration that exists only in one of them.
 */
export const authClient = createAuthClient({
  plugins: [emailOTPClient()],
})

export const { useSession, signOut } = authClient

/** Ask for a sign-in code by email. */
export async function requestSignInCode(email: string) {
  return authClient.emailOtp.sendVerificationOtp({ email, type: "sign-in" })
}

/** Exchange an emailed code for a session. */
export async function signInWithCode(email: string, otp: string) {
  return authClient.signIn.emailOtp({ email, otp })
}
