import { and, eq } from "drizzle-orm";
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
  notify5min?: boolean;
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
        ...(typeof input.notify5min === "boolean" ? { notify5min: input.notify5min } : {}),
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

function payload(title: string, body: string, url = "/") {
  return JSON.stringify({ title, body, url, icon: "/icons/icon-512.png", badge: "/icons/icon-512.png" });
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
      rows.map((row) => webpush.sendNotification(rowToPushSubscription(row), payload(title, body, url))),
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

/* ── Targeted notifications (per player) ── */

/** Send a push notification only to a specific player's subscribed devices. */
export async function sendPushToPlayer(
  matchId: string,
  playerName: string,
  title: string,
  body: string,
  url = "/",
  opts: { exclude5minDisabled?: boolean } = {},
): Promise<number> {
  try {
    const conditions = [
      eq(pushSubscriptions.matchId, matchId),
      eq(pushSubscriptions.playerName, playerName),
    ];
    /* For the 5-min reminder, only send to devices where the user kept the preference on. */
    if (opts.exclude5minDisabled) {
      conditions.push(eq(pushSubscriptions.notify5min, true));
    }

    const rows = await db
      .select()
      .from(pushSubscriptions)
      .where(and(...conditions));
    const results = await Promise.allSettled(
      rows.map((row) => webpush.sendNotification(rowToPushSubscription(row), payload(title, body, url))),
    );
    return results.filter((r) => r.status === "fulfilled").length;
  } catch {
    return 0;
  }
}

/** Fire-and-forget targeted notification for a specific player. */
export function notifyPlayer(matchId: string, playerName: string, title: string, body: string, url = "/") {
  void sendPushToPlayer(matchId, playerName, title, body, url).catch(() => undefined);
}

/* ── 5-minute reminder ── */

/** Fire the 5-minute pre-game reminder to players who enabled it (once per occurrence). */
export function notify5minReminder(matchId: string, players: string[]) {
  const title = "⏰ Début dans 5 minutes !";
  const body = "La joust va bientôt commencer. Prépare-toi !";
  for (const p of players) {
    void sendPushToPlayer(matchId, p, title, body, "/", { exclude5minDisabled: true }).catch(() => undefined);
  }
}