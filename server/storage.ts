import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "./db";
import {
  users, childProfiles, consequences, pendingConsequences, goodDayLog, configurations, spinRequests, spins,
  type User, type InsertUser, type ChildProfile, type Consequence, type PendingConsequence,
  type GoodDayLog, type Configuration, type SpinRequest, type Spin,
  DEFAULT_GOOD_CONSEQUENCES, DEFAULT_BAD_CONSEQUENCES, DEFAULT_FIGHTING_CONSEQUENCES,
} from "@shared/schema";

export const DEFAULT_WHEEL_SETTINGS = {
  wheelColors: [
    "#FF0080", "#00FFFF", "#FFD700", "#FF00FF", "#00FF00", "#FF4500", "#9400D3", "#FFFF00", "#FF1493",
    "#00CED1", "#FF6347", "#7FFF00", "#FF69B4", "#00BFFF", "#FFA500", "#FF00FF", "#32CD32", "#FFB6C1",
  ],
};

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// All data access is scoped by "family": the parent user's ID.
export const storage = {
  // ---- users ----
  async getUser(id: number): Promise<User | undefined> {
    const [u] = await db.select().from(users).where(eq(users.id, id));
    return u;
  },
  async getUserByUsername(username: string): Promise<User | undefined> {
    const [u] = await db.select().from(users).where(sql`lower(${users.username}) = lower(${username})`);
    return u;
  },
  async getParentByJoinCode(code: string): Promise<User | undefined> {
    const [u] = await db.select().from(users).where(and(eq(users.joinCode, code), eq(users.role, "parent")));
    return u;
  },
  async getFamilyByGuardianCode(code: string): Promise<User | undefined> {
    if (!code) return undefined;
    const [u] = await db.select().from(users).where(and(eq(users.guardianCode, code), eq(users.role, "parent")));
    return u;
  },
  async createUser(data: InsertUser): Promise<User> {
    const [u] = await db.insert(users).values(data).returning();
    return u;
  },
  async updateUser(id: number, data: Partial<User>): Promise<User | undefined> {
    const [u] = await db.update(users).set(data).where(eq(users.id, id)).returning();
    return u;
  },

  // ---- child profiles ----
  async getChildProfiles(familyId: number): Promise<ChildProfile[]> {
    return db.select().from(childProfiles).where(eq(childProfiles.userId, familyId)).orderBy(asc(childProfiles.id));
  },
  async getChildProfile(id: number): Promise<ChildProfile | undefined> {
    const [c] = await db.select().from(childProfiles).where(eq(childProfiles.id, id));
    return c;
  },
  async getChildProfileByUserId(childUserId: number): Promise<ChildProfile | undefined> {
    const [c] = await db.select().from(childProfiles).where(eq(childProfiles.childUserId, childUserId));
    return c;
  },
  async getUnlinkedChildProfiles(familyId: number): Promise<ChildProfile[]> {
    return db.select().from(childProfiles)
      .where(and(eq(childProfiles.userId, familyId), sql`${childProfiles.childUserId} is null`));
  },
  async createChildProfile(data: { name: string; avatar?: string | null; userId: number }): Promise<ChildProfile> {
    const [c] = await db.insert(childProfiles).values(data).returning();
    return c;
  },
  async updateChildProfile(id: number, data: Partial<ChildProfile>): Promise<ChildProfile | undefined> {
    const [c] = await db.update(childProfiles).set(data).where(eq(childProfiles.id, id)).returning();
    return c;
  },
  async deleteChildProfile(id: number): Promise<void> {
    await db.transaction(async (tx) => {
      await tx.delete(pendingConsequences).where(eq(pendingConsequences.childId, id));
      await tx.delete(goodDayLog).where(eq(goodDayLog.childId, id));
      await tx.delete(spinRequests).where(eq(spinRequests.childId, id));
      await tx.delete(spins).where(eq(spins.childId, id));
      await tx.delete(childProfiles).where(eq(childProfiles.id, id));
    });
  },

  // ---- consequences ----
  async getConsequences(familyId: number, type?: string): Promise<Consequence[]> {
    await this.ensureFamilyDefaults(familyId);
    const where = type
      ? and(eq(consequences.userId, familyId), eq(consequences.type, type))
      : eq(consequences.userId, familyId);
    return db.select().from(consequences).where(where).orderBy(asc(consequences.type), asc(consequences.section));
  },
  async getConsequence(id: number): Promise<Consequence | undefined> {
    const [c] = await db.select().from(consequences).where(eq(consequences.id, id));
    return c;
  },
  async createConsequence(data: { text: string; type: string; section: number; userId: number }): Promise<Consequence> {
    const [c] = await db.insert(consequences).values(data).returning();
    return c;
  },
  async updateConsequence(id: number, data: Partial<Consequence>): Promise<Consequence | undefined> {
    const [c] = await db.update(consequences).set(data).where(eq(consequences.id, id)).returning();
    return c;
  },
  /** Delete and close the gap so sections stay numbered 1..N for that wheel */
  async deleteConsequence(c: Consequence): Promise<void> {
    await db.transaction(async (tx) => {
      await tx.delete(consequences).where(eq(consequences.id, c.id));
      const rest = await tx.select().from(consequences)
        .where(and(eq(consequences.userId, c.userId!), eq(consequences.type, c.type)))
        .orderBy(asc(consequences.section), asc(consequences.id));
      for (let i = 0; i < rest.length; i++) {
        if (rest[i].section !== i + 1) {
          await tx.update(consequences).set({ section: i + 1 }).where(eq(consequences.id, rest[i].id));
        }
      }
    });
  },
  async ensureFamilyDefaults(familyId: number): Promise<void> {
    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(consequences)
      .where(eq(consequences.userId, familyId));
    if (count > 0) return;
    const rows = [...DEFAULT_GOOD_CONSEQUENCES, ...DEFAULT_BAD_CONSEQUENCES, ...DEFAULT_FIGHTING_CONSEQUENCES]
      .map((c) => ({ ...c, userId: familyId }));
    await db.insert(consequences).values(rows);
  },

  // ---- pending (earned) consequences ----
  async getPendingForChildren(childIds: number[]): Promise<PendingConsequence[]> {
    if (childIds.length === 0) return [];
    return db.select().from(pendingConsequences)
      .where(inArray(pendingConsequences.childId, childIds))
      .orderBy(desc(pendingConsequences.createdAt));
  },
  async getPending(id: number): Promise<PendingConsequence | undefined> {
    const [p] = await db.select().from(pendingConsequences).where(eq(pendingConsequences.id, id));
    return p;
  },
  async addPending(data: {
    consequenceId: number | null; text: string; type: string; section: number; childId: number; userId: number;
  }, tx: Tx | typeof db = db): Promise<PendingConsequence> {
    const [p] = await tx.insert(pendingConsequences).values(data).returning();
    return p;
  },
  async completePending(id: number): Promise<void> {
    await db.update(pendingConsequences).set({ completed: true }).where(eq(pendingConsequences.id, id));
  },
  async deletePending(id: number): Promise<void> {
    await db.delete(pendingConsequences).where(eq(pendingConsequences.id, id));
  },
  async deletePendingForChildren(childIds: number[]): Promise<void> {
    if (childIds.length === 0) return;
    await db.delete(pendingConsequences).where(inArray(pendingConsequences.childId, childIds));
  },

  // ---- good days ----
  async getGoodDayLogs(childId: number): Promise<GoodDayLog[]> {
    return db.select().from(goodDayLog).where(eq(goodDayLog.childId, childId)).orderBy(desc(goodDayLog.date));
  },
  async hasGoodDay(childId: number, day: string): Promise<boolean> {
    const [row] = await db.select({ id: goodDayLog.id }).from(goodDayLog)
      .where(and(eq(goodDayLog.childId, childId), eq(goodDayLog.day, day)));
    return !!row;
  },

  // ---- configuration ----
  async getConfiguration(familyId: number): Promise<Configuration> {
    const [cfg] = await db.select().from(configurations).where(eq(configurations.userId, familyId));
    if (cfg) return cfg;
    const [created] = await db.insert(configurations)
      .values({ userId: familyId, wheelSettings: DEFAULT_WHEEL_SETTINGS }).returning();
    return created;
  },
  async saveConfiguration(familyId: number, data: Partial<Configuration>): Promise<Configuration> {
    const existing = await this.getConfiguration(familyId);
    const { id: _id, userId: _u, ...rest } = data as any;
    const [cfg] = await db.update(configurations).set(rest).where(eq(configurations.id, existing.id)).returning();
    return cfg;
  },

  // ---- spins ----
  async createSpin(data: Omit<Spin, "createdAt" | "status">): Promise<Spin> {
    const [s] = await db.insert(spins).values(data).returning();
    return s;
  },
  async getSpin(id: string): Promise<Spin | undefined> {
    const [s] = await db.select().from(spins).where(eq(spins.id, id));
    return s;
  },
  async getOpenGoodSpin(childId: number, createdBy: number): Promise<Spin | undefined> {
    const [s] = await db.select().from(spins)
      .where(and(eq(spins.childId, childId), eq(spins.createdBy, createdBy), eq(spins.type, "good"), eq(spins.status, "open")))
      .orderBy(desc(spins.createdAt)).limit(1);
    return s;
  },

  // ---- spin requests ----
  async getSpinRequest(id: number): Promise<SpinRequest | undefined> {
    const [r] = await db.select().from(spinRequests).where(eq(spinRequests.id, id));
    return r;
  },
  async countPendingGoodRequests(childId: number): Promise<number> {
    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(spinRequests)
      .where(and(eq(spinRequests.childId, childId), eq(spinRequests.status, "pending"), eq(spinRequests.type, "good")));
    return count;
  },
  async getPendingRequestsForChildren(childIds: number[]): Promise<SpinRequest[]> {
    if (childIds.length === 0) return [];
    return db.select().from(spinRequests)
      .where(and(inArray(spinRequests.childId, childIds), eq(spinRequests.status, "pending")))
      .orderBy(desc(spinRequests.requestedAt));
  },
  async getRequestsForChild(childId: number): Promise<SpinRequest[]> {
    return db.select().from(spinRequests).where(eq(spinRequests.childId, childId))
      .orderBy(desc(spinRequests.requestedAt)).limit(50);
  },
};

export { db };
