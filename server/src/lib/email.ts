import nodemailer, { type Transporter } from "nodemailer";
import { env } from "../env.js";

let transport: Transporter | undefined;

/**
 * Plain SMTP, so the provider is just config (infra INFRA.md "Email"):
 * production uses the Hostup relay (relay.hostup.se:587, no login, allowed
 * by the VPS's IP). Resend or any other provider works by changing the
 * SMTP_* variables.
 */
function getTransport(): Transporter {
  transport ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    // On 587, refuse to send if the server doesn't offer STARTTLS.
    requireTLS: env.SMTP_PORT === 587,
    auth:
      env.SMTP_USER && env.SMTP_PASSWORD
        ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD }
        : undefined,
  });
  return transport;
}

export async function sendSignInCode(email: string, code: string) {
  // No SMTP server set (normal in development): print the code instead.
  // SMTP_HOST is required in production, see env.ts.
  if (!env.SMTP_HOST) {
    console.log(`\n[email] Sign-in code for ${email}: ${code}\n`);
    return;
  }

  try {
    await getTransport().sendMail({
      from: env.EMAIL_FROM,
      to: email,
      subject: `Your sign-in code: ${code}`,
      text: `Your sign-in code is ${code}. It expires in 5 minutes.\n\nIf you didn't try to sign in, you can ignore this email.`,
    });
  } catch (error) {
    // Better Auth answers 200 either way, so this log is the only trace.
    console.error("[email] SMTP send failed:", error);
  }
}
