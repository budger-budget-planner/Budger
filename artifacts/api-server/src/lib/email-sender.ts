import { Resend } from "resend";
import { logger } from "./logger";

const RESEND_API_KEY = process.env.RESEND_API_KEY ?? "";
const FROM_ADDRESS = process.env.RESEND_FROM_EMAIL ?? "Budger <onboarding@resend.dev>";

const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

export type VerificationEmailInput = {
  to: string;
  firstName: string;
  verifyUrl: string;
};

// Sends the real verification email via Resend when RESEND_API_KEY is configured.
// Returns true if a real email was sent, false if it was only simulated/logged
// (e.g. missing key or a delivery failure) so the caller can fall back gracefully.
export async function sendVerificationEmail({ to, firstName, verifyUrl }: VerificationEmailInput): Promise<boolean> {
  if (!resend) {
    logger.info({ to }, "email-sender: RESEND_API_KEY not set, skipping real send (simulated)");
    return false;
  }

  const greetingName = firstName || "there";
  try {
    const { error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to,
      subject: "Confirm your Budger account",
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background:#0a0a0a; padding:32px; color:#f5f5f5;">
          <div style="max-width:420px; margin:0 auto; background:#161616; border-radius:16px; padding:32px; border:1px solid #2a2a2a;">
            <h1 style="font-size:20px; margin:0 0 16px;">Hi ${greetingName}, welcome to Budger!</h1>
            <p style="font-size:14px; line-height:1.6; color:#b5b5b5; margin:0 0 24px;">
              Tap the button below to verify your email and continue setting up your account.
            </p>
            <a href="${verifyUrl}" style="display:inline-block; background:#f5f5f5; color:#0a0a0a; text-decoration:none; font-weight:600; padding:12px 24px; border-radius:10px; font-size:14px;">
              Verify email address
            </a>
            <p style="font-size:12px; color:#777; margin-top:24px;">
              This link expires in 30 minutes. If you didn't request this, you can ignore this email.
            </p>
          </div>
        </div>
      `,
    });
    if (error) {
      logger.warn({ to, error }, "email-sender: Resend returned an error, falling back to simulated email");
      return false;
    }
    logger.info({ to }, "email-sender: verification email sent via Resend");
    return true;
  } catch (err) {
    logger.warn({ err, to }, "email-sender: failed to send via Resend, falling back to simulated email");
    return false;
  }
}
