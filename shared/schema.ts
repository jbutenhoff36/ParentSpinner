import { pgTable, text, serial, integer, boolean, jsonb, timestamp, time, varchar, json, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Base users table for authentication with role-based access
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password"), // null for accounts that only use Sign in with Google
  role: text("role").notNull().default("parent"), // "parent" or "child"
  parentId: integer("parent_id").references((): any => users.id), // For child accounts, references their parent
  email: text("email"), // For notifications
  joinCode: text("join_code"), // Parents: code kids use to link their account
  googleSub: text("google_sub"), // Google account ID, for Sign in with Google
  displayName: text("display_name"),
  notifyOnSpin: boolean("notify_on_spin").default(true),
  notifyOnPending: boolean("notify_on_pending").default(true),
  lastLogin: timestamp("last_login").defaultNow(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  uniqueIndex("users_join_code_idx").on(t.joinCode),
  uniqueIndex("users_google_sub_idx").on(t.googleSub),
]);

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
  role: true,
  parentId: true,
  email: true,
  notifyOnSpin: true,
  notifyOnPending: true,
});

// Child profiles table
export const childProfiles = pgTable("child_profiles", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  avatar: text("avatar"),
  goodDayCount: integer("good_day_count").default(0).notNull(),
  earnedSpins: integer("earned_spins").default(0).notNull(),
  lastBadSpinDate: timestamp("last_bad_spin_date"),
  lastGoodSpinDate: timestamp("last_good_spin_date"),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  userId: integer("user_id").references(() => users.id), // Parent user who created this profile
  childUserId: integer("child_user_id").references(() => users.id), // Child login linked to this profile
});

export const insertChildProfileSchema = createInsertSchema(childProfiles).pick({
  name: true,
  avatar: true,
  userId: true,
  childUserId: true,
});

// Consequences (good, bad, fighting). userId = the family (parent user) that owns the wheel.
export const consequences = pgTable("consequences", {
  id: serial("id").primaryKey(),
  text: text("text").notNull(),
  type: text("type").notNull(),
  section: integer("section").notNull(),
  userId: integer("user_id").references(() => users.id),
});

export const insertConsequenceSchema = createInsertSchema(consequences).pick({
  text: true,
  type: true,
  section: true,
  userId: true,
});

// Consequences a child has earned and not yet completed
export const pendingConsequences = pgTable("pending_consequences", {
  id: serial("id").primaryKey(),
  consequenceId: integer("consequence_id").references(() => consequences.id, { onDelete: "set null" }),
  text: text("text").notNull(),
  type: text("type").notNull(),
  section: integer("section").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  completed: boolean("completed").default(false),
  childId: integer("child_id").references(() => childProfiles.id).notNull(),
  userId: integer("user_id").references(() => users.id),
});

export const insertPendingConsequenceSchema = createInsertSchema(pendingConsequences).pick({
  consequenceId: true,
  text: true,
  type: true,
  section: true,
  childId: true,
  userId: true,
});

// Good day log (one per child per calendar day)
export const goodDayLog = pgTable("good_day_log", {
  id: serial("id").primaryKey(),
  childId: integer("child_id").references(() => childProfiles.id).notNull(),
  date: timestamp("date").defaultNow().notNull(),
  day: text("day"), // YYYY-MM-DD, used to stop double-logging the same day
  userId: integer("user_id").references(() => users.id),
}, (t) => [uniqueIndex("good_day_child_day").on(t.childId, t.day)]);

export const insertGoodDayLogSchema = createInsertSchema(goodDayLog).pick({
  childId: true,
  userId: true,
});

// Per-family configuration
export const configurations = pgTable("configurations", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  wheelSettings: jsonb("wheel_settings").notNull(),
  notificationTime: time("notification_time").default('20:00:00').notNull(),
  goodDaysRequired: integer("good_days_required").default(7).notNull(),
  notificationsEnabled: boolean("notifications_enabled").default(true).notNull(),
});

export const insertConfigurationSchema = createInsertSchema(configurations).pick({
  userId: true,
  wheelSettings: true,
  notificationTime: true,
  goodDaysRequired: true,
  notificationsEnabled: true,
});

