import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { rateLimit, ipKeyGenerator } from "express-rate-limit";
import router from "./routes";
import { logger } from "./lib/logger";
import { Sentry } from "./lib/sentry";

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

// CORS — only allow origins served from this Replit project (production) and
// localhost (development). REPLIT_DOMAINS is a comma-separated list of all
// domains assigned to this deployment (e.g. "myapp.replit.app").
const allowedOrigins = new Set<string>();
if (process.env.REPLIT_DOMAINS) {
  for (const d of process.env.REPLIT_DOMAINS.split(",")) {
    const domain = d.trim();
    if (domain) allowedOrigins.add(`https://${domain}`);
  }
}
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
  }),
);

// Base64 encoding adds ~33 % overhead, so a 20 MB PDF becomes ~27 MB on the
// wire. Allow 30 MB to give a comfortable margin above the advertised cap.
app.use(express.json({ limit: "30mb" }));
app.use(express.urlencoded({ extended: true, limit: "30mb" }));

const sessionStore = process.env.DATABASE_URL
  ? new PgSession({
      conString: process.env.DATABASE_URL,
      tableName: "sessions",
      createTableIfMissing: true,
    })
  : undefined;

app.use(
  session({
    store: sessionStore,
    secret: SESSION_SECRET ?? "dev-secret-change-in-prod",
    resave: false,
    saveUninitialized: false,
    cookie: {
      // In production the app runs behind Replit's HTTPS proxy — cookies must
      // be Secure. In development (HTTP) keep it off so the session still works.
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      sameSite: "strict",
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
  skip: (req) => req.path === "/me",
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
app.use("/api", globalApiLimiter);
app.use("/api/auth", authLimiter);
app.use("/api/transactions/extract-screenshot", aiLimiter);

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
