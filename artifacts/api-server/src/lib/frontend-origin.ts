import type { Request } from "express";

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
