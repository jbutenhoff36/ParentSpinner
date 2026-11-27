import type { Express, NextFunction, Request, RequestHandler, Response } from "express";
import { createServer, type Server, type IncomingMessage } from "http";
import { randomBytes, randomInt, scrypt as scryptCb, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { WebSocketServer, WebSocket } from "ws";
import { nanoid } from "nanoid";
import { and, eq, gt, sql } from "drizzle-orm";
import { z } from "zod";
import { storage, db } from "./storage";
import {
  childProfiles, goodDayLog, spinRequests, spins, pendingConsequences,
  type ChildProfile, type User,
} from "@shared/schema";

declare module "express-session" {
  interface SessionData {
    userId?: number;
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

function publicUser(user: User) {
  const { password: _pw, ...rest } = user;
  return rest;
}

/** The family a user belongs to: a parent's own ID, or a child's parent ID */
function familyIdOf(user: User): number {
  return user.role === "parent" ? user.id : (user.parentId as number);
}

function todayKey(): string {
  // Calendar day in the family's time zone (APP_TIMEZONE, else the server's).
  return new Date().toLocaleDateString("en-CA", { timeZone: process.env.APP_TIMEZONE || undefined });
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
    ((user.role === "parent" && child.userId === user.id) ||
      (user.role === "child" && child.childUserId === user.id));
  if (!child || !allowed) throw new HttpError(404, "Child not found");
  return child;
}

async function myChildIds(user: User): Promise<number[]> {
  if (user.role === "parent") return (await storage.getChildProfiles(user.id)).map((c) => c.id);
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

function notifyUser(
  userId: number | null | undefined,
  title: string,
  message: string,
  notificationType: "info" | "success" | "warning" | "spin" | "goodDay" = "info",
) {
  if (!userId) return;
  const payload = JSON.stringify({ type: "notification", data: { title, message, notificationType } });
  sockets.get(userId)?.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(payload);
  });
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

// ---------- validation ----------

const typeSchema = z.enum(["good", "bad", "fighting"]);

const registerSchema = z.object({
  username: z.string().trim().min(3, "Username must be at least 3 characters").max(50),
  password: z.string().min(4, "Password must be at least 4 characters").max(200),
  role: z.enum(["parent", "child"]).default("parent"),
  parentCode: z.string().optional().nullable(),
  childProfileId: z.union([z.string(), z.number()]).optional().nullable(),
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

  app.post("/api/auth/register", wrap(async (req, res) => {
    const data = body(registerSchema, req.body);
    if (await storage.getUserByUsername(data.username)) {
      throw new HttpError(409, "That username is already taken");
    }

    let parentId: number | null = null;
    let profile: ChildProfile | undefined;
    if (data.role === "child") {
      const parent = data.parentCode ? await storage.getUser(Number(data.parentCode)) : undefined;
      if (!parent || parent.role !== "parent") throw new HttpError(400, "Invalid parent code");
      profile = data.childProfileId ? await storage.getChildProfile(Number(data.childProfileId)) : undefined;
      if (!profile || profile.userId !== parent.id || profile.childUserId) {
        throw new HttpError(400, "Please pick one of your parent's unclaimed child profiles");
      }
      parentId = parent.id;
    }

    const user = await storage.createUser({
      username: data.username,
      password: await hashPassword(data.password),
      role: data.role,
      parentId,
      email: data.email || null,
      notifyOnSpin: data.notifyOnSpin ?? true,
      notifyOnPending: data.notifyOnPending ?? true,
    });

    if (profile) {
      await storage.updateChildProfile(profile.id, { childUserId: user.id });
    } else {
      await storage.ensureFamilyDefaults(user.id);
      await storage.getConfiguration(user.id);
    }

    await startSession(req, user.id);
    res.status(201).json(publicUser(user));
  }));

  app.post("/api/auth/login", wrap(async (req, res) => {
    const { username, password } = body(
      z.object({ username: z.string().trim().min(1), password: z.string().min(1) }),
      req.body,
    );
    const user = await storage.getUserByUsername(username);
    if (!user || !(await verifyPassword(password, user.password))) {
      throw new HttpError(401, "Wrong username or password");
    }
    // Upgrade any old plain-text password on the way in.
    const updates: Partial<User> = { lastLogin: new Date() };
    if (!user.password.startsWith("scrypt:")) updates.password = await hashPassword(password);
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
    const code = Number(req.query.code);
    const parent = Number.isInteger(code) && code > 0 ? await storage.getUser(code) : undefined;
    if (!parent || parent.role !== "parent") throw new HttpError(404, "Invalid parent code");
    const unlinked = await storage.getUnlinkedChildProfiles(parent.id);
    res.json({
      valid: true,
      parentUsername: parent.username,
      unlinkedChildProfiles: unlinked.map((c) => ({ id: c.id, name: c.name, avatar: c.avatar })),
    });
  }));

  // Everything below needs a logged-in user.
  app.use("/api", requireAuth);

  app.get("/api/auth/me", (req, res) => {
    res.json(publicUser(req.user!));
  });

  app.get("/api/auth/me/profile", wrap(async (req, res) => {
    if (req.user!.role !== "child") throw new HttpError(404, "No child profile for this account");
    const profile = await storage.getChildProfileByUserId(req.user!.id);
    if (!profile) throw new HttpError(404, "No child profile linked to this account");
    res.json(profile);
  }));

  // ----- children -----

  app.get("/api/children", wrap(async (req, res) => {
    const user = req.user!;
    if (user.role === "parent") return res.json(await storage.getChildProfiles(user.id));
    const own = await storage.getChildProfileByUserId(user.id);
    res.json(own ? [own] : []);
  }));

  app.get("/api/children/:id", wrap(async (req, res) => {
    res.json(await loadChild(req.user!, parseId(req.params.id)));
  }));

  app.post("/api/children", requireParent, wrap(async (req, res) => {
    const data = body(z.object({ name: z.string().trim().min(1, "Name is required").max(50), avatar: z.string().max(500).optional().nullable() }), req.body);
    const child = await storage.createChildProfile({ name: data.name, avatar: data.avatar ?? null, userId: req.user!.id });
    res.status(201).json(child);
  }));

  app.put("/api/children/:id", requireParent, wrap(async (req, res) => {
    const child = await loadChild(req.user!, parseId(req.params.id));
    const data = body(z.object({
      name: z.string().trim().min(1).max(50).optional(),
      avatar: z.string().max(500).optional().nullable(),
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
    const config = await storage.getConfiguration(req.user!.id);
    const required = Math.max(1, config.goodDaysRequired || 7);
    const day = todayKey();

    try {
      const result = await db.transaction(async (tx) => {
        const [log] = await tx.insert(goodDayLog).values({ childId: child.id, userId: req.user!.id, day }).returning();
        const newCount = child.goodDayCount + 1;
        const earned = newCount >= required;
        const [updated] = await tx.update(childProfiles).set(
          earned
            ? { goodDayCount: 0, earnedSpins: sql`${childProfiles.earnedSpins} + 1` }
            : { goodDayCount: newCount },
        ).where(eq(childProfiles.id, child.id)).returning();
        return { log, child: updated, isSpinAvailable: earned };
      });

      if (req.query.skipNotifications !== "true") {
        notifyUser(
          child.childUserId,
          result.isSpinAvailable ? "You earned a spin!" : "Good day!",
          result.isSpinAvailable
            ? "Great job! You earned a Good Spin."
            : `Good day logged: ${result.child.goodDayCount}/${required} toward your next spin.`,
          "goodDay",
        );
      }
      res.status(201).json({
        ...result,
        message: result.isSpinAvailable ? `${child.name} earned a spin!` : "Good day logged",
      });
    } catch (err: any) {
      if (err?.code === "23505") throw new HttpError(409, "Already logged a good day today");
      throw err;
    }
  }));

  app.post("/api/children/:id/badspin", requireParent, wrap(async (req, res) => {
    const child = await loadChild(req.user!, parseId(req.params.id));
    res.json(await storage.updateChildProfile(child.id, { lastBadSpinDate: new Date() }));
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
    res.json(await storage.updateChildProfile(child.id, updates));
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
    const existing = await storage.getConsequences(req.user!.id, data.type);
    const section = data.section ?? (existing.reduce((m, c) => Math.max(m, c.section), 0) + 1);
    res.status(201).json(await storage.createConsequence({ ...data, section, userId: req.user!.id }));
  }));

  async function loadConsequence(user: User, id: number) {
    const c = await storage.getConsequence(id);
    if (!c || c.userId !== user.id) throw new HttpError(404, "Consequence not found");
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
    notifyUser(child.childUserId, "New consequence", `${p.text} was added to your list.`, "info");
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
    res.json(await storage.saveConfiguration(req.user!.id, clean));
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
    if (!spin || spin.familyId !== user.id || spin.createdBy !== user.id) throw new HttpError(404, "Spin not found");
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

    notifyUser(child.childUserId, "New consequence", `${pending.text} was added to your list.`, spin.type === "good" ? "success" : "warning");
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

    notifyUser(child.userId, "New spin request", `${child.name} landed on "${spin.text}" and is asking for approval.`, "spin");
    res.status(201).json(request);
  }));

  app.get("/api/spinrequests/pending", requireParent, wrap(async (req, res) => {
    const children = await storage.getChildProfiles(req.user!.id);
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

    notifyUser(child.childUserId, "Spin approved!", `"${r.consequenceText}" was added to your earned list.`, "success");
    res.json(updated);
  }));

  app.post("/api/spinrequests/:id/reject", requireParent, wrap(async (req, res) => {
    const user = req.user!;
    const { r, child } = await loadRequest(user, parseId(req.params.id));
    const [updated] = await db.update(spinRequests)
      .set({ status: "rejected", approvedAt: new Date(), approvedBy: user.id })
      .where(and(eq(spinRequests.id, r.id), eq(spinRequests.status, "pending"))).returning();
    if (!updated) throw new HttpError(409, "This request was already handled");
    notifyUser(child.childUserId, "Spin not approved", `Your request for "${r.consequenceText}" wasn't approved. Your spin is still yours.`, "warning");
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
