import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { rateLimit, ipKeyGenerator } from "express-rate-limit";
import { randomBytes } from "crypto";
import router from "./routes";
import { logger } from "./lib/logger";
import { Sentry } from "./lib/sentry";
import { DATABASE_URL } from "./db";

// Extend express-session with app-specific fields.
declare module "express-session" {
  interface SessionData {
    userId?: number;
    csrfToken?: string;
  }
}

const PgSession = connectPgSimple(session);

// Refuse to start in production with the default insecure secret.
const SESSION_SECRET = process.env.SESSION_SECRET;
if (!SESSION_SECRET || SESSION_SECRET === "dev-secret-change-in-prod") {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "SESSION_SECRET must be set to a strong secret in production. " +
        "Add it as an environment secret before deploying.",
    );
  }
  logger.warn("SESSION_SECRET is unset or using the default value — do not deploy this to production");
}

const app: Express = express();

// Trust Replit's reverse proxy so req.secure and Set-Cookie: Secure work correctly.
app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

// Security headers. CSP is left off here — the API only serves JSON and the
// frontend's CSP is handled at the edge. crossOriginEmbedderPolicy is disabled
// so the PWA service-worker can load cross-origin assets normally.
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));

// CORS — this API is consumed by a decoupled frontend that may be hosted on
// a different domain entirely (e.g. a Vercel deployment), so origins must be
// allow-listed explicitly rather than assumed to be same-origin.
//
// Sources of allowed origins:
//   - REPLIT_DOMAINS: comma-separated domains assigned to this Replit project
//     (e.g. "myapp.replit.app"). Auto-populated by the platform.
//   - CORS_ORIGINS: comma-separated list of additional external origins to
//     allow, e.g. "https://my-frontend.vercel.app,https://my-app.com". Set
//     this once the frontend is deployed to Vercel (or any other host).
//   - localhost / 0.0.0.0 on any port — always allowed for local development.
const allowedOrigins = new Set<string>();
// Production domain — always allowed regardless of env var configuration.
allowedOrigins.add("https://budger.app");
allowedOrigins.add("https://www.budger.app");
if (process.env.REPLIT_DOMAINS) {
  for (const d of process.env.REPLIT_DOMAINS.split(",")) {
    const domain = d.trim();
    if (domain) allowedOrigins.add(`https://${domain}`);
  }
}
if (process.env.CORS_ORIGINS) {
  for (const o of process.env.CORS_ORIGINS.split(",")) {
    // Strip trailing slashes — the Origin header never includes one, so a
    // stray "https://example.com/" in the env var would silently never match.
    const origin = o.trim().replace(/\/+$/, "");
    if (origin) allowedOrigins.add(origin);
  }
}
logger.info({ allowedOrigins: [...allowedOrigins] }, "CORS: allowed origins on startup");
app.use(
  cors({
    origin: (origin, callback) => {
      // No origin header = same-origin request or non-browser client (curl, mobile) — allow.
      if (!origin) return callback(null, true);
      if (
        allowedOrigins.has(origin) ||
        /^https?:\/\/localhost(:\d+)?$/.test(origin) ||
        /^https?:\/\/0\.0\.0\.0(:\d+)?$/.test(origin)
      ) {
        return callback(null, true);
      }
      logger.warn({ origin }, "CORS: rejected request from unknown origin");
      callback(new Error("CORS: origin not allowed"));
    },
    credentials: true,
    // Explicitly allow the headers the frontend actually sends cross-origin.
    // Without this, the CSRF token header gets stripped by preflight.
    allowedHeaders: ["Content-Type", "X-Csrf-Token", "X-Client-Timestamp"],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  }),
);

// Base64 encoding adds ~33 % overhead, so a 20 MB PDF becomes ~27 MB on the
// wire. Allow 30 MB to give a comfortable margin above the advertised cap.
app.use(express.json({ limit: "30mb" }));
app.use(express.urlencoded({ extended: true, limit: "30mb" }));

const sessionStore = DATABASE_URL
  ? new PgSession({
      conString: DATABASE_URL,
      tableName: "sessions",
      createTableIfMissing: true,
      // Automatically delete expired session rows once per hour so the table
      // doesn't accumulate 30 days of abandoned sessions (each login that is
      // killed and reopened leaves a row; without pruning they pile up and can
      // fill Neon's storage limit).
      pruneSessionInterval: 3600,
    })
  : undefined;

const isProduction = process.env.NODE_ENV === "production";

app.use(
  session({
    store: sessionStore,
    secret: SESSION_SECRET ?? "dev-secret-change-in-prod",
    resave: false,
    saveUninitialized: false,
    cookie: {
      // The frontend is a separately-hosted, cross-origin client (e.g. on
      // Vercel), so the session cookie must be sent on cross-site requests.
      // That requires SameSite=None, which browsers only honor when the
      // cookie is also Secure — so the two flip together based on env.
      // In local dev (plain HTTP) we fall back to Lax so cookies still work
      // across different localhost ports without HTTPS.
      secure: isProduction,
      httpOnly: true,
      sameSite: isProduction ? "none" : "lax",
      maxAge: 30 * 24 * 60 * 60 * 1000,
    },
  }),
);

