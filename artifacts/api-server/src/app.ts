import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import router from "./routes";
import { logger } from "./lib/logger";

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

app.use("/api", router);

export default app;
