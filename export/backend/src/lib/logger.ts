import pino from "pino";

const isProduction = process.env.NODE_ENV === "production";

/**
 * Mask an email address for logging: keeps enough to correlate/debug a
 * support ticket without persisting the full address in plaintext log
 * storage (log aggregators are a much wider blast radius than the DB).
 * "alex@example.com" -> "al***@example.com"
 */
export function maskEmail(email: string | null | undefined): string {
  if (!email) return "";
  const at = email.indexOf("@");
  if (at <= 0) return "***";
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}***@${domain}`;
}

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: [
    "req.headers.authorization",
    "req.headers.cookie",
    "res.headers['set-cookie']",
  ],
  ...(isProduction
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: { colorize: true },
        },
      }),
});
