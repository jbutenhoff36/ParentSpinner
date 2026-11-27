import "./env";
import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import connectPg from "connect-pg-simple";
import { pool } from "./db";
import { registerRoutes, errorHandler } from "./routes";
import { setupVite, serveStatic, log } from "./vite";

const app = express();
const isProd = process.env.NODE_ENV === "production";

if (isProd) app.set("trust proxy", 1); // hosts like Render/Railway/Fly sit behind a proxy

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false }));

let secret = process.env.SESSION_SECRET;
if (!secret) {
  if (isProd) throw new Error("SESSION_SECRET must be set in production");
  secret = "dev-only-secret-change-me";
  console.warn("SESSION_SECRET not set; using a development-only secret.");
}

// Login sessions live in Postgres, so restarts and redeploys don't log anyone out.
const PgStore = connectPg(session);
const sessionMiddleware = session({
  name: "gsbs.sid",
  store: new PgStore({ pool, tableName: "session", createTableIfMissing: true }),
  secret,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: isProd && process.env.COOKIE_SECURE !== "false",
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  },
});
app.use(sessionMiddleware);

app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    if (req.path.startsWith("/api")) {
      log(`${req.method} ${req.path} ${res.statusCode} in ${Date.now() - start}ms`);
    }
  });
  next();
});

(async () => {
  const server = await registerRoutes(app, sessionMiddleware);

  // Sends the error response and stops there (no re-throw, so one bad request can't crash the server).
  app.use((err: any, req: Request, res: Response, next: NextFunction) => errorHandler(err, req, res, next));

  if (!isProd) {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const port = parseInt(process.env.PORT || "5000", 10);
  server.listen({ port, host: "0.0.0.0" }, () => {
    log(`serving on port ${port}`);
  });
})();

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection:", reason);
});
