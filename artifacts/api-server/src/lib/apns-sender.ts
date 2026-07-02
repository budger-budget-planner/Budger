/**
 * APNs Live Activity push sender.
 *
 * Used to push content-state updates to a running Live Activity from the
 * server side (e.g. when another household member adds a transaction).
 *
 * ─── Required env vars (set in Replit Secrets when ready) ───────────────────
 *   APNS_KEY_ID      — 10-char Key ID from Apple Developer → Certificates, IDs & Profiles → Keys
 *   APNS_TEAM_ID     — 10-char Team ID (top-right on developer.apple.com)
 *   APNS_BUNDLE_ID   — App bundle identifier, e.g. "com.budger.app"
 *   APNS_PRIVATE_KEY — Contents of the .p8 file (the full PEM text, newlines preserved)
 *   APNS_PRODUCTION  — "true" for production APNs, anything else → sandbox
 *
 * ─── Live Activity device tokens ────────────────────────────────────────────
 *   Each running Live Activity has a unique push token.  The iOS app must
 *   send this token to POST /api/live-activity/token so the server can store
 *   it (in the live_activity_tokens table — add this migration when ready).
 *
 * ─── APNs Live Activity push format ─────────────────────────────────────────
 *   apns-push-type:  liveactivity
 *   apns-topic:      <BUNDLE_ID>.push-type.liveactivity
 *   apns-priority:   10   (immediate) | 5 (low power, delivered opportunistically)
 *   authorization:   bearer <JWT>
 *
 *   Payload:
 *   {
 *     "aps": {
 *       "timestamp":     <unix seconds>,
 *       "event":         "update" | "end",
 *       "content-state": { ...BudgerActivityState... },
 *       "alert":         { "title": "...", "body": "..." }   // optional
 *     }
 *   }
 */

import { createSign } from "crypto";
import { logger } from "./logger";

const APNS_KEY_ID     = process.env.APNS_KEY_ID     ?? "";
const APNS_TEAM_ID    = process.env.APNS_TEAM_ID    ?? "";
const APNS_BUNDLE_ID  = process.env.APNS_BUNDLE_ID  ?? "";
const APNS_PRIVATE_KEY = process.env.APNS_PRIVATE_KEY ?? "";
const APNS_PRODUCTION = process.env.APNS_PRODUCTION === "true";

const APNS_HOST = APNS_PRODUCTION
  ? "https://api.push.apple.com"
  : "https://api.sandbox.push.apple.com";

export function apnsConfigured(): boolean {
  return !!(APNS_KEY_ID && APNS_TEAM_ID && APNS_BUNDLE_ID && APNS_PRIVATE_KEY);
}

// ─── JWT generation ───────────────────────────────────────────────────────────
// APNs JWTs use ES256 and expire after 1 hour (Apple recommendation: regenerate hourly)

let cachedJwt: { token: string; generatedAt: number } | null = null;

function generateApnsJwt(): string {
  const now = Math.floor(Date.now() / 1000);
  if (cachedJwt && now - cachedJwt.generatedAt < 3000) {
    return cachedJwt.token;
  }

  const header = Buffer.from(JSON.stringify({ alg: "ES256", kid: APNS_KEY_ID })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ iss: APNS_TEAM_ID, iat: now })).toString("base64url");
  const unsigned = `${header}.${payload}`;

  const signer = createSign("SHA256");
  signer.update(unsigned);
  signer.end();
  const signature = signer.sign(APNS_PRIVATE_KEY, "base64url");

  const token = `${unsigned}.${signature}`;
  cachedJwt = { token, generatedAt: now };
  return token;
}

// ─── Send ─────────────────────────────────────────────────────────────────────

export type LiveActivityPushPayload = {
  /** APNs device token for the live activity (NOT a regular push token) */
  deviceToken: string;
  event: "update" | "end";
  contentState: Record<string, unknown>;
  alert?: { title: string; body: string };
  /** Dismiss this many seconds after ending (only for event = "end") */
  dismissAfterSeconds?: number;
};

export async function sendLiveActivityPush(payload: LiveActivityPushPayload): Promise<void> {
  if (!apnsConfigured()) {
    logger.warn("apns-sender: APNS_KEY_ID / APNS_TEAM_ID / APNS_BUNDLE_ID / APNS_PRIVATE_KEY not set — skipping live activity push");
    return;
  }

  const jwt = generateApnsJwt();
  const topic = `${APNS_BUNDLE_ID}.push-type.liveactivity`;
  const now = Math.floor(Date.now() / 1000);

  const aps: Record<string, unknown> = {
    timestamp: now,
    event: payload.event,
    "content-state": payload.contentState,
  };
  if (payload.alert) aps.alert = payload.alert;
  if (payload.event === "end" && payload.dismissAfterSeconds) {
    aps["dismissal-date"] = now + payload.dismissAfterSeconds;
  }

  const body = JSON.stringify({ aps });

  const url = `${APNS_HOST}/3/device/${payload.deviceToken}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "apns-push-type": "liveactivity",
        "apns-topic": topic,
        "apns-priority": "10",
        authorization: `bearer ${jwt}`,
      },
      body,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      logger.warn({ status: res.status, body: text }, "apns-sender: push failed");
    }
  } catch (err) {
    logger.warn({ err }, "apns-sender: fetch error");
  }
}
