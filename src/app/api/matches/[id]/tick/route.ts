import { and, eq } from "drizzle-orm";
import { Chess } from "chess.js";
import { NextRequest } from "next/server";
import { db } from "@/db";
import { matches } from "@/db/schema";
import { notifyMatch } from "@/lib/push";
import { persistResult } from "@/lib/result";
import { tcInfo } from "@/lib/time-control";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

async function findMatch(id: string) {
  const [match] = await db.select().from(matches).where(eq(matches.id, id)).limit(1);
  return match;
}

async function startClocksIfNeeded(match: typeof matches.$inferSelect, now: Date) {
  if (match.clockWhiteSeconds !== 0 || match.clockBlackSeconds !== 0) return match;
  const seconds = tcInfo(match.timeControl).seconds;
  const [updated] = await db
    .update(matches)
    .set({ clockWhiteSeconds: seconds, clockBlackSeconds: seconds, lastMoveAt: now, updatedAt: now })
    .where(eq(matches.id, match.id))
    .returning();
  return updated ?? match;
}

/** Mutable state machine — called by the client poller (see review §2.2.1). */
export async function POST(_request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  let match = await findMatch(id);
  if (!match) return Response.json({ error: "Joust introuvable." }, { status: 404 });

  const now = new Date();

  /* 1) The alarm only fires when both players validated the invitation AND the time control. */
  if (
    match.status === "scheduled" &&
    match.inviteStatus === "accepted" &&
    match.timeControlConfirmed &&
    match.scheduledAt.getTime() <= now.getTime()
  ) {
    const [started] = await db
      .update(matches)
      .set({ status: "playing", updatedAt: now })
      .where(and(eq(matches.id, id), eq(matches.status, "scheduled")))
      .returning();
    match = started ?? match;
    if (started) {
      notifyMatch(id, "⏰ C’est l’heure !", "Touchez « Prêt » dans les 60 secondes.");
    }
  }

  /* 2) Ready check: once both players are ready OR 60 seconds elapsed. */
  if (match.status === "playing" && match.readyWhite && match.readyBlack) {
    match = await startClocksIfNeeded(match, now);
  }

  /* 3) Alternate timeout: one player didn't click, but 60s passed since scheduledAt. */
  if (
    match.status === "playing" &&
    (!match.readyWhite || !match.readyBlack) &&
    match.scheduledAt.getTime() + 60_000 <= now.getTime()
  ) {
    match = await startClocksIfNeeded(match, now);
  }

  /* 4) Timeout detection during chess: the player to move ran out of clock. */
  const chess = new Chess(match.lastFen ?? undefined);
  if (match.status === "playing" && match.lastMoveAt && match.readyWhite && match.readyBlack) {
    const turn = chess.turn();
    const clock = turn === "w" ? match.clockWhiteSeconds : match.clockBlackSeconds;
    const remaining = clock - Math.floor((now.getTime() - match.lastMoveAt.getTime()) / 1000);
    if (remaining <= 0) {
      const loser = turn === "w" ? match.whitePlayer : match.blackPlayer;
      const winner = turn === "w" ? match.blackPlayer : match.whitePlayer;
      const ended = await persistResult(match, "timeout", winner);
      notifyMatch(id, "⏱️ Temps écoulé !", `${loser} a épuisé son temps — partie terminée.`);
      match = ended ?? match;
    }
  }

  return Response.json({ ok: true, status: match.status });
}