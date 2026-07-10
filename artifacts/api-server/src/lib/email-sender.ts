import { Resend } from "resend";
import { logger, maskEmail } from "./logger";

const RESEND_API_KEY = process.env.RESEND_API_KEY ?? "";
const FROM_ADDRESS = process.env.RESEND_FROM_EMAIL ?? "Budger <onboarding@resend.dev>";

const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

if (resend) {
  logger.info("email-sender: Resend client initialised — emails will be delivered");
} else {
  logger.warn(
    "email-sender: RESEND_API_KEY is not set. " +
    "Verification emails, PIN reset emails, and deletion notices will NOT be delivered. " +
    "Set RESEND_API_KEY in environment secrets to enable real email delivery."
  );
}

export type VerificationEmailInput = {
  to: string;
  firstName: string;
  verifyUrl: string;
  language?: "en" | "pl";
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

function buildEmailHtml(firstName: string, verifyUrl: string, language: "en" | "pl" = "en"): string {
  const isPl = language === "pl";
  const greetingName = escapeHtml(firstName || (isPl ? "tam" : "there"));

  // Derive the app origin from the verify URL to point the logo <img> at the
  // publicly hosted favicon.  SVG via remote <img> renders in Apple Mail and
  // most webmail clients.  Gmail on iOS may still block remote images; the
  // styled text badge ("B") acts as a reliable fallback.
  let appOrigin = "";
  try { appOrigin = new URL(verifyUrl).origin; } catch { /* leave empty */ }
  const logoSrc = appOrigin ? `${appOrigin}/favicon.svg` : "";

  const title = isPl ? "Potwierdź swoje konto Budger" : "Confirm your Budger account";
  const tagline = isPl ? "Twój domowy tracker finansowy" : "Your household finance tracker";
  const bodyCopy = isPl
    ? "Witamy w Budger! Kliknij przycisk poniżej, aby potwierdzić swój adres e-mail i zakończyć tworzenie konta."
    : "Welcome to Budger! Tap the button below to verify your email address and finish setting up your account.";
  const ctaLabel = isPl ? "Potwierdź adres e-mail" : "Verify email address";
  const copyLinkLabel = isPl ? "Lub skopiuj ten link do przeglądarki:" : "Or copy this link into your browser:";
  const footerCopy = isPl
    ? "Ten link wygasa za 30 minut. Jeśli nie rejestrowałeś/aś się w Budger, możesz bezpiecznie zignorować tę wiadomość."
    : "This link expires in 30 minutes. If you didn't sign up for Budger, you can safely ignore this email.";

  // Gmail on iOS strips background-color from <body> and <table> elements, but
  // it DOES honour the bgcolor HTML attribute and background-color on <td>.
  // Every <td> therefore carries both bgcolor="…" and style="background-color:…"
  // so the dark theme shows correctly in Gmail, Apple Mail, and Outlook alike.

  return `<!DOCTYPE html>
<html lang="${isPl ? "pl" : "en"}">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${title}</title>
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
                ${tagline}
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
                ${isPl ? `Cześć, ${greetingName}` : `Hi ${greetingName}`} 👋
              </p>
              <p style="margin:0 0 28px;font-size:14px;line-height:1.75;color:${C.textSub};">
                ${bodyCopy}
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
                      ${ctaLabel}
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0;font-size:12px;color:${C.textFaint};line-height:1.6;">
                ${copyLinkLabel}
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
                ${footerCopy}
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

export type PinResetEmailInput = {
  to: string;
  firstName: string;
  resetUrl: string;
  language?: "en" | "pl";
};

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function buildPinResetHtml(firstName: string, resetUrl: string, language: "en" | "pl" = "en"): string {
  const isPl = language === "pl";
  const greetingName = escapeHtml(firstName || (isPl ? "tam" : "there"));
  let appOrigin = "";
  try { appOrigin = new URL(resetUrl).origin; } catch { /* leave empty */ }
  const logoSrc = appOrigin ? `${appOrigin}/favicon.svg` : "";

  const title = isPl ? "Zresetuj swój PIN Budger" : "Reset your Budger PIN";
  const heading = isPl ? `Zresetuj swój PIN, ${greetingName}` : `Reset your PIN, ${greetingName}`;
  const bodyCopy = isPl
    ? "Otrzymaliśmy prośbę o zresetowanie PIN-u dla Twojego konta Budger.<br/>Kliknij przycisk poniżej, aby ustawić nowy PIN. Ten link wygasa za 30 minut."
    : "We received a request to reset the PIN for your Budger account.<br/>Click the button below to set a new PIN. This link expires in 30 minutes.";
  const ctaLabel = isPl ? "Zresetuj PIN" : "Reset PIN";
  const copyLinkLabel = isPl ? "Lub skopiuj ten link:" : "Or copy this link:";
  const footerCopy = isPl
    ? "Jeśli nie prosiłeś/aś o reset PIN-u, możesz bezpiecznie zignorować tę wiadomość. Twój PIN nie zmieni się."
    : "If you didn't request a PIN reset, you can safely ignore this email. Your PIN will not change.";

  return `<!DOCTYPE html>
<html lang="${isPl ? "pl" : "en"}">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background-color:${C.outerBg};" bgcolor="${C.outerBg}">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td align="center" bgcolor="${C.outerBg}" style="background-color:${C.outerBg};padding:40px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
               style="max-width:440px;border-radius:20px;overflow:hidden;border:1px solid ${C.divider};">
          <tr>
            <td align="center" bgcolor="${C.cardBg}" style="background-color:${C.cardBg};padding:36px 32px 24px;">
              ${logoSrc
                ? `<img src="${logoSrc}" width="72" height="72" alt="Budger" style="display:block;margin:0 auto;border:0;border-radius:16px;"/>`
                : `<div style="width:72px;height:72px;background:#2a2a2a;border-radius:16px;line-height:72px;text-align:center;margin:0 auto;">
                     <span style="font-size:32px;font-weight:700;color:${C.textHero};">B</span>
                   </div>`}
              <p style="margin:16px 0 0;font-size:22px;font-weight:700;letter-spacing:-0.3px;color:${C.textHero};line-height:1.2;">Budger</p>
            </td>
          </tr>
          <tr>
            <td bgcolor="${C.cardBg}" style="background-color:${C.cardBg};padding:0 32px 28px;">
              <div style="height:1px;background-color:${C.divider};font-size:0;line-height:0;margin-bottom:24px;">&nbsp;</div>
              <p style="margin:0 0 8px;font-size:20px;font-weight:700;color:${C.textHero};line-height:1.3;">${heading}</p>
              <p style="margin:0 0 24px;font-size:14px;color:${C.textSub};line-height:1.6;">
                ${bodyCopy}
              </p>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
                <tr>
                  <td align="center" bgcolor="${C.btnBg}" style="background-color:${C.btnBg};border-radius:12px;">
                    <a href="${resetUrl}" target="_blank"
                       style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:700;
                              color:${C.btnText};text-decoration:none;letter-spacing:0.2px;">
                      ${ctaLabel}
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:24px 0 0;font-size:12px;color:${C.textFaint};line-height:1.6;word-break:break-all;">
                ${copyLinkLabel} <a href="${resetUrl}" style="color:${C.textFaint};">${resetUrl}</a>
              </p>
            </td>
          </tr>
          <tr>
            <td bgcolor="${C.cardBg}" style="background-color:${C.cardBg};padding:16px 32px 32px;">
              <div style="height:1px;background-color:${C.divider};font-size:0;line-height:0;margin-bottom:20px;">&nbsp;</div>
              <p style="margin:0;font-size:11px;color:${C.textFaint};line-height:1.7;">
                ${footerCopy}
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

export async function sendPinResetEmail({ to, firstName, resetUrl, language = "en" }: PinResetEmailInput): Promise<boolean> {
  if (!resend) {
    logger.warn({ to, resetUrl }, "email-sender: RESEND_API_KEY not set — PIN reset link NOT delivered");
    return false;
  }

  try {
    const { error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to,
      subject: language === "pl" ? "Zresetuj swój PIN Budger" : "Reset your Budger PIN",
      html: buildPinResetHtml(firstName, resetUrl, language),
    });
    if (error) {
      logger.warn({ to, error }, "email-sender: Resend error sending PIN reset email");
      return false;
    }
    logger.info({ to: maskEmail(to) }, "email-sender: PIN reset email sent via Resend");
    return true;
  } catch (err) {
    logger.warn({ err, to }, "email-sender: failed to send PIN reset email");
    return false;
  }
}

// Sends the real verification email via Resend when RESEND_API_KEY is configured.
// Returns true if a real email was sent, false if it was only simulated/logged
// (e.g. missing key or a delivery failure) so the caller can fall back gracefully.
export type DeletionRequestEmailInput = {
  userEmail: string;
  userName: string;
};

export async function sendDeletionRequestEmail({ userEmail, userName }: DeletionRequestEmailInput): Promise<boolean> {
  const SUPPORT_ADDRESS = "Budger.support@gmail.com";
  const safeName  = escapeHtml(userName  || "unknown");
  const safeEmail = escapeHtml(userEmail || "unknown");
  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><title>Account Deletion Request</title></head>
<body style="margin:0;padding:0;background-color:${C.outerBg};" bgcolor="${C.outerBg}">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td align="center" bgcolor="${C.outerBg}" style="background-color:${C.outerBg};padding:40px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
               style="max-width:440px;border-radius:20px;overflow:hidden;border:1px solid ${C.divider};">
          <tr>
            <td align="center" bgcolor="${C.cardBg}" style="background-color:${C.cardBg};padding:32px 32px 20px;">
              <p style="margin:0;font-size:22px;font-weight:700;color:${C.textHero};">Budger</p>
              <p style="margin:6px 0 0;font-size:13px;color:${C.textFaint};letter-spacing:0.6px;text-transform:uppercase;">Account Deletion Request</p>
            </td>
          </tr>
          <tr>
            <td bgcolor="${C.cardBg}" style="background-color:${C.cardBg};padding:0 32px 28px;">
              <div style="height:1px;background-color:${C.divider};font-size:0;line-height:0;margin-bottom:24px;">&nbsp;</div>
              <p style="margin:0 0 16px;font-size:14px;color:${C.textSub};line-height:1.75;">
                A user has requested deletion of their Budger account and all associated data (GDPR right to erasure).
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                     style="background-color:#1f1f1f;border-radius:12px;padding:16px;">
                <tr><td style="padding:8px 16px;">
                  <p style="margin:0;font-size:12px;color:${C.textFaint};text-transform:uppercase;letter-spacing:0.5px;">Name</p>
                  <p style="margin:4px 0 0;font-size:14px;font-weight:600;color:${C.textHero};">${safeName}</p>
                </td></tr>
                <tr><td style="padding:8px 16px;">
                  <p style="margin:0;font-size:12px;color:${C.textFaint};text-transform:uppercase;letter-spacing:0.5px;">Email</p>
                  <p style="margin:4px 0 0;font-size:14px;font-weight:600;color:${C.textHero};">${safeEmail}</p>
                </td></tr>
                <tr><td style="padding:8px 16px;">
                  <p style="margin:0;font-size:12px;color:${C.textFaint};text-transform:uppercase;letter-spacing:0.5px;">Requested at</p>
                  <p style="margin:4px 0 0;font-size:14px;font-weight:600;color:${C.textHero};">${new Date().toISOString()}</p>
                </td></tr>
              </table>
              <p style="margin:20px 0 0;font-size:13px;color:${C.textFaint};line-height:1.7;">
                Please process this request within 30 days as required by GDPR Article 17.
                Reply to the user at <a href="mailto:${safeEmail}" style="color:${C.textFaint};">${safeEmail}</a> once erasure is complete.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  if (!resend) {
    logger.warn({ userEmail }, "email-sender: RESEND_API_KEY not set — deletion request NOT delivered");
    return false;
  }

  try {
    const { error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: SUPPORT_ADDRESS,
      replyTo: userEmail,
      subject: `[Budger] Account deletion request — ${userEmail}`,
      html,
    });
    if (error) {
      logger.warn({ userEmail, error }, "email-sender: error sending deletion request email");
      return false;
    }
    logger.info({ userEmail: maskEmail(userEmail) }, "email-sender: deletion request email sent");
    return true;
  } catch (err) {
    logger.warn({ err, userEmail }, "email-sender: failed to send deletion request email");
    return false;
  }
}

export type DeletionAckEmailInput = {
  to: string;
  firstName: string;
  language: "en" | "pl";
};

export async function sendDeletionAckEmail({ to, firstName, language }: DeletionAckEmailInput): Promise<boolean> {
  const name = escapeHtml(firstName || "there");
  const isPl = language === "pl";

  const subject = isPl
    ? "Budger — otrzymaliśmy Twoje żądanie usunięcia konta"
    : "Budger — we received your account deletion request";

  const html = `<!DOCTYPE html>
<html lang="${isPl ? "pl" : "en"}">
<head><meta charset="UTF-8"/><title>${subject}</title></head>
<body style="margin:0;padding:0;background-color:${C.outerBg};" bgcolor="${C.outerBg}">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td align="center" bgcolor="${C.outerBg}" style="background-color:${C.outerBg};padding:40px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
               style="max-width:440px;border-radius:20px;overflow:hidden;border:1px solid ${C.divider};">

          <!-- Header -->
          <tr>
            <td align="center" bgcolor="${C.cardBg}" style="background-color:${C.cardBg};padding:32px 32px 20px;">
              <p style="margin:0;font-size:22px;font-weight:700;color:${C.textHero};">Budger</p>
              <p style="margin:6px 0 0;font-size:11px;color:${C.textFaint};letter-spacing:0.8px;text-transform:uppercase;">
                ${isPl ? "Potwierdzenie żądania usunięcia" : "Deletion Request Confirmation"}
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td bgcolor="${C.cardBg}" style="background-color:${C.cardBg};padding:0 32px 28px;">
              <div style="height:1px;background-color:${C.divider};font-size:0;line-height:0;margin-bottom:24px;">&nbsp;</div>

              <p style="margin:0 0 8px;font-size:18px;font-weight:600;color:${C.textHero};">
                ${isPl ? `Cześć, ${name}` : `Hi ${name}`}
              </p>
              <p style="margin:0 0 20px;font-size:14px;color:${C.textSub};line-height:1.75;">
                ${isPl
                  ? "Otrzymaliśmy Twoje żądanie usunięcia konta Budger oraz wszystkich powiązanych danych osobowych."
                  : "We have received your request to delete your Budger account and all associated personal data."}
              </p>

              <!-- Details box -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                     style="background-color:#1f1f1f;border-radius:12px;margin-bottom:20px;">
                <tr><td style="padding:14px 18px;">
                  <p style="margin:0 0 4px;font-size:11px;color:${C.textFaint};text-transform:uppercase;letter-spacing:0.5px;">
                    ${isPl ? "Adres e-mail" : "Email address"}
                  </p>
                  <p style="margin:0;font-size:14px;font-weight:600;color:${C.textHero};">${escapeHtml(to)}</p>
                </td></tr>
                <tr><td style="padding:0 18px 14px;">
                  <p style="margin:0 0 4px;font-size:11px;color:${C.textFaint};text-transform:uppercase;letter-spacing:0.5px;">
                    ${isPl ? "Data i godzina żądania" : "Request timestamp"}
                  </p>
                  <p style="margin:0;font-size:14px;font-weight:600;color:${C.textHero};">${new Date().toISOString()}</p>
                </td></tr>
                <tr><td style="padding:0 18px 14px;">
                  <p style="margin:0 0 4px;font-size:11px;color:${C.textFaint};text-transform:uppercase;letter-spacing:0.5px;">
                    ${isPl ? "Podstawa prawna" : "Legal basis"}
                  </p>
                  <p style="margin:0;font-size:14px;font-weight:600;color:${C.textHero};">GDPR Article 17 — ${isPl ? "Prawo do bycia zapomnianym" : "Right to erasure"}</p>
                </td></tr>
              </table>

              <p style="margin:0 0 12px;font-size:14px;color:${C.textSub};line-height:1.75;">
                ${isPl
                  ? "Nasz zespół przetworzy Twoje żądanie w ciągu <strong style='color:#ffffff;'>30 dni</strong> zgodnie z wymogami RODO. Po zakończeniu procesu wyślemy potwierdzenie na ten adres e-mail."
                  : "Our team will process your request within <strong style='color:#ffffff;'>30 days</strong> as required by GDPR. Once complete, we will send a final confirmation to this email address."}
              </p>
              <p style="margin:0;font-size:14px;color:${C.textSub};line-height:1.75;">
                ${isPl
                  ? `Jeśli masz pytania, skontaktuj się z nami: <a href="mailto:Budger.support@gmail.com" style="color:${C.textFaint};">Budger.support@gmail.com</a>`
                  : `If you have any questions, contact us at <a href="mailto:Budger.support@gmail.com" style="color:${C.textFaint};">Budger.support@gmail.com</a>`}
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td bgcolor="${C.cardBg}" style="background-color:${C.cardBg};padding:16px 32px 28px;">
              <div style="height:1px;background-color:${C.divider};font-size:0;line-height:0;margin-bottom:16px;">&nbsp;</div>
              <p style="margin:0;font-size:11px;color:${C.textFaint};line-height:1.7;">
                ${isPl
                  ? "Jeśli nie składałeś/aś tego żądania, zignoruj tę wiadomość lub skontaktuj się z nami niezwłocznie."
                  : "If you did not submit this request, please ignore this email or contact us immediately."}
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  if (!resend) {
    logger.warn({ to }, "email-sender: RESEND_API_KEY not set — deletion ack email NOT delivered");
    return false;
  }

  try {
    const { error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to,
      subject,
      html,
    });
    if (error) {
      logger.warn({ to, error }, "email-sender: error sending deletion ack email");
      return false;
    }
    logger.info({ to: maskEmail(to) }, "email-sender: deletion ack email sent to user");
    return true;
  } catch (err) {
    logger.warn({ err, to }, "email-sender: failed to send deletion ack email");
    return false;
  }
}

export async function sendVerificationEmail({ to, firstName, verifyUrl, language = "en" }: VerificationEmailInput): Promise<boolean> {
  if (!resend) {
    logger.warn({ to }, "email-sender: RESEND_API_KEY not set — verification email NOT delivered");
    return false;
  }

  try {
    const { error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to,
      subject: language === "pl" ? "Potwierdź swoje konto Budger" : "Confirm your Budger account",
      html: buildEmailHtml(firstName, verifyUrl, language),
    });
    if (error) {
      logger.warn({ to, error }, "email-sender: Resend returned an error, falling back to simulated email");
      return false;
    }
    logger.info({ to: maskEmail(to) }, "email-sender: verification email sent via Resend");
    return true;
  } catch (err) {
    logger.warn({ err, to }, "email-sender: failed to send via Resend, falling back to simulated email");
    return false;
  }
}
