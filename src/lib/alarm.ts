/* ── Alarm / rendez-vous state machine (game-agnostic) ──
   The wake-up system (scheduled → playing, ready check, 60s fallback)
   lives here and NEVER imports a specific game engine.
   The game adapter receives control once the match is `playing`. */

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { matches } from "@/db/schema";
import { getGame } from "@/lib/games";
import { notify5minReminder, notifyMatch } from "@/lib/push";
import type { MatchRow } from "@/lib/games/types";

/**
 * Advance the alarm machine one step. Called by POST /tick.
 * Returns the latest match row. Game-specific logic is delegated to the
 * adapter registered for `match.gameType`.
 */
export async function advanceAlarm(match: MatchRow, now: Date): Promise<MatchRow> {
  let current = match;

  /* 0) Rappel 5 minutes avant le début (une seule fois par occurrence).
     Envoyé à tous les joueurs dont la préférence `notify5min` est active. */
  const fiveMinBefore = current.scheduledAt.getTime() - 5 * 60_000;
  if (
    !current.reminder5SentAt &&
    current.status === "scheduled" &&
    current.inviteStatus === "accepted" &&
    current.timeControlConfirmed &&
    now.getTime() >= fiveMinBefore &&
    now.getTime() <= current.scheduledAt.getTime()
  ) {
    const players = [current.whitePlayer, current.blackPlayer].filter(Boolean);
    notify5minReminder(current.id, players);
    await db
      .update(matches)
      .set({ reminder5SentAt: now, updatedAt: now })
      .where(eq(matches.id, current.id))
      .catch(() => undefined);
  }

  /* 1) The alarm fires when both players validated the invitation AND the time control. */
  if (
    current.status === "scheduled" &&
    current.inviteStatus === "accepted" &&
    current.timeControlConfirmed &&
    current.scheduledAt.getTime() <= now.getTime()
  ) {
    const [started] = await db
      .update(matches)
      .set({ status: "playing", updatedAt: now })
      .where(and(eq(matches.id, match.id), eq(matches.status, "scheduled")))
      .returning();
    if (started) {
      current = started;
      notifyMatch(match.id, "⏰ C’est l’heure !", "Touchez « Prêt » dans les 60 secondes.");
    }
  }

  /* 2) Ready check: once both players are ready OR 60 seconds elapsed →
       hand control to the game adapter (chess initialises its clocks). */
  const bothReady =
    current.status === "playing" && current.readyWhite && current.readyBlack;
  const fallbackElapsed =
    current.status === "playing" &&
    (!current.readyWhite || !current.readyBlack) &&
    current.scheduledAt.getTime() + 60_000 <= now.getTime();

  if (bothReady || fallbackElapsed) {
    const adapter = getGame(current.gameType);
    current = await adapter.onGameStart(current, now);
  }

  /* 3) Game tick (chess timeout detection, etc.). */
  if (current.status === "playing") {
    const adapter = getGame(current.gameType);
    current = await adapter.onTick(current, now);
  }

  return current;
}