// Rate limiting — three tiers:
//
// 1. globalApiLimiter — applied to every /api route. Keyed by authenticated
//    userId when available, falling back to IP. userId-keying means a shared
//    NAT (office, mobile carrier) doesn't let one noisy client block everyone
//    else on the same network. 600 req / 15 min ≈ 40 req/min — the app's
//    normal polling pattern (10-15 endpoints every 30 s) peaks around 30 req/min,
//    so this gives ~2× headroom for real use while stopping scripted floods.
//
// 2. authLimiter — tighter overlay on /api/auth for brute-force protection.
//    /auth/me is excluded: it's a read-only session check the client calls on
//    every window focus event; counting it would crowd out genuine PIN attempts.
//    /auth/logout is excluded: it is not a brute-force target, and counting
//    logout calls against the same budget that guards PIN attempts meant that
//    logout loops (e.g. from the staySignedIn=false sessionStorage race) could
//    exhaust the 150-slot window and block the user's very next login attempt.
//    skipSuccessfulRequests keeps failed guesses accumulating toward the cap.
//
// 3. aiLimiter — cost/abuse guard on the paid Gemini endpoint.
const globalApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 600,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const userId = (req.session as any)?.userId;
    return userId ? `user:${userId}` : ipKeyGenerator(req);
  },
  message: { error: "Too many requests, please slow down" },
});
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 150,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === "/me" || req.path === "/logout",
  skipSuccessfulRequests: true,
  message: { error: "Too many attempts, please try again later" },
});
const aiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later" },
});
// 4. memberSpendingLimiter — tight guard on the per-member spending endpoint.
//    Rapid member-to-member drilling (or React Query retry storms after a 500)
//    can fire many concurrent requests; 30/min per user is ~5× what normal use
//    needs but blocks runaway retry loops before they cascade into Neon overload.
const memberSpendingLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const userId = (req.session as any)?.userId;
    return userId ? `user:${userId}` : ipKeyGenerator(req);
  },
  message: { error: "Too many requests, please slow down" },
});
app.use("/api", globalApiLimiter);
app.use("/api/auth", authLimiter);
app.use("/api/transactions/extract-screenshot", aiLimiter);
app.use("/api/households/members", memberSpendingLimiter);

// ── CSRF protection ───────────────────────────────────────────────────────────
// Synchronizer-token pattern: GET /api/csrf-token issues a per-session random
// token stored in the encrypted session cookie. Mutating requests must echo it
// back in the x-csrf-token header. Together with sameSite: strict cookies this
// gives defence-in-depth against CSRF on modern browsers.
//
// The token endpoint must be registered BEFORE the csrfProtection middleware so
// it can be reached without a token in hand (bootstrapping case).

app.get("/api/csrf-token", (req, res) => {
  if (!req.session.csrfToken) {
    req.session.csrfToken = randomBytes(32).toString("hex");
  }
  res.json({ token: req.session.csrfToken });
});

const CSRF_SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function csrfProtection(req: express.Request, res: express.Response, next: express.NextFunction): void {
  if (CSRF_SAFE_METHODS.has(req.method)) return next();
  // Webhook endpoints authenticate via a per-user token in the URL path, not
  // via session cookies, so they cannot supply a CSRF token. They are safe to
  // exempt because any attacker would also need to know the user's secret token.
  if (req.path.startsWith("/webhook/")) return next();
  const sessionToken = req.session.csrfToken;
  const headerToken = req.headers["x-csrf-token"] as string | undefined;
  if (!sessionToken || !headerToken || sessionToken !== headerToken) {
    res.status(403).json({ error: "Invalid or missing CSRF token" });
    return;
  }
  next();
}

app.use("/api", csrfProtection);

app.use("/api", router);

// Unmatched /api routes — explicit 404 instead of falling through.
app.use("/api", (req, res) => {
  res.status(404).json({ error: "Not found" });
});

// Sentry error handler — must come AFTER routes and BEFORE the global error
// handler so it can capture the error before we send a response.
// It is a no-op when SENTRY_DSN is not set (Sentry.init was never called).
Sentry.setupExpressErrorHandler(app);

// ── Global error handler ─────────────────────────────────────────────────────
// Express 5 forwards rejected promises from async handlers to next(err)
// automatically, but nothing was catching them — an unexpected DB error or a
// malformed payload in any route (most of which have no local try/catch)
// would otherwise crash the whole process for every user. This is the
// last-resort safety net: log the failure and always respond, never throw.
app.use((err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  req.log?.error({ err }, "Unhandled error in request handler") ?? logger.error({ err }, "Unhandled error in request handler");
  if (res.headersSent) return;
  res.status(500).json({ error: "Internal server error" });
});

export default app;
