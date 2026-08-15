/* ── Alarm / rendez-vous state machine (game-agnostic) ──
   The wake-up system (arrival validation, ultimatum) lives here and NEVER
   imports a specific game engine. The game adapter receives control once
   the match is `playing`.

   Nouveau flow de début de joust :
   1. La joust est validée (inviteStatus = accepted, timeControlConfirmed) mais
      AUCUN timer ne se déclenche automatiquement à l'heure, et AUCUN départ
      automatique n'existe.
   2. La validation d'arrivée n'est possible qu'à l'heure prévue de la joust.
   3. Chaque joueur qui arrive valide son arrivée. Le match est lancé
      MANUELLEMENT (action start) une fois que les deux joueurs sont arrivés.
   4. Un joueur arrivé peut relancer une notification à son adversaire absent
      (1 min min. entre deux) puis envoyer un ultimatum (1 min pour se
      connecter sinon il perd la partie). L'ultimatum est le SEUL mécanisme
      qui déclenche un décompte : aucun timer ne part automatiquement. */

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { matches } from "@/db/schema";
import { getGame } from "@/lib/games";
import { notify5minReminder } from "@/lib/push";
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

  /* 1) Ultimatum expired → l'adversaire du joueur qui a envoyé l'ultimatum
     n'a pas validé son arrivée dans le délai → forfait.
     `ultimatumBy` identifie l'expéditeur ; les lignes héritées (null) sont
     traitées comme envoyées par le créateur. */
  const ultimatumSender = current.ultimatumBy === "guest" ? "guest" : "creator";
  const absentPlayer = ultimatumSender === "creator" ? current.arrivalGuest : current.arrivalCreator;
  const senderName = ultimatumSender === "creator" ? current.creatorName : current.guestName;

  if (
    current.status === "scheduled" &&
    current.inviteStatus === "accepted" &&
    current.timeControlConfirmed &&
    current.ultimatumDeadline &&
    !absentPlayer &&
    current.ultimatumDeadline.getTime() <= now.getTime()
  ) {
    const [forfeited] = await db
      .update(matches)
      .set({
        status: "completed",
        result: "forfeit",
        winnerName: senderName,
        endedAt: now,
        updatedAt: now,
      })
      .where(and(eq(matches.id, match.id), eq(matches.status, "scheduled")))
      .returning();
    if (forfeited) {
      current = forfeited;
    }
  }

  /* 2) PAS de départ automatique : si les deux joueurs ont validé leur
     arrivée, rien ne se passe ici — l'un des joueurs doit lancer la partie
     explicitement (action start, voir /api/matches/[id]). */

  /* 3) Game tick (chess timeout detection, etc.). */
  if (current.status === "playing") {
    const adapter = getGame(current.gameType);
    current = await adapter.onTick(current, now);
  }

  return current;
}