/* Per-player session token verification (review 2.2.2) + auth session helpers. */
import { and, eq, gt, lt } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { db } from "@/db";
import { matches, sessions, users } from "@/db/schema";

export type MatchRow = typeof matches.$inferSelect;

export function verifyPlayerToken(
  match: MatchRow,
  playerName: string,
  token: string | undefined | null,
): string | null {
  if (!token) return null;
  if (playerName === match.creatorName && token === match.creatorToken) return playerName;
  if (playerName === match.guestName && token === match.guestToken) return playerName;
  return null;
}

/* ── Auth session helpers ── */

export const SESSION_COOKIE = "joust-session";
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; /* 30 days */

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateSessionToken(): string {
  return randomBytes(32).toString("hex");
}

export async function createSession(userId: string): Promise<string> {
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(sessions).values({ userId, tokenHash: hashSessionToken(token), expiresAt });
  return token;
}

export async function deleteSessionByToken(token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.tokenHash, hashSessionToken(token)));
}

export async function deleteExpiredSessions(): Promise<void> {
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
}

export async function setSessionCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

/** Resolve the currently authenticated user from the session cookie, or null. */
export async function getCurrentUser(): Promise<typeof users.$inferSelect | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const tokenHash = hashSessionToken(token);
  const [row] = await db
    .select({ user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, new Date())))
    .limit(1);
  return row?.user ?? null;
}

/** Validate that `playerName` belongs to the authenticated user, or matches a fallback guest token. */
export async function assertCanActAs(
  match: MatchRow,
  playerName: string,
  token: string | undefined | null,
): Promise<string | null> {
  /* Existing per-match guest token path (review 2.2.2) */
  const viaMatchToken = verifyPlayerToken(match, playerName, token);
  if (viaMatchToken) return viaMatchToken;

  /* New: if the player is logged in, their pseudo must match the user's account. */
  const user = await getCurrentUser();
  if (user && user.pseudo === playerName) return playerName;

  return null;
}