// Spin results chosen by the server. The browser only animates to them, and
// accepts or requests a spin by its ID, so it can't pick its own result.
export const spins = pgTable("spins", {
  id: varchar("id", { length: 32 }).primaryKey(),
  familyId: integer("family_id").references(() => users.id).notNull(),
  childId: integer("child_id").references(() => childProfiles.id).notNull(),
  createdBy: integer("created_by").references(() => users.id).notNull(),
  type: text("type").notNull(),
  section: integer("section").notNull(),
  consequenceId: integer("consequence_id").references(() => consequences.id, { onDelete: "set null" }),
  text: text("text").notNull(),
  status: text("status").notNull().default("open"), // open | accepted | requested
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Spin = typeof spins.$inferSelect;

// Spin requests from children that need parent approval
export const spinRequests = pgTable("spin_requests", {
  id: serial("id").primaryKey(),
  childId: integer("child_id").references(() => childProfiles.id).notNull(),
  userId: integer("user_id").references(() => users.id), // Child user who made the request
  requestedAt: timestamp("requested_at").defaultNow().notNull(),
  status: text("status").notNull().default("pending"), // pending | approved | rejected
  approvedAt: timestamp("approved_at"),
  approvedBy: integer("approved_by").references(() => users.id),
  consequenceId: integer("consequence_id").references(() => consequences.id, { onDelete: "set null" }),
  section: integer("section"),
  rotations: integer("rotations").default(0),
  type: text("type"),
  finalAngle: text("final_angle"),
  addedToPending: boolean("added_to_pending").default(false),
  description: text("description"),
  spinId: varchar("spin_id", { length: 32 }),
  consequenceText: text("consequence_text"), // Snapshot of the result text at request time
});

export const insertSpinRequestSchema = createInsertSchema(spinRequests).pick({
  childId: true,
  userId: true,
  status: true,
  consequenceId: true,
  section: true,
  rotations: true,
  type: true,
  finalAngle: true,
  description: true,
  spinId: true,
  consequenceText: true,
});

export type SpinRequest = typeof spinRequests.$inferSelect;
export type InsertSpinRequest = z.infer<typeof insertSpinRequestSchema>;

// Login sessions (managed by connect-pg-simple; declared here so drizzle-kit keeps the table)
export const sessions = pgTable("session", {
  sid: varchar("sid").primaryKey(),
  sess: json("sess").notNull(),
  expire: timestamp("expire", { precision: 6 }).notNull(),
}, (t) => [index("IDX_session_expire").on(t.expire)]);

// Type definitions
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type ChildProfile = typeof childProfiles.$inferSelect;
export type InsertChildProfile = z.infer<typeof insertChildProfileSchema>;
export type Consequence = typeof consequences.$inferSelect;
export type InsertConsequence = z.infer<typeof insertConsequenceSchema>;
export type PendingConsequence = typeof pendingConsequences.$inferSelect;
export type InsertPendingConsequence = z.infer<typeof insertPendingConsequenceSchema>;
export type GoodDayLog = typeof goodDayLog.$inferSelect;
export type InsertGoodDayLog = z.infer<typeof insertGoodDayLogSchema>;
export type Configuration = typeof configurations.$inferSelect;
export type InsertConfiguration = z.infer<typeof insertConfigurationSchema>;

// Default wheel content for new families
export const DEFAULT_GOOD_CONSEQUENCES = [
  { section: 1, text: "$1", type: "good" },
  { section: 2, text: "1 hour one-on-one with a parent", type: "good" },
  { section: 3, text: "+30 min screen-time", type: "good" },
  { section: 4, text: "$3", type: "good" },
  { section: 5, text: "Back rub", type: "good" },
  { section: 6, text: "Kid's choice", type: "good" },
  { section: 7, text: "Parent's choice", type: "good" },
  { section: 8, text: "Small treat", type: "good" },
  { section: 9, text: "+30 min late bedtime", type: "good" },
  { section: 10, text: "$5", type: "good" },
  { section: 11, text: "Pick dinner", type: "good" },
  { section: 12, text: "Extra snack", type: "good" },
  { section: 13, text: "Get out of 1 bad consequence", type: "good" },
  { section: 14, text: "Friend sleepover", type: "good" },
  { section: 15, text: "Pick lunch", type: "good" },
  { section: 16, text: "Fun activity", type: "good" },
  { section: 17, text: "Sleep in living room", type: "good" },
  { section: 18, text: "$2", type: "good" }
];

export const DEFAULT_BAD_CONSEQUENCES = [
  { section: 1, text: "Shovel deck/Pick up lawn", type: "bad" },
  { section: 2, text: "Wash or clean out car", type: "bad" },
  { section: 3, text: "Mercy", type: "bad" },
  { section: 4, text: "Wash dog", type: "bad" },
  { section: 5, text: "Clean under couch", type: "bad" },
  { section: 6, text: "Clean counter top", type: "bad" },
  { section: 7, text: "Clean rabbit poop", type: "bad" },
  { section: 8, text: "Clean toilet (inside and out)", type: "bad" },
  { section: 9, text: "Sweep and mop a room in house", type: "bad" },
  { section: 10, text: "Wipe down table and chairs", type: "bad" },
  { section: 11, text: "Empty/load dishwasher", type: "bad" },
  { section: 12, text: "Wipe down stove, dishwasher and fridge", type: "bad" },
  { section: 13, text: "Dust", type: "bad" },
  { section: 14, text: "Wash inside of two windows", type: "bad" },
  { section: 15, text: "Take out a trash and re-bag", type: "bad" },
  { section: 16, text: "Pay $1", type: "bad" },
  { section: 17, text: "Parent's choice", type: "bad" },
  { section: 18, text: "Kid's choice", type: "bad" }
];

export const DEFAULT_FIGHTING_CONSEQUENCES = [
  { section: 1, text: "Get-along shirt for 1 hour", type: "fighting" },
  { section: 2, text: "No game/TV for the day", type: "fighting" },
  { section: 3, text: "Lose the toy you fought over for a day", type: "fighting" },
  { section: 4, text: "-30 minute early bed time", type: "fighting" },
  { section: 5, text: "Say 5 nice things to each other", type: "fighting" },
  { section: 6, text: "Sit out of activity", type: "fighting" },
  { section: 7, text: "Clean the other kid's dishes", type: "fighting" },
  { section: 8, text: "Pay $5", type: "fighting" },
  { section: 9, text: "Do a chore together", type: "fighting" },
  { section: 10, text: "Write or draw an apology", type: "fighting" },
  { section: 11, text: "Fix or clean up what got messed up", type: "fighting" },
  { section: 12, text: "Pay $3", type: "fighting" },
  { section: 13, text: "Do something kind for the other person", type: "fighting" },
  { section: 14, text: "Parent's choice", type: "fighting" },
  { section: 15, text: "Kid's choice", type: "fighting" },
  { section: 16, text: "Lose next friend play date", type: "fighting" },
  { section: 17, text: "Shovel large area/mow lawn", type: "fighting" },
  { section: 18, text: "Knock snow off tent and boat, or weed garden", type: "fighting" }
];
