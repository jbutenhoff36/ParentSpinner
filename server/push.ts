import * as webpush from "web-push";
import { eq, inArray } from "drizzle-orm";
import { db } from "./db";
import { appSettings, pushSubscriptions } from "@shared/schema";

/**
 * Phone notifications (Web Push). Keys come from VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY,
 * or are made once and saved in the database, so there's nothing to set up.
 */
let keys: { publicKey: string; privateKey: string } | null = null;

export async function initPush() {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    keys = { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
  } else {
    const [row] = await db.select().from(appSettings).where(eq(appSettings.key, "vapid"));
    if (row) {
      keys = JSON.parse(row.value);
    } else {
      const made = webpush.generateVAPIDKeys();
      // If two servers start at once, keep whichever was saved first.
      await db.insert(appSettings).values({ key: "vapid", value: JSON.stringify(made) }).onConflictDoNothing();
      const [saved] = await db.select().from(appSettings).where(eq(appSettings.key, "vapid"));
      keys = JSON.parse(saved.value);
    }
  }
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:notifications@kidspin.app", keys!.publicKey, keys!.privateKey);
}

export function pushPublicKey() {
  return keys?.publicKey ?? null;
}

export type PushMessage = { title: string; body: string; url?: string; tag?: string };

/** Sends to every device the users turned notifications on for. Never throws. */
export async function sendPush(userIds: number[], msg: PushMessage) {
  if (!keys || userIds.length === 0) return;
  try {
    const subs = await db.select().from(pushSubscriptions).where(inArray(pushSubscriptions.userId, userIds));
    const payload = JSON.stringify(msg);
    await Promise.all(subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 60 * 60 * 24 });
      } catch (err: any) {
        // 404/410: the phone dropped this subscription, so forget it.
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, s.id));
        } else {
          console.error("Push failed:", err?.statusCode || err?.message);
        }
      }
    }));
  } catch (err) {
    console.error("Push error:", err);
  }
}
