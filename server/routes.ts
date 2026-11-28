import type { Express, NextFunction, Request, RequestHandler, Response } from "express";
import { createServer, type Server, type IncomingMessage } from "http";
import { randomBytes, randomInt, scrypt as scryptCb, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { WebSocketServer, WebSocket } from "ws";
import { nanoid } from "nanoid";
import { and, eq, gt, or, sql } from "drizzle-orm";
import { sendPush, pushPublicKey } from "./push";
import { z } from "zod";
import { storage, db } from "./storage";
import {
  childProfiles, goodDayLog, spinRequests, spins, pendingConsequences, users, pushSubscriptions,
  type ChildProfile, type User,
} from "@shared/schema";

declare module "express-session" {
  interface SessionData {
    userId?: number;
    oauthState?: string;
    oauthMode?: "login" | "link";
    googlePending?: { sub: string; email: string | null; name: string | null; at: number };
  }
}

declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

// ---------- helpers ----------

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, 64);
  return `scrypt:${salt.toString("hex")}:${hash.toString("hex")}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (!stored.startsWith("scrypt:")) {
    // Accounts copied from the old app stored plain text; compare in constant time.
    const a = Buffer.from(password);
    const b = Buffer.from(stored);
    return a.length === b.length && timingSafeEqual(a, b);
  }
  const [, saltHex, hashHex] = stored.split(":");
  const expected = Buffer.from(hashHex, "hex");
  const actual = await scrypt(password, Buffer.from(saltHex, "hex"), expected.length);
  return timingSafeEqual(actual, expected);
}

// ---- join codes & rate limits ----

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O or 1/I/L

function newJoinCode(length = 6): string {
  let code = "";
  for (let i = 0; i < length; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

function normalizeCode(value: unknown): string {
  return String(value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** A free username made from a kid's name, like "maya" or "maya42". */
async function freeKidUsername(name: string): Promise<string> {
  let base = name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]/g, "").slice(0, 20);
  if (base.length < 3) base = (base + "kid").slice(0, 20);
  if (!(await storage.getUserByUsername(base))) return base;
  for (let i = 0; i < 20; i++) {
    const candidate = `${base}${randomInt(10, i < 10 ? 100 : 10000)}`;
    if (!(await storage.getUserByUsername(candidate))) return candidate;
  }
  throw new HttpError(500, "Couldn't pick a username. Please type one.");
}

/** Gives a parent a join code if they don't have one yet (retries on the rare clash). */
async function ensureJoinCode(user: User): Promise<User> {
  if (user.role !== "parent" || user.parentId || user.joinCode) return user;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return (await storage.updateUser(user.id, { joinCode: newJoinCode() })) || user;
    } catch (err: any) {
      if (err?.code !== "23505") throw err;
    }
  }
  throw new Error("Could not create a join code");
}

/** Simple in-memory fixed-window limiter (fine for one server instance). */
function rateLimiter(limit: number, windowMs: number, message: string) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  setInterval(() => {
    const now = Date.now();
    hits.forEach((v, k) => {
      if (v.resetAt <= now) hits.delete(k);
    });
  }, windowMs).unref();
  return (key: string) => {
    const now = Date.now();
    const entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      return;
    }
    entry.count++;
    if (entry.count > limit) throw new HttpError(429, message);
  };
}

const loginLimit = rateLimiter(10, 15 * 60 * 1000, "Too many login attempts. Please wait 15 minutes and try again.");
const registerLimit = rateLimiter(20, 60 * 60 * 1000, "Too many sign-ups from this device. Please try again later.");
/** Caps PIN guesses per kid profile from all devices together. */
const kidPinLimit = rateLimiter(20, 15 * 60 * 1000, "Too many tries. Please wait 15 minutes, or ask a parent to reset your PIN.");
const codeLimit = rateLimiter(30, 15 * 60 * 1000, "Too many code checks. Please wait a few minutes and try again.");

function publicUser(user: User) {
  const { password, googleSub, ...rest } = user;
  return { ...rest, hasPassword: !!password, googleLinked: !!googleSub };
}

/** The family a user belongs to: a parent's own ID, or a child's parent ID */
/**
 * The family a user belongs to. A family is identified by the account that started it.
 * Kids and extra parents/guardians point at that account through parentId.
 */
function familyIdOf(user: User): number {
  return user.parentId ?? user.id;
}

function todayKey(): string {
  // Calendar day in the family's time zone (APP_TIMEZONE, else the server's).
  return new Date().toLocaleDateString("en-CA", { timeZone: process.env.APP_TIMEZONE || undefined });
}

const dayKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-01-31");

/** Good days can be logged for today or a missed day in the last two weeks. */
function checkLoggableDay(day: string) {
  const today = todayKey();
  if (day > today) throw new HttpError(400, "You can't log a good day in the future");
  const earliest = new Date(`${today}T12:00:00Z`);
  earliest.setUTCDate(earliest.getUTCDate() - 14);
  if (day < earliest.toISOString().slice(0, 10)) throw new HttpError(400, "You can only log good days from the last two weeks");
}

type Tx = Pick<typeof db, "update" | "select">;

/**
 * Turns every full set of good days into an earned spin and keeps the rest,
 * so reaching the goal always earns a spin however the count got there.
 */
async function settleSpins(tx: Tx, childId: number, required: number) {
  const r = Math.max(1, required);
  const [before] = await tx.select().from(childProfiles).where(eq(childProfiles.id, childId));
  const newSpins = Math.floor(before.goodDayCount / r);
  if (newSpins === 0) return { child: before, newSpins };
  const [child] = await tx.update(childProfiles).set({
    earnedSpins: sql`${childProfiles.earnedSpins} + ${newSpins}`,
    goodDayCount: before.goodDayCount % r,
  }).where(eq(childProfiles.id, childId)).returning();
  return { child, newSpins };
}

async function goodDaysRequiredFor(familyId: number) {
  const config = await storage.getConfiguration(familyId);
  return Math.max(1, config.goodDaysRequired || 7);
}

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const wrap =
  (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res).catch(next);
  };

function parseId(value: string): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, "Invalid ID");
  return id;
}

/** Loads a child profile and makes sure the logged-in user may see it. */
async function loadChild(user: User, childId: number): Promise<ChildProfile> {
  const child = await storage.getChildProfile(childId);
  const allowed =
    !!child &&
    ((user.role === "parent" && child.userId === familyIdOf(user)) ||
      (user.role === "child" && child.childUserId === user.id));
  if (!child || !allowed) throw new HttpError(404, "Child not found");
  return child;
}

async function myChildIds(user: User): Promise<number[]> {
  if (user.role === "parent") return (await storage.getChildProfiles(familyIdOf(user))).map((c) => c.id);
  const own = await storage.getChildProfileByUserId(user.id);
  return own ? [own.id] : [];
}

const requireAuth: RequestHandler = (req, res, next) => {
  const userId = req.session.userId;
  if (!userId) return res.status(401).json({ message: "Not logged in" });
  storage
    .getUser(userId)
    .then((user) => {
      if (!user) {
        req.session.destroy(() => {});
        return res.status(401).json({ message: "Not logged in" });
      }
      req.user = user;
      next();
    })
    .catch(next);
};

const requireParent: RequestHandler = (req, res, next) => {
  if (req.user?.role !== "parent") return res.status(403).json({ message: "Only parents can do this" });
  next();
};

const requireChild: RequestHandler = (req, res, next) => {
  if (req.user?.role !== "child") return res.status(403).json({ message: "Only child accounts can do this" });
  next();
};

function startSession(req: Request, userId: number): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) return reject(err);
      req.session.userId = userId;
      req.session.save((err2) => (err2 ? reject(err2) : resolve()));
    });
  });
}

// ---------- real-time notifications ----------

const sockets = new Map<number, Set<WebSocket>>();

type NoticeType = "info" | "success" | "warning" | "spin" | "goodDay";

/** Tells a user something: live in the open app, and as a phone notification. */
function notifyUser(
  userId: number | null | undefined,
  title: string,
  message: string,
  notificationType: NoticeType = "info",
  url = "/",
) {
  if (!userId) return;
  const payload = JSON.stringify({ type: "notification", data: { title, message, notificationType } });
  sockets.get(userId)?.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(payload);
  });
  void sendPush([userId], { title, body: message, url, tag: notificationType });
}

/** Tells every parent and guardian in a family. */
async function notifyParents(familyId: number | null | undefined, title: string, message: string, notificationType: NoticeType = "info", url = "/") {
  if (!familyId) return;
  for (const p of await familyParents(familyId)) notifyUser(p.id, title, message, notificationType, url);
}

async function familyParents(familyId: number) {
  return db.select().from(users)
    .where(and(eq(users.role, "parent"), or(eq(users.id, familyId), eq(users.parentId, familyId))))
    .orderBy(users.id);
}

function setupWebSocket(server: Server, sessionMiddleware: RequestHandler) {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req: IncomingMessage, socket, head) => {
    const path = (req.url || "").split("?")[0];
    if (path !== "/ws") return; // leave other upgrades (e.g. Vite hot reload) alone

    // Identify the user from their login session cookie, never from the browser's say-so.
    sessionMiddleware(req as Request, {} as Response, () => {
      const userId = (req as Request).session?.userId;
      if (!userId) {
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
        return;
      }
      wss.handleUpgrade(req, socket, head, (ws) => {
        if (!sockets.has(userId)) sockets.set(userId, new Set());
        sockets.get(userId)!.add(ws);
        ws.on("close", () => {
          const set = sockets.get(userId);
          set?.delete(ws);
          if (set && set.size === 0) sockets.delete(userId);
        });
        ws.on("message", () => {
          /* clients don't need to send anything */
        });
        ws.send(JSON.stringify({ type: "connected" }));
      });
    });
  });
}

// Only send pushes to the real browser push services (so the server can't be pointed elsewhere).
const PUSH_HOSTS = ["fcm.googleapis.com", "updates.push.services.mozilla.com", "web.push.apple.com", ".notify.windows.com", ".push.apple.com"];
function isPushServiceUrl(value: string) {
  try {
    const u = new URL(value);
    const extra = (process.env.PUSH_EXTRA_HOSTS || "").split(",").map((h) => h.trim()).filter(Boolean);
    return u.protocol === "https:" && [...PUSH_HOSTS, ...extra].some((h) => (h.startsWith(".") ? u.hostname.endsWith(h) : u.hostname === h));
  } catch {
    return false;
  }
}

// ---------- validation ----------

// Avatars are small data URLs (the browser shrinks photos first) or links.
const avatarSchema = z.string().max(400_000, "That picture is too large")
  .refine((v) => v === "" || v.startsWith("data:image/") || /^https?:\/\//.test(v), "Invalid picture")
  .optional().nullable();

const typeSchema = z.enum(["good", "bad", "fighting"]);

const registerSchema = z.object({
  // Kids joining with a family code may skip the username: one is made from their name.
  username: z.string().trim().min(3, "Username must be at least 3 characters").max(50).optional().or(z.literal("")),
  password: z.string().min(4, "Password or PIN must be at least 4 characters").max(200),
  role: z.enum(["parent", "child"]).default("parent"),
  parentCode: z.string().optional().nullable(),
  childProfileId: z.union([z.string(), z.number()]).optional().nullable(),
  guardianCode: z.string().optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal("")),
  notifyOnSpin: z.boolean().optional().nullable(),
  notifyOnPending: z.boolean().optional().nullable(),
});

function body<S extends z.ZodTypeAny>(schema: S, data: unknown): z.output<S> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new HttpError(400, result.error.issues[0]?.message || "Invalid request");
  }
  return result.data;
}

// ---------- routes ----------

export async function registerRoutes(app: Express, sessionMiddleware: RequestHandler): Promise<Server> {
  // ----- auth (public) -----

  /** Creates a parent (new family) or a child (linked by parent code) and logs them in. */
  async function createAccount(req: Request, data: {
    username: string; passwordHash: string | null; googleSub?: string | null; displayName?: string | null;
    role: "parent" | "child"; parentCode?: string | null; childProfileId?: string | number | null;
    guardianCode?: string | null;
    email?: string | null; notifyOnSpin?: boolean | null; notifyOnPending?: boolean | null;
  }) {
    if (await storage.getUserByUsername(data.username)) {
      throw new HttpError(409, "That username is already taken");
    }

    let parentId: number | null = null;
    let profile: ChildProfile | undefined;
    if (data.role === "child") {
      const code = normalizeCode(data.parentCode);
      const parent = code ? await storage.getParentByJoinCode(code) : undefined;
      if (!parent) throw new HttpError(400, "Invalid parent code");
      profile = data.childProfileId ? await storage.getChildProfile(Number(data.childProfileId)) : undefined;
      if (!profile || profile.userId !== parent.id || profile.childUserId) {
        throw new HttpError(400, "Please pick one of your parent's unclaimed child profiles");
      }
      parentId = parent.id;
    }

    // A parent/guardian joining an existing family
    let joinedFamily: User | undefined;
    if (data.role === "parent" && data.guardianCode) {
      joinedFamily = await storage.getFamilyByGuardianCode(normalizeCode(data.guardianCode));
      if (!joinedFamily) throw new HttpError(400, "That family invite code doesn't match. Ask for a new one.");
      parentId = joinedFamily.id;
    }

    let user = await storage.createUser({
      username: data.username,
      password: data.passwordHash,
      role: data.role,
      parentId,
      email: data.email || null,
      notifyOnSpin: data.notifyOnSpin ?? true,
      notifyOnPending: data.notifyOnPending ?? true,
    });
    if (data.googleSub || data.displayName) {
      user = (await storage.updateUser(user.id, { googleSub: data.googleSub ?? null, displayName: data.displayName ?? null })) || user;
    }

    if (joinedFamily) {
      void notifyParents(joinedFamily.id, "New parent in your family", `${user.displayName || user.username} joined and can now help run KidSpin.`, "info");
    } else if (profile) {
      await storage.updateChildProfile(profile.id, { childUserId: user.id });
      void notifyParents(parentId, "Account linked", `${profile.name} made their own account and can now sign in.`, "info");
    } else {
      user = await ensureJoinCode(user);
      await storage.ensureFamilyDefaults(user.id);
      await storage.getConfiguration(user.id);
    }

    await startSession(req, user.id);
    return user;
  }

  app.post("/api/auth/register", wrap(async (req, res) => {
    registerLimit(req.ip || "unknown");
    const data = body(registerSchema, req.body);
    let username = data.username || "";
    if (!username) {
      if (data.role !== "child") throw new HttpError(400, "Username must be at least 3 characters");
      const profile = data.childProfileId ? await storage.getChildProfile(Number(data.childProfileId)) : undefined;
      username = await freeKidUsername(profile?.name || "kid");
    }
    const user = await createAccount(req, { ...data, username, passwordHash: await hashPassword(data.password) });
    res.status(201).json(publicUser(user));
  }));

  // ----- Sign in with Google (OAuth 2.0 authorization-code flow) -----

  const google = {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    // Overridable only so the flow can be tested against a fake Google.
    authUrl: process.env.GOOGLE_AUTH_URL || "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: process.env.GOOGLE_TOKEN_URL || "https://oauth2.googleapis.com/token",
    userInfoUrl: process.env.GOOGLE_USERINFO_URL || "https://openidconnect.googleapis.com/v1/userinfo",
  };
  const googleEnabled = () => !!(google.clientId && google.clientSecret);
  const appUrl = (req: Request) => (process.env.APP_URL || `${req.protocol}://${req.get("host")}`).replace(/\/$/, "");
  const googleRedirectUri = (req: Request) => `${appUrl(req)}/api/auth/google/callback`;

  app.get("/api/auth/providers", (_req, res) => {
    res.json({ google: googleEnabled() });
  });

  app.get("/api/auth/google", wrap(async (req, res) => {
    if (!googleEnabled()) throw new HttpError(404, "Sign in with Google isn't set up yet");
    const mode = req.query.mode === "link" && req.session.userId ? "link" : "login";
    const state = randomBytes(24).toString("hex");
    req.session.oauthState = state;
    req.session.oauthMode = mode;
    await new Promise<void>((resolve, reject) => req.session.save((e) => (e ? reject(e) : resolve())));
    const params = new URLSearchParams({
      client_id: google.clientId!,
      redirect_uri: googleRedirectUri(req),
      response_type: "code",
      scope: "openid email profile",
      state,
      prompt: "select_account",
    });
    res.redirect(`${google.authUrl}?${params}`);
  }));

  app.get("/api/auth/google/callback", wrap(async (req, res) => {
    const fail = (reason: string) => res.redirect(`/login?error=${encodeURIComponent(reason)}`);
    const { code, state, error } = req.query as Record<string, string | undefined>;
    const expected = req.session.oauthState;
    const mode = req.session.oauthMode || "login";
    delete req.session.oauthState;
    delete req.session.oauthMode;
    if (error) return fail("Google sign-in was cancelled.");
    if (!code || !state || !expected || state.length !== expected.length ||
        !timingSafeEqual(Buffer.from(state), Buffer.from(expected))) {
      return fail("That sign-in link expired. Please try again.");
    }

    const tokenRes = await fetch(google.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code, client_id: google.clientId!, client_secret: google.clientSecret!,
        redirect_uri: googleRedirectUri(req), grant_type: "authorization_code",
      }),
    });
    if (!tokenRes.ok) {
      console.error("Google token exchange failed:", tokenRes.status, await tokenRes.text().catch(() => ""));
      return fail("Google sign-in didn't work. Please try again.");
    }
    const { access_token } = (await tokenRes.json()) as { access_token?: string };
    const infoRes = await fetch(google.userInfoUrl, { headers: { Authorization: `Bearer ${access_token}` } });
    if (!infoRes.ok) return fail("Couldn't read your Google profile. Please try again.");
    const info = (await infoRes.json()) as { sub?: string; email?: string; email_verified?: boolean; name?: string };
    if (!info.sub) return fail("Couldn't read your Google profile. Please try again.");

    const [existing] = await db.select().from(users).where(eq(users.googleSub, info.sub));

    if (mode === "link" && req.session.userId) {
      if (existing && existing.id !== req.session.userId) {
        return res.redirect("/?google=" + encodeURIComponent("That Google account is already used by another login."));
      }
      await storage.updateUser(req.session.userId, { googleSub: info.sub });
      return res.redirect("/?google=linked");
    }

    if (existing) {
      await storage.updateUser(existing.id, { lastLogin: new Date() });
      await startSession(req, existing.id);
      return res.redirect("/");
    }

    // New person: remember who Google says they are, then ask parent or kid.
    req.session.googlePending = {
      sub: info.sub,
      email: info.email_verified ? info.email ?? null : null,
      name: info.name ?? null,
      at: Date.now(),
    };
    await new Promise<void>((resolve, reject) => req.session.save((e) => (e ? reject(e) : resolve())));
    res.redirect("/welcome");
  }));

  function pendingGoogle(req: Request) {
    const p = req.session.googlePending;
    if (!p || Date.now() - p.at > 30 * 60 * 1000) throw new HttpError(404, "Please sign in with Google again");
    return p;
  }

  app.get("/api/auth/google/pending", wrap(async (req, res) => {
    const p = pendingGoogle(req);
    const base = (p.name || p.email?.split("@")[0] || "user").replace(/[^A-Za-z0-9_.-]/g, "").slice(0, 20) || "user";
    let suggestion = base.length >= 3 ? base : `${base}123`;
    for (let i = 2; await storage.getUserByUsername(suggestion); i++) suggestion = `${base}${i}`;
    res.json({ name: p.name, email: p.email, suggestedUsername: suggestion });
  }));

  app.post("/api/auth/google/complete", wrap(async (req, res) => {
    registerLimit(req.ip || "unknown");
    const p = pendingGoogle(req);
    const data = body(z.object({
      username: z.string().trim().min(3, "Username must be at least 3 characters").max(50),
      role: z.enum(["parent", "child"]),
      parentCode: z.string().optional().nullable(),
      childProfileId: z.union([z.string(), z.number()]).optional().nullable(),
      guardianCode: z.string().optional().nullable(),
    }), req.body);
    const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.googleSub, p.sub));
    if (taken) throw new HttpError(409, "This Google account already has a login");
    const user = await createAccount(req, {
      ...data, passwordHash: null, googleSub: p.sub, displayName: p.name, email: p.email,
    });
    res.status(201).json(publicUser(user));
  }));

  app.post("/api/auth/login", wrap(async (req, res) => {
    const { username, password } = body(
      z.object({ username: z.string().trim().min(1), password: z.string().min(1) }),
      req.body,
    );
    loginLimit(`${req.ip}|${username.toLowerCase()}`);
    const user = await storage.getUserByUsername(username);
    if (user && !user.password) {
      throw new HttpError(401, "This account uses Sign in with Google. Tap \"Continue with Google\" instead.");
    }
    if (!user || !(await verifyPassword(password, user.password!))) {
      throw new HttpError(401, "Wrong username or password");
    }
    // Upgrade any old plain-text password on the way in.
    const updates: Partial<User> = { lastLogin: new Date() };
    if (!user.password!.startsWith("scrypt:")) updates.password = await hashPassword(password);
    const updated = (await storage.updateUser(user.id, updates)) || user;
    await startSession(req, user.id);
    res.json(publicUser(updated));
  }));

  app.post("/api/auth/logout", (req, res, next) => {
    req.session.destroy((err) => {
      if (err) return next(err);
      res.clearCookie("gsbs.sid");
      res.json({ message: "Logged out" });
    });
  });

  app.get("/api/auth/verify-parent-code", wrap(async (req, res) => {
    codeLimit(req.ip || "unknown");
    const code = normalizeCode(req.query.code);
    const parent = code.length === 6 ? await storage.getParentByJoinCode(code) : undefined;
    if (!parent) throw new HttpError(404, "Invalid parent code");
    const unlinked = await storage.getUnlinkedChildProfiles(parent.id);
    res.json({
      valid: true,
      parentUsername: parent.username,
      unlinkedChildProfiles: unlinked.map((c) => ({ id: c.id, name: c.name, avatar: c.avatar })),
    });
  }));

  /** Kids in a family who already have a login (for "sign in with family code"). */
  app.get("/api/auth/family-kids", wrap(async (req, res) => {
    codeLimit(req.ip || "unknown");
    const code = normalizeCode(req.query.code);
    const parent = code.length === 6 ? await storage.getParentByJoinCode(code) : undefined;
    if (!parent) throw new HttpError(404, "That code doesn't match a family");
    const kids = (await storage.getChildProfiles(parent.id)).filter((c) => c.childUserId);
    res.json({
      familyOf: parent.displayName || parent.username,
      kids: kids.map((c) => ({ id: c.id, name: c.name, avatar: c.avatar })),
    });
  }));

  /** Kid sign-in with family code + "which one are you" + PIN (their password). */
  app.post("/api/auth/kid-login", wrap(async (req, res) => {
    const data = body(z.object({
      code: z.string().min(1, "Enter your family code"),
      childProfileId: z.coerce.number().int().positive("Pick your name"),
      pin: z.string().min(1, "Enter your PIN"),
    }), req.body);
    loginLimit(`${req.ip}|kid:${data.childProfileId}`);
    kidPinLimit(String(data.childProfileId));
    const parent = await storage.getParentByJoinCode(normalizeCode(data.code));
    const profile = await storage.getChildProfile(data.childProfileId);
    if (!parent || !profile || profile.userId !== parent.id || !profile.childUserId) {
      throw new HttpError(401, "Wrong parent code or PIN");
    }
    const user = await storage.getUser(profile.childUserId);
    if (!user || user.role !== "child") throw new HttpError(401, "Wrong parent code or PIN");
    if (!user.password) {
      throw new HttpError(401, "This account uses Sign in with Google. Tap \"Continue with Google\" instead.");
    }
    if (!(await verifyPassword(data.pin, user.password))) throw new HttpError(401, "Wrong parent code or PIN");
    const updates: Partial<User> = { lastLogin: new Date() };
    if (!user.password.startsWith("scrypt:")) updates.password = await hashPassword(data.pin);
    const updated = (await storage.updateUser(user.id, updates)) || user;
    await startSession(req, user.id);
    res.json(publicUser(updated));
  }));

  app.get("/api/auth/verify-guardian-code", wrap(async (req, res) => {
    codeLimit(req.ip || "unknown");
    const code = normalizeCode(req.query.code);
    const family = code.length === 8 ? await storage.getFamilyByGuardianCode(code) : undefined;
    if (!family) return res.json({ valid: false });
    res.json({ valid: true, familyOf: family.displayName || family.username });
  }));

  // Everything below needs a logged-in user.
  app.use("/api", requireAuth);

  app.get("/api/auth/me", wrap(async (req, res) => {
    const me = await ensureJoinCode(req.user!);
    const family = me.parentId ? await storage.getUser(me.parentId) : me;
    res.json({ ...publicUser(me), joinCode: me.role === "parent" ? family?.joinCode ?? null : null, familyStarter: !me.parentId });
  }));

  // ----- family: parents & guardians -----

  async function ensureGuardianCode(familyId: number): Promise<string> {
    const starter = await storage.getUser(familyId);
    if (starter?.guardianCode) return starter.guardianCode;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        return (await storage.updateUser(familyId, { guardianCode: newJoinCode(8) }))!.guardianCode!;
      } catch (err: any) {
        if (err?.code !== "23505") throw err;
      }
    }
    throw new Error("Could not create a code");
  }

  app.get("/api/family", requireParent, wrap(async (req, res) => {
    const familyId = familyIdOf(req.user!);
    const parents = await familyParents(familyId);
    res.json({
      guardianCode: await ensureGuardianCode(familyId),
      parents: parents.map((p) => ({
        id: p.id, name: p.displayName || p.username, username: p.username,
        starter: p.id === familyId, you: p.id === req.user!.id,
      })),
    });
  }));

  app.post("/api/family/guardian-code", requireParent, wrap(async (req, res) => {
    const familyId = familyIdOf(req.user!);
    await storage.updateUser(familyId, { guardianCode: null });
    res.json({ guardianCode: await ensureGuardianCode(familyId) });
  }));

  // Remove another parent/guardian (or leave, if it's you). The family starter can't be removed.
  app.delete("/api/family/parents/:id", requireParent, wrap(async (req, res) => {
    const familyId = familyIdOf(req.user!);
    const target = await storage.getUser(parseId(req.params.id));
    if (!target || target.role !== "parent" || target.parentId !== familyId) {
      throw new HttpError(404, target?.id === familyId ? "The person who started the family can't be removed" : "Not in your family");
    }
    // They get an empty family of their own, so their login still works.
    await storage.updateUser(target.id, { parentId: null });
    await ensureJoinCode((await storage.getUser(target.id))!);
    await storage.ensureFamilyDefaults(target.id);
    await storage.getConfiguration(target.id);
    res.json({ message: "Removed" });
  }));

  app.get("/api/push/key", (_req, res) => {
    res.json({ publicKey: pushPublicKey() });
  });

  app.post("/api/push/subscribe", wrap(async (req, res) => {
    const sub = body(z.object({
      endpoint: z.string().url().max(2000).refine(isPushServiceUrl, "That isn't a known push service"),
      keys: z.object({ p256dh: z.string().min(10).max(500), auth: z.string().min(4).max(200) }),
    }), req.body);
    await db.insert(pushSubscriptions)
      .values({ userId: req.user!.id, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth })
      .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: { userId: req.user!.id, p256dh: sub.keys.p256dh, auth: sub.keys.auth } });
    res.status(201).json({ message: "Notifications on" });
  }));

  app.post("/api/push/unsubscribe", wrap(async (req, res) => {
    const { endpoint } = body(z.object({ endpoint: z.string().max(2000) }), req.body);
    await db.delete(pushSubscriptions).where(and(eq(pushSubscriptions.endpoint, endpoint), eq(pushSubscriptions.userId, req.user!.id)));
    res.json({ message: "Notifications off" });
  }));

  // Send a test notification to your own devices
  app.post("/api/push/test", wrap(async (req, res) => {
    await sendPush([req.user!.id], { title: "KidSpin notifications are on ✅", body: "You'll get a heads-up like this when something needs you.", url: "/" });
    res.json({ message: "Sent" });
  }));

  app.post("/api/auth/google/unlink", wrap(async (req, res) => {
    if (!req.user!.password) throw new HttpError(400, "Set a password first, or you won't be able to sign in");
    res.json(publicUser((await storage.updateUser(req.user!.id, { googleSub: null }))!));
  }));

  // Set or change your own password (Google-only accounts can add one here)
  app.post("/api/auth/password", wrap(async (req, res) => {
    const data = body(z.object({
      currentPassword: z.string().optional(),
      newPassword: z.string().min(6, "Password must be at least 6 characters").max(200),
    }), req.body);
    const user = req.user!;
    if (user.password && !(data.currentPassword && (await verifyPassword(data.currentPassword, user.password)))) {
      throw new HttpError(400, "Your current password is wrong");
    }
    await storage.updateUser(user.id, { password: await hashPassword(data.newPassword) });
    res.json({ message: "Password saved" });
  }));

  // Parent: get a fresh join code (the old one stops working)
  app.post("/api/auth/join-code", requireParent, wrap(async (req, res) => {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const updated = await storage.updateUser(familyIdOf(req.user!), { joinCode: newJoinCode() });
        return res.json({ joinCode: updated!.joinCode });
      } catch (err: any) {
        if (err?.code !== "23505") throw err;
      }
    }
    throw new Error("Could not create a join code");
  }));

  // Parent: set a new password for one of their child accounts
  app.post("/api/children/:id/password", requireParent, wrap(async (req, res) => {
    const child = await loadChild(req.user!, parseId(req.params.id));
    if (!child.childUserId) throw new HttpError(400, "This child hasn't made an account yet");
    const { password } = body(z.object({ password: z.string().min(4, "Password must be at least 4 characters").max(200) }), req.body);
    await storage.updateUser(child.childUserId, { password: await hashPassword(password) });
    res.json({ message: "Password updated" });
  }));

  app.get("/api/auth/me/profile", wrap(async (req, res) => {
    if (req.user!.role !== "child") throw new HttpError(404, "No child profile for this account");
    const profile = await storage.getChildProfileByUserId(req.user!.id);
    if (!profile) throw new HttpError(404, "No child profile linked to this account");
    res.json(profile);
  }));

  // ----- children -----

  app.get("/api/children", wrap(async (req, res) => {
    const user = req.user!;
    if (user.role === "parent") return res.json(await storage.getChildProfiles(familyIdOf(user)));
    const own = await storage.getChildProfileByUserId(user.id);
    res.json(own ? [own] : []);
  }));

  app.get("/api/children/:id", wrap(async (req, res) => {
    res.json(await loadChild(req.user!, parseId(req.params.id)));
  }));

  app.post("/api/children", requireParent, wrap(async (req, res) => {
    const data = body(z.object({ name: z.string().trim().min(1, "Name is required").max(50), avatar: avatarSchema }), req.body);
    const child = await storage.createChildProfile({ name: data.name, avatar: data.avatar ?? null, userId: familyIdOf(req.user!) });
    res.status(201).json(child);
  }));

  app.put("/api/children/:id", requireParent, wrap(async (req, res) => {
    const child = await loadChild(req.user!, parseId(req.params.id));
    const data = body(z.object({
      name: z.string().trim().min(1).max(50).optional(),
      avatar: avatarSchema,
      active: z.boolean().optional(),
    }), req.body);
    res.json(await storage.updateChildProfile(child.id, data));
  }));

  app.delete("/api/children/:id", requireParent, wrap(async (req, res) => {
    const child = await loadChild(req.user!, parseId(req.params.id));
    await storage.deleteChildProfile(child.id);
    res.json({ message: "Child deleted" });
  }));

  app.get("/api/children/:id/pending", wrap(async (req, res) => {
    const child = await loadChild(req.user!, parseId(req.params.id));
    res.json(await storage.getPendingForChildren([child.id]));
  }));

  app.get("/api/children/:id/gooddays", requireParent, wrap(async (req, res) => {
    const child = await loadChild(req.user!, parseId(req.params.id));
    res.json(await storage.getGoodDayLogs(child.id));
  }));

  app.post("/api/children/:id/goodday", requireParent, wrap(async (req, res) => {
    const child = await loadChild(req.user!, parseId(req.params.id));
    const required = await goodDaysRequiredFor(familyIdOf(req.user!));
    const { day = todayKey() } = body(z.object({ day: dayKeySchema.optional() }), req.body ?? {});
    checkLoggableDay(day);

    try {
      const result = await db.transaction(async (tx) => {
        const [log] = await tx.insert(goodDayLog).values({ childId: child.id, userId: req.user!.id, day }).returning();
        await tx.update(childProfiles).set({ goodDayCount: sql`${childProfiles.goodDayCount} + 1` })
          .where(eq(childProfiles.id, child.id));
        const { child: updated, newSpins } = await settleSpins(tx, child.id, required);
        return { log, child: updated, isSpinAvailable: newSpins > 0 };
      });

      if (req.query.skipNotifications !== "true") {
        notifyUser(
          child.childUserId,
          result.isSpinAvailable ? "You earned a spin! 🎉" : "Good day! ⭐",
          result.isSpinAvailable
            ? "Open KidSpin to spin the reward wheel."
            : `${result.child.goodDayCount} of ${required} good days toward your next spin.`,
          "goodDay",
          result.isSpinAvailable ? "/spin" : "/",
        );
      }
      res.status(201).json({
        ...result,
        message: result.isSpinAvailable ? `${child.name} earned a spin!` : "Good day logged",
      });
    } catch (err: any) {
      if (err?.code === "23505") {
        throw new HttpError(409, day === todayKey() ? "Already logged a good day today" : `Already logged a good day on ${day}`);
      }
      throw err;
    }
  }));

  // Undo a good day logged by mistake. If it had just turned into a spin, the spin goes back too.
  app.delete("/api/children/:id/goodday/:day", requireParent, wrap(async (req, res) => {
    const child = await loadChild(req.user!, parseId(req.params.id));
    const day = body(dayKeySchema, req.params.day);
    const required = await goodDaysRequiredFor(familyIdOf(req.user!));
    const updated = await db.transaction(async (tx) => {
      const [removed] = await tx.delete(goodDayLog)
        .where(and(eq(goodDayLog.childId, child.id), eq(goodDayLog.day, day))).returning();
      if (!removed) throw new HttpError(404, "No good day logged on that day");
      const [current] = await tx.select().from(childProfiles).where(eq(childProfiles.id, child.id)).for("update");
      if (current.goodDayCount > 0) {
        const [c] = await tx.update(childProfiles).set({ goodDayCount: current.goodDayCount - 1 })
          .where(eq(childProfiles.id, child.id)).returning();
        return c;
      }
      const waiting = await storage.countPendingGoodRequests(child.id);
      if (current.earnedSpins - waiting <= 0) {
        throw new HttpError(409, "That good day already became a spin that was used, so it can't be undone");
      }
      const [c] = await tx.update(childProfiles)
        .set({ earnedSpins: current.earnedSpins - 1, goodDayCount: required - 1 })
        .where(eq(childProfiles.id, child.id)).returning();
      return c;
    });
    res.json(updated);
  }));

  app.post("/api/children/:id/badspin", requireParent, wrap(async (req, res) => {
    const child = await loadChild(req.user!, parseId(req.params.id));
    res.json(await storage.updateChildProfile(child.id, { goodDayCount: 0, lastBadSpinDate: new Date() }));
  }));

  app.post("/api/children/:id/reset-spins", requireParent, wrap(async (req, res) => {
    const child = await loadChild(req.user!, parseId(req.params.id));
    res.json(await storage.updateChildProfile(child.id, { earnedSpins: 0 }));
  }));

  app.put("/api/children/:id/statistics", requireParent, wrap(async (req, res) => {
    const child = await loadChild(req.user!, parseId(req.params.id));
    const optDate = z.union([z.string(), z.null()]).optional()
      .transform((v) => (v === undefined ? undefined : v === null || v === "" ? null : new Date(v)));
    const data = body(z.object({
      goodDayCount: z.coerce.number().int().min(0).max(1000).optional(),
      earnedSpins: z.coerce.number().int().min(0).max(1000).optional(),
      createdAt: optDate,
      lastBadSpinDate: optDate,
      lastGoodSpinDate: optDate,
    }), req.body);
    const updates: Partial<ChildProfile> = {};
    for (const [k, v] of Object.entries(data)) {
      if (v === undefined) continue;
      if (v instanceof Date && isNaN(v.getTime())) throw new HttpError(400, `Invalid date for ${k}`);
      if (k === "createdAt" && v === null) continue;
      (updates as any)[k] = v;
    }
    await storage.updateChildProfile(child.id, updates);
    // Reaching the good-day goal by editing the count still earns the spin(s).
    const { child: updated, newSpins } = await settleSpins(db, child.id, await goodDaysRequiredFor(familyIdOf(req.user!)));
    if (newSpins > 0) notifyUser(child.childUserId, "You earned a spin! 🎉", "Open KidSpin to spin the reward wheel.", "goodDay", "/spin");
    res.json(updated);
  }));

  // ----- consequences (the family's wheels) -----

  app.get("/api/consequences", wrap(async (req, res) => {
    const type = typeof req.query.type === "string" ? body(typeSchema, req.query.type) : undefined;
    res.json(await storage.getConsequences(familyIdOf(req.user!), type));
  }));

  app.post("/api/consequences", requireParent, wrap(async (req, res) => {
    const data = body(z.object({
      text: z.string().trim().min(1, "Text is required").max(200),
      type: typeSchema,
      section: z.coerce.number().int().min(1).max(50).optional(),
    }), req.body);
    const existing = await storage.getConsequences(familyIdOf(req.user!), data.type);
    const section = data.section ?? (existing.reduce((m, c) => Math.max(m, c.section), 0) + 1);
    res.status(201).json(await storage.createConsequence({ ...data, section, userId: familyIdOf(req.user!) }));
  }));

  async function loadConsequence(user: User, id: number) {
    const c = await storage.getConsequence(id);
    if (!c || c.userId !== familyIdOf(user)) throw new HttpError(404, "Consequence not found");
    return c;
  }

  app.put("/api/consequences/:id", requireParent, wrap(async (req, res) => {
    const c = await loadConsequence(req.user!, parseId(req.params.id));
    const data = body(z.object({
      text: z.string().trim().min(1).max(200).optional(),
      type: typeSchema.optional(),
      section: z.coerce.number().int().min(1).max(50).optional(),
    }), req.body);
    res.json(await storage.updateConsequence(c.id, data));
  }));

  app.delete("/api/consequences/:id", requireParent, wrap(async (req, res) => {
    const c = await loadConsequence(req.user!, parseId(req.params.id));
    await storage.deleteConsequence(c);
    res.json({ message: "Consequence deleted" });
  }));

  // ----- earned / pending consequences -----

  app.get("/api/pending", wrap(async (req, res) => {
    res.json(await storage.getPendingForChildren(await myChildIds(req.user!)));
  }));

  app.post("/api/pending", requireParent, wrap(async (req, res) => {
    const data = body(z.object({
      consequenceId: z.coerce.number().int().optional().nullable(),
      text: z.string().trim().min(1).max(200),
      type: typeSchema,
      section: z.coerce.number().int().min(0).max(50).default(0),
      childId: z.coerce.number().int(),
    }), req.body);
    const child = await loadChild(req.user!, data.childId);
    if (data.consequenceId) await loadConsequence(req.user!, data.consequenceId);
    const p = await storage.addPending({ ...data, section: data.section ?? 0, consequenceId: data.consequenceId ?? null, childId: child.id, userId: req.user!.id });
    notifyUser(child.childUserId, "Added to your list", p.text, "info", "/todos");
    res.status(201).json(p);
  }));

  async function loadPending(user: User, id: number) {
    const p = await storage.getPending(id);
    if (!p) throw new HttpError(404, "Not found");
    await loadChild(user, p.childId);
    return p;
  }

  app.post("/api/pending/:id/complete", requireParent, wrap(async (req, res) => {
    const p = await loadPending(req.user!, parseId(req.params.id));
    await storage.completePending(p.id);
    res.json({ message: "Marked complete" });
  }));

  app.delete("/api/pending/:id", requireParent, wrap(async (req, res) => {
    const p = await loadPending(req.user!, parseId(req.params.id));
    await storage.deletePending(p.id);
    res.json({ message: "Deleted" });
  }));

  app.delete("/api/pending", requireParent, wrap(async (req, res) => {
    await storage.deletePendingForChildren(await myChildIds(req.user!));
    res.json({ message: "Cleared" });
  }));

  // ----- configuration -----

  app.get("/api/config", wrap(async (req, res) => {
    res.json(await storage.getConfiguration(familyIdOf(req.user!)));
  }));

  app.post("/api/config", requireParent, wrap(async (req, res) => {
    const data = body(z.object({
      wheelSettings: z.any().optional(),
      notificationTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional(),
      goodDaysRequired: z.coerce.number().int().min(1).max(60).optional(),
      notificationsEnabled: z.boolean().optional(),
    }), req.body);
    const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
    const saved = await storage.saveConfiguration(familyIdOf(req.user!), clean);
    // Lowering the goal can mean some kids have already reached it.
    if (data.goodDaysRequired) {
      for (const c of await storage.getChildProfiles(familyIdOf(req.user!))) {
        const { newSpins } = await settleSpins(db, c.id, saved.goodDaysRequired);
        if (newSpins > 0) notifyUser(c.childUserId, "You earned a spin! 🎉", "Open KidSpin to spin the reward wheel.", "goodDay", "/spin");
      }
    }
    res.json(saved);
  }));

  // ----- spins (server picks the result) -----

  /** Earned spins not already tied up in a waiting request */
  async function availableGoodSpins(child: ChildProfile) {
    return child.earnedSpins - (await storage.countPendingGoodRequests(child.id));
  }

  app.post("/api/spins", wrap(async (req, res) => {
    const user = req.user!;
    const data = body(z.object({ type: typeSchema, childId: z.coerce.number().int().optional() }), req.body);

    let child: ChildProfile;
    if (user.role === "child") {
      const own = await storage.getChildProfileByUserId(user.id);
      if (!own) throw new HttpError(404, "No child profile linked to this account");
      child = own;
      if (data.type !== "good") throw new HttpError(403, "Only a parent can start a Bad or Fighting spin");
    } else {
      if (!data.childId) throw new HttpError(400, "Pick a child first");
      child = await loadChild(user, data.childId);
    }

    if (data.type === "good" && (await availableGoodSpins(child)) <= 0) {
      throw new HttpError(403, "No earned spins available");
    }

    // A child gets one result per earned spin: spinning again before sending
    // the request lands on the same slice, so there's no re-rolling.
    if (user.role === "child") {
      const open = await storage.getOpenGoodSpin(child.id, user.id);
      if (open) {
        return res.json({
          spinId: open.id, type: open.type, section: open.section,
          consequence: { id: open.consequenceId, text: open.text, type: open.type, section: open.section },
        });
      }
    }

    const options = await storage.getConsequences(familyIdOf(user), data.type);
    if (options.length === 0) throw new HttpError(400, `There are no ${data.type} consequences on this wheel yet`);
    const pick = options[randomInt(options.length)];

    const spin = await storage.createSpin({
      id: nanoid(21),
      familyId: familyIdOf(user),
      childId: child.id,
      createdBy: user.id,
      type: pick.type,
      section: pick.section,
      consequenceId: pick.id,
      text: pick.text,
    });

    res.json({
      spinId: spin.id, type: spin.type, section: spin.section,
      consequence: { id: pick.id, text: pick.text, type: pick.type, section: pick.section },
    });
  }));

  /** Parent keeps a spin result: it goes straight onto the child's earned list. */
  app.post("/api/spins/:id/accept", requireParent, wrap(async (req, res) => {
    const user = req.user!;
    const spin = await storage.getSpin(req.params.id);
    if (!spin || spin.familyId !== familyIdOf(user) || spin.createdBy !== user.id) throw new HttpError(404, "Spin not found");
    const child = await loadChild(user, spin.childId);

    const pending = await db.transaction(async (tx) => {
      const [claimed] = await tx.update(spins).set({ status: "accepted" })
        .where(and(eq(spins.id, spin.id), eq(spins.status, "open"))).returning();
      if (!claimed) throw new HttpError(409, "This spin was already used");

      if (spin.type === "good") {
        const waiting = await storage.countPendingGoodRequests(child.id);
        const [used] = await tx.update(childProfiles)
          .set({ earnedSpins: sql`${childProfiles.earnedSpins} - 1`, lastGoodSpinDate: new Date() })
          .where(and(eq(childProfiles.id, child.id), gt(childProfiles.earnedSpins, waiting)))
          .returning();
        if (!used) throw new HttpError(409, "No earned spins available");
      } else {
        await tx.update(childProfiles).set({ lastBadSpinDate: new Date() }).where(eq(childProfiles.id, child.id));
      }

      const [p] = await tx.insert(pendingConsequences).values({
        consequenceId: spin.consequenceId, text: spin.text, type: spin.type, section: spin.section,
        childId: child.id, userId: user.id,
      }).returning();
      return p;
    });

    notifyUser(child.childUserId, spin.type === "good" ? "You won a prize!" : "Added to your list", pending.text, spin.type === "good" ? "success" : "warning", "/todos");
    res.status(201).json(pending);
  }));

  // ----- spin requests (child asks, parent approves) -----

  app.post("/api/spinrequests", requireChild, wrap(async (req, res) => {
    const user = req.user!;
    const data = body(z.object({
      spinId: z.string().min(1),
      description: z.string().trim().min(1, "Please say why you deserve this spin").max(500),
    }), req.body);

    const spin = await storage.getSpin(data.spinId);
    if (!spin || spin.createdBy !== user.id) throw new HttpError(404, "Spin not found");
    const child = await loadChild(user, spin.childId);
    if (spin.type === "good" && (await availableGoodSpins(child)) <= 0) {
      throw new HttpError(403, "No earned spins available");
    }

    const request = await db.transaction(async (tx) => {
      const [claimed] = await tx.update(spins).set({ status: "requested" })
        .where(and(eq(spins.id, spin.id), eq(spins.status, "open"))).returning();
      if (!claimed) throw new HttpError(409, "This spin was already sent");
      const [r] = await tx.insert(spinRequests).values({
        childId: child.id,
        userId: user.id,
        status: "pending",
        consequenceId: spin.consequenceId,
        consequenceText: spin.text,
        section: spin.section,
        type: spin.type,
        description: data.description,
        spinId: spin.id,
      }).returning();
      return r;
    });

    void notifyParents(child.userId, `${child.name} wants to keep a prize`, `They landed on "${spin.text}". Tap to approve.`, "spin", "/");
    res.status(201).json(request);
  }));

  app.get("/api/spinrequests/pending", requireParent, wrap(async (req, res) => {
    const children = await storage.getChildProfiles(familyIdOf(req.user!));
    const names = new Map(children.map((c) => [c.id, c.name]));
    const requests = await storage.getPendingRequestsForChildren(children.map((c) => c.id));
    res.json(requests.map((r) => ({ ...r, childName: names.get(r.childId) ?? null })));
  }));

  app.get("/api/spinrequests/mine", requireChild, wrap(async (req, res) => {
    const own = await storage.getChildProfileByUserId(req.user!.id);
    res.json(own ? await storage.getRequestsForChild(own.id) : []);
  }));

  async function loadRequest(user: User, id: number) {
    const r = await storage.getSpinRequest(id);
    if (!r) throw new HttpError(404, "Request not found");
    const child = await loadChild(user, r.childId);
    return { r, child };
  }

  app.post("/api/spinrequests/:id/approve", requireParent, wrap(async (req, res) => {
    const user = req.user!;
    const { r, child } = await loadRequest(user, parseId(req.params.id));

    const updated = await db.transaction(async (tx) => {
      const [claimed] = await tx.update(spinRequests)
        .set({ status: "approved", approvedAt: new Date(), approvedBy: user.id, addedToPending: true })
        .where(and(eq(spinRequests.id, r.id), eq(spinRequests.status, "pending"))).returning();
      if (!claimed) throw new HttpError(409, "This request was already handled");

      if (r.type === "good") {
        const [used] = await tx.update(childProfiles)
          .set({ earnedSpins: sql`${childProfiles.earnedSpins} - 1`, lastGoodSpinDate: new Date() })
          .where(and(eq(childProfiles.id, child.id), gt(childProfiles.earnedSpins, 0))).returning();
        if (!used) throw new HttpError(409, "This child has no earned spins left");
      }

      await tx.insert(pendingConsequences).values({
        consequenceId: r.consequenceId,
        text: r.consequenceText || "Spin result",
        type: r.type || "good",
        section: r.section ?? 0,
        childId: child.id,
        userId: user.id,
      });
      return claimed;
    });

    notifyUser(child.childUserId, "Prize approved! 🎉", `"${r.consequenceText}" is on your list.`, "success", "/todos");
    res.json(updated);
  }));

  app.post("/api/spinrequests/:id/reject", requireParent, wrap(async (req, res) => {
    const user = req.user!;
    const { r, child } = await loadRequest(user, parseId(req.params.id));
    const [updated] = await db.update(spinRequests)
      .set({ status: "rejected", approvedAt: new Date(), approvedBy: user.id })
      .where(and(eq(spinRequests.id, r.id), eq(spinRequests.status, "pending"))).returning();
    if (!updated) throw new HttpError(409, "This request was already handled");
    notifyUser(child.childUserId, "Not approved this time", `"${r.consequenceText}" wasn't approved, but your spin is still yours.`, "warning", "/spin");
    res.json(updated);
  }));

  // Unknown API routes
  app.use("/api", (_req, res) => {
    res.status(404).json({ message: "Not found" });
  });

  const httpServer = createServer(app);
  setupWebSocket(httpServer, sessionMiddleware);
  return httpServer;
}

export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  const status = err instanceof HttpError ? err.status : err.status || err.statusCode || 500;
  const message = status >= 500 ? "Something went wrong" : err.message || "Request failed";
  if (status >= 500) console.error(err);
  if (res.headersSent) return;
  res.status(status).json({ message });
}
