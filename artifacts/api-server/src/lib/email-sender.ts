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

function buildEmailHtml(firstName: string, verifyUrl: string): string {
  const greetingName = firstName || "there";
  // Derive the app origin from the verify URL so the logo img tag points to the
  // publicly hosted favicon. SVG served from a known HTTPS origin renders in Apple
  // Mail (iOS/macOS) and modern webmail clients. Gmail strips SVG data URIs and
  // inline <svg> tags, so remote-hosted SVG via <img> is the most compatible
  // option without adding a PNG generation dependency. The "B" text badge in the
  // alt/title provides a clean fallback for clients that block remote images.
  let appOrigin = "";
  try { appOrigin = new URL(verifyUrl).origin; } catch { /* leave empty */ }
  const logoSrc = appOrigin ? `${appOrigin}/favicon.svg` : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Confirm your Budger account</title>
</head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0a0a0a;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:440px;background:#111111;border-radius:20px;border:1px solid #222222;overflow:hidden;">

          <!-- Header band -->
          <tr>
            <td align="center" style="padding:36px 32px 20px;">
              ${logoSrc
                ? `<img src="${logoSrc}" width="72" height="72" alt="Budger" title="Budger"
                        style="display:block;margin:0 auto;border:0;"/>`
                : `<div style="width:72px;height:72px;margin:0 auto;background:#111;border-radius:16px;display:flex;align-items:center;justify-content:center;">
                     <span style="font-size:32px;font-weight:700;color:#f5f5f5;">B</span>
                   </div>`}
              <p style="margin:14px 0 0;font-size:22px;font-weight:700;letter-spacing:-0.3px;color:#f5f5f5;">Budger</p>
              <p style="margin:4px 0 0;font-size:12px;color:#555555;letter-spacing:0.5px;text-transform:uppercase;">Your household finance tracker</p>
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding:0 32px;">
              <div style="height:1px;background:#1e1e1e;"></div>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:28px 32px 12px;">
              <p style="margin:0 0 8px;font-size:18px;font-weight:600;color:#f5f5f5;">Hi ${greetingName} 👋</p>
              <p style="margin:0 0 24px;font-size:14px;line-height:1.7;color:#888888;">
                Welcome to Budger! Tap the button below to verify your email address and finish setting up your account.
              </p>
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center">
                    <a href="${verifyUrl}"
                       style="display:inline-block;background:#f5f5f5;color:#0a0a0a;text-decoration:none;font-weight:700;font-size:15px;padding:14px 36px;border-radius:12px;letter-spacing:-0.1px;">
                      Verify email address
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:20px 0 0;font-size:12px;color:#444444;line-height:1.6;">
                Or copy this link into your browser:<br/>
                <span style="color:#666666;word-break:break-all;">${verifyUrl}</span>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px 32px;">
              <div style="height:1px;background:#1e1e1e;margin-bottom:20px;"></div>
              <p style="margin:0;font-size:11px;color:#3a3a3a;line-height:1.6;">
                This link expires in 30 minutes. If you didn't sign up for Budger, you can safely ignore this email.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// Sends the real verification email via Resend when RESEND_API_KEY is configured.
// Returns true if a real email was sent, false if it was only simulated/logged
// (e.g. missing key or a delivery failure) so the caller can fall back gracefully.
export async function sendVerificationEmail({ to, firstName, verifyUrl }: VerificationEmailInput): Promise<boolean> {
  if (!resend) {
    logger.info({ to }, "email-sender: RESEND_API_KEY not set, skipping real send (simulated)");
    return false;
  }

  try {
    const { error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to,
      subject: "Confirm your Budger account",
      html: buildEmailHtml(firstName, verifyUrl),
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
