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

// Dark colour palette — matches the app splash screen aesthetic.
// All colours are plain hex so they work in every email client including
// Outlook (which ignores rgba/hsl) and Gmail on iOS (which strips
// background-color from <table> but respects bgcolor on <td>).
const C = {
  outerBg:   "#0a0a0a",   // page background
  cardBg:    "#171717",   // card surface
  divider:   "#252525",   // subtle horizontal rule
  textHero:  "#ffffff",   // heading / app name
  textSub:   "#a3a3a3",   // body copy
  textFaint: "#555555",   // footer / links
  btnBg:     "#ffffff",   // CTA button fill
  btnText:   "#0a0a0a",   // CTA button label
} as const;

function buildEmailHtml(firstName: string, verifyUrl: string): string {
  const greetingName = firstName || "there";

  // Derive the app origin from the verify URL to point the logo <img> at the
  // publicly hosted favicon.  SVG via remote <img> renders in Apple Mail and
  // most webmail clients.  Gmail on iOS may still block remote images; the
  // styled text badge ("B") acts as a reliable fallback.
  let appOrigin = "";
  try { appOrigin = new URL(verifyUrl).origin; } catch { /* leave empty */ }
  const logoSrc = appOrigin ? `${appOrigin}/favicon.svg` : "";

  // Gmail on iOS strips background-color from <body> and <table> elements, but
  // it DOES honour the bgcolor HTML attribute and background-color on <td>.
  // Every <td> therefore carries both bgcolor="…" and style="background-color:…"
  // so the dark theme shows correctly in Gmail, Apple Mail, and Outlook alike.

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Confirm your Budger account</title>
  <!--[if mso]><noscript><xml><o:OfficeDocumentSettings>
    <o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
</head>
<body style="margin:0;padding:0;background-color:${C.outerBg};" bgcolor="${C.outerBg}">

  <!-- Outer wrapper -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td align="center" bgcolor="${C.outerBg}"
          style="background-color:${C.outerBg};padding:40px 16px;">

        <!-- Card — max 440 px wide -->
        <!--[if mso]><table width="440" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
               style="max-width:440px;border-radius:20px;overflow:hidden;border:1px solid ${C.divider};">

          <!-- ── Header ── -->
          <tr>
            <td align="center" bgcolor="${C.cardBg}"
                style="background-color:${C.cardBg};padding:36px 32px 24px;">

              ${logoSrc
                ? `<img src="${logoSrc}" width="72" height="72" alt="Budger"
                        style="display:block;margin:0 auto 0;border:0;border-radius:16px;"/>`
                : `<!-- Fallback "B" badge when remote images are blocked -->
                   <div style="width:72px;height:72px;background:#2a2a2a;border-radius:16px;
                                line-height:72px;text-align:center;margin:0 auto;">
                     <span style="font-size:32px;font-weight:700;color:${C.textHero};">B</span>
                   </div>`}

              <p style="margin:16px 0 0;font-size:22px;font-weight:700;letter-spacing:-0.3px;
                         color:${C.textHero};line-height:1.2;">Budger</p>
              <p style="margin:4px 0 0;font-size:11px;letter-spacing:0.8px;
                         text-transform:uppercase;color:${C.textFaint};">
                Your household finance tracker
              </p>
            </td>
          </tr>

          <!-- ── Divider ── -->
          <tr>
            <td bgcolor="${C.cardBg}" style="background-color:${C.cardBg};padding:0 32px;">
              <div style="height:1px;background-color:${C.divider};font-size:0;line-height:0;">&nbsp;</div>
            </td>
          </tr>

          <!-- ── Body ── -->
          <tr>
            <td bgcolor="${C.cardBg}" style="background-color:${C.cardBg};padding:28px 32px 16px;">

              <p style="margin:0 0 6px;font-size:18px;font-weight:600;color:${C.textHero};line-height:1.3;">
                Hi ${greetingName} 👋
              </p>
              <p style="margin:0 0 28px;font-size:14px;line-height:1.75;color:${C.textSub};">
                Welcome to Budger! Tap the button below to verify your email address
                and finish setting up your account.
              </p>

              <!-- CTA button -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" bgcolor="#171717"
                      style="background-color:#171717;padding-bottom:24px;">
                    <a href="${verifyUrl}"
                       style="display:inline-block;background-color:${C.btnBg};color:${C.btnText};
                              text-decoration:none;font-weight:700;font-size:15px;
                              padding:15px 40px;border-radius:12px;letter-spacing:-0.1px;">
                      Verify email address
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0;font-size:12px;color:${C.textFaint};line-height:1.6;">
                Or copy this link into your browser:
              </p>
              <p style="margin:4px 0 0;font-size:11px;color:${C.textFaint};
                         word-break:break-all;line-height:1.6;">
                ${verifyUrl}
              </p>
            </td>
          </tr>

          <!-- ── Footer ── -->
          <tr>
            <td bgcolor="${C.cardBg}" style="background-color:${C.cardBg};padding:16px 32px 32px;">
              <div style="height:1px;background-color:${C.divider};font-size:0;line-height:0;margin-bottom:20px;">&nbsp;</div>
              <p style="margin:0;font-size:11px;color:${C.textFaint};line-height:1.7;">
                This link expires in 30 minutes. If you didn't sign up for Budger,
                you can safely ignore this email.
              </p>
            </td>
          </tr>

        </table>
        <!--[if mso]></td></tr></table><![endif]-->

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
