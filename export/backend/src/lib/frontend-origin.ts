import type { Request } from "express";

/**
 * Resolves the origin of the frontend app, for building links that need to
 * point at frontend routes (email verification, PIN reset) rather than this
 * API server's own host.
 *
 * Priority:
 *   1. FRONTEND_URL — set this in a decoupled deployment (e.g. your Vercel
 *      URL, "https://your-app.vercel.app").
 *   2. REPLIT_DOMAINS / REPLIT_DEV_DOMAIN — auto-populated on Replit, where
 *      frontend and backend share a domain via path-based routing.
 *   3. Falls back to the request's own host (same-origin deployments).
 */
export function getFrontendOrigin(req: Request): string {
  if (process.env.FRONTEND_URL) {
    return process.env.FRONTEND_URL.replace(/\/+$/, "");
  }
  const replitDomain =
    (process.env.REPLIT_DOMAINS ?? "").split(",")[0].trim() ||
    process.env.REPLIT_DEV_DOMAIN;
  if (replitDomain) {
    return `https://${replitDomain}`;
  }
  return `${req.protocol}://${req.get("host")}`;
}
