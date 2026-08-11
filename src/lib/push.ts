import { eq } from "drizzle-orm";
import fs from "node:fs";
import path from "node:path";
import webpush from "web-push";
import { db } from "@/db";
import { pushSubscriptions } from "@/db/schema";

/* ── VAPID keys: generated once, persisted in .vapid.json ── */
const VAPID_FILE = path.join(process.cwd(), ".vapid.json");
const VAPID_SUBJECT = "mailto:hello@joust.app";

function loadVapidKeys(): { publicKey: string; privateKey: string } {
  /* 1) Env vars first (serverless-friendly) */
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    return {
      publicKey: process.env.VAPID_PUBLIC_KEY,
      privateKey: process.env.VAPID_PRIVATE_KEY,
    };
  }

  /* 2) .vapid.json fallback (local dev) */
  try {
    if (fs.existsSync(VAPID_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(VAPID_FILE, "utf8")) as {
        publicKey: string;
        privateKey: string;
      };
      if (parsed.publicKey && parsed.privateKey) return parsed;
    }
  } catch {
    /* regenerate below */
  }

  const generated = webpush.generateVAPIDKeys();
  try {
    fs.writeFileSync(VAPID_FILE, JSON.stringify(generated, null, 2), "utf8");
  } catch {
    /* ephemeral filesystem: keys last for the process lifetime */
  }
  return generated;
}

const vapid = loadVapidKeys();
webpush.setVapidDetails(VAPID_SUBJECT, vapid.publicKey, vapid.privateKey);

export const VAPID_PUBLIC_KEY = vapid.publicKey;

/* ── helpers ── */

type SubRow = typeof pushSubscriptions.$inferSelect;

export async function saveSubscription(input: {
  matchId: string;
  playerName: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}) {
  await db
    .insert(pushSubscriptions)
    .values(input)
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: {
        matchId: input.matchId,
        playerName: input.playerName,
        p256dh: input.p256dh,
        auth: input.auth,
      },
    });
}

export async function deleteSubscription(endpoint: string) {
  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
}

function rowToPushSubscription(row: SubRow) {
  return {
    endpoint: row.endpoint,
    keys: { p256dh: row.p256dh, auth: row.auth },
  };
}

/** Send a push notification to every device subscribed to a match. Fire-and-forget. */
export async function sendPushToMatch(
  matchId: string,
  title: string,
  body: string,
  url = "/",
): Promise<number> {
  try {
    const rows = await db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.matchId, matchId));

    const results = await Promise.allSettled(
      rows.map((row) =>
        webpush.sendNotification(
          rowToPushSubscription(row),
          JSON.stringify({ title, body, url, icon: "/icons/icon-512.png", badge: "/icons/icon-512.png" }),
        ),
      ),
    );
    return results.filter((r) => r.status === "fulfilled").length;
  } catch {
    return 0;
  }
}

/** Fire-and-forget variant for route handlers. */
export function notifyMatch(matchId: string, title: string, body: string, url = "/") {
  void sendPushToMatch(matchId, title, body, url).catch(() => undefined);
}
