import { asc, eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { db } from "@/db";
import { matchMoves, matches } from "@/db/schema";
import { notifyMatch } from "@/lib/push";
import { persistResult } from "@/lib/result";
import { serializeMatch, serializeMove } from "@/lib/serialize";
import { isTimeControl, tcInfo } from "@/lib/time-control";

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

const INTERVAL_MS = 1_000;

/* GET is side-effect free: state transitions live in POST /tick. (review §2.2.1) */
export async function GET(_request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const match = await findMatch(id);
  if (!match) return Response.json({ error: "Joust introuvable." }, { status: 404 });

  /* Note: no side effects in GET — state transitions live in POST /tick. */

  const moves = await db
    .select()
    .from(matchMoves)
    .where(eq(matchMoves.matchId, id))
    .orderBy(asc(matchMoves.ply));

  return Response.json({ match: serializeMatch(match), moves: moves.map(serializeMove) });
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const match = await findMatch(id);
  if (!match) return Response.json({ error: "Joust introuvable." }, { status: 404 });

  try {
    const body = (await request.json()) as {
      action?: string;
      minutes?: number;
      timeControl?: string;
      timeOfDay?: string;
      recurrenceDays?: string;
      by?: string;
      scheduledAt?: string;
      playerName?: string;
    };
    const now = new Date();

    /* ── A friend joins with the invite code ── */
    if (body.action === "join") {
      const playerName = body.playerName?.trim().slice(0, 80);
      if (!playerName) return Response.json({ error: "Pseudo requis." }, { status: 400 });
      if (playerName === match.creatorName) {
        return Response.json({ error: "Ce pseudo est déjà celui de l’hôte." }, { status: 409 });
      }
      if (match.guestName && match.guestName !== playerName) {
        return Response.json({ error: "Cette joust a déjà un adversaire." }, { status: 409 });
      }

      const [updated] = await db
        .update(matches)
        .set({ guestName: playerName, blackPlayer: playerName, updatedAt: now })
        .where(eq(matches.id, id))
        .returning();
      notifyMatch(id, "👋 Un adversaire !", `${playerName} a rejoint votre Joust.`);
      return Response.json({ match: serializeMatch(updated), moves: [] });
    }

    /* ── Accept the current parameters as-is ── */
    if (body.action === "accept") {
      const [updated] = await db
        .update(matches)
        .set({ inviteStatus: "accepted", timeControlConfirmed: true, updatedAt: now })
        .where(eq(matches.id, id))
        .returning();
      notifyMatch(id, "🤝 Joust validée !", `${match.guestName || "Votre ami"} a accepté la joust.`);
      return Response.json({ match: serializeMatch(updated) });
    }

    /* ── Counter-proposal: change any parameter, needs the other side to accept ── */
    if (body.action === "counter") {
      const by = body.by === "guest" ? "guest" : "creator";
      const chosen = isTimeControl(body.timeControl) ? body.timeControl : match.timeControl;
      const nextDate = body.scheduledAt ? new Date(body.scheduledAt) : match.scheduledAt;
      /* Validate proposed time of day + recurrence via shared helpers */
      const proposedTimeOfDay = typeof body.timeOfDay === "string" ? body.timeOfDay : match.timeOfDay;
      const safeTimeOfDay = /^\d{1,2}:\d{2}$/.test(proposedTimeOfDay.trim()) ? proposedTimeOfDay.trim() : match.timeOfDay;
      const proposedDays = typeof body.recurrenceDays === "string" ? body.recurrenceDays : match.recurrenceDays;
      const safeRecurrence = proposedDays
        .split(",")
        .map(Number)
        .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
        .join(",");
      const [updated] = await db
        .update(matches)
        .set({
          timeControl: chosen,
          timeOfDay: safeTimeOfDay,
          recurrenceDays: safeRecurrence || match.recurrenceDays,
          scheduledAt: Number.isNaN(nextDate.getTime()) ? match.scheduledAt : nextDate,
          timeControlBy: by,
          timeControlConfirmed: false,
          inviteStatus: "pending",
          updatedAt: now,
        })
        .where(eq(matches.id, id))
        .returning();
      notifyMatch(id, "🔄 Nouvelle proposition", `${by === "guest" ? match.guestName : match.creatorName} propose d’autres paramètres.`);
      return Response.json({ match: serializeMatch(updated) });
    }

    /* ── Guest declines ── */
    if (body.action === "decline") {
      const [updated] = await db
        .update(matches)
        .set({ inviteStatus: "declined", updatedAt: now })
        .where(eq(matches.id, id))
        .returning();
      notifyMatch(id, "😔 Invitation refusée", `${match.guestName} a décliné la joust.`);
      return Response.json({ match: serializeMatch(updated) });
    }

    /* ── Ready check: player clicked "Prêt" ── */
    if (body.action === "ready") {
      const playerName = body.playerName?.trim();
      if (!playerName) return Response.json({ error: "Joueur requis." }, { status: 400 });

      const isWhitePlayer = playerName === match.whitePlayer;
      if (!isWhitePlayer && playerName !== match.blackPlayer) {
        return Response.json({ error: "Vous ne faites pas partie de ce duel." }, { status: 400 });
      }

      const [updated] = await db
        .update(matches)
        .set(
          isWhitePlayer
            ? { readyWhite: now, updatedAt: now }
            : { readyBlack: now, updatedAt: now },
        )
        .where(eq(matches.id, id))
        .returning();

      notifyMatch(id, "✅ Prêt !", `${playerName} est prêt à jouer.`);
      return Response.json({ match: serializeMatch(updated) });
    }

    /* ── Manual start (both validations required) ── */
    if (body.action === "start") {
      if (match.inviteStatus !== "accepted" || !match.timeControlConfirmed) {
        return Response.json({ error: "Les deux joueurs doivent valider la joust." }, { status: 409 });
      }
      const [started] = await db
        .update(matches)
        .set({ status: "playing", updatedAt: now })
        .where(eq(matches.id, id))
        .returning();
      const withClocks = await startClocksIfNeeded(started, now);
      notifyMatch(id, "▶️ La partie est lancée !", "Rejoignez l'échiquier, votre adversaire vous attend.");
      return Response.json({ match: serializeMatch(withClocks ?? started) });
    }

    /* ── Resign (review 3.2 §2) ── */
    if (body.action === "resign") {
      const playerName = body.playerName?.trim();
      if (!playerName) return Response.json({ error: "Joueur requis." }, { status: 400 });
      if (playerName !== match.whitePlayer && playerName !== match.blackPlayer) {
        return Response.json({ error: "Vous ne faites pas partie de ce duel." }, { status: 400 });
      }
      const winner = playerName === match.whitePlayer ? match.blackPlayer : match.whitePlayer;
      const updated = await persistResult(match, "resign", winner);
      notifyMatch(id, "🏳️ Abandon", `${playerName} a abandonné. ${winner} gagne.`);
      return Response.json({ match: serializeMatch(updated) });
    }

    /* ── Draw proposal (review 3.2 §2) ── */
    if (body.action === "draw") {
      const playerName = body.playerName?.trim();
      if (!playerName) return Response.json({ error: "Joueur requis." }, { status: 400 });
      if (playerName !== match.whitePlayer && playerName !== match.blackPlayer) {
        return Response.json({ error: "Vous ne faites pas partie de ce duel." }, { status: 400 });
      }
      if (match.status !== "playing") {
        return Response.json({ error: "La partie n'est pas en cours." }, { status: 409 });
      }
      const by = playerName === match.creatorName ? "creator" : "guest";
      const [updated] = await db
        .update(matches)
        .set({ drawStatus: "proposed", drawProposedBy: by, updatedAt: now })
        .where(eq(matches.id, id))
        .returning();
      notifyMatch(id, "🤝 Proposition de nulle", `${playerName} propose la nulle.`);
      return Response.json({ match: serializeMatch(updated) });
    }

    /* ── Accept draw proposal ── */
    if (body.action === "draw-accept") {
      const playerName = body.playerName?.trim();
      if (!playerName) return Response.json({ error: "Joueur requis." }, { status: 400 });
      if (playerName !== match.whitePlayer && playerName !== match.blackPlayer) {
        return Response.json({ error: "Vous ne faites pas partie de ce duel." }, { status: 400 });
      }
      const byMe = playerName === match.creatorName ? "creator" : "guest";
      if (match.drawStatus !== "proposed" || match.drawProposedBy === byMe) {
        return Response.json({ error: "Aucune proposition de nulle en attente." }, { status: 409 });
      }
      const updated = await persistResult(match, "agreed", null);
      notifyMatch(id, "🤝 Partie nulle", "Les deux joueurs sont d'accord — nulle.");
      return Response.json({ match: serializeMatch(updated) });
    }

    /* ── Decline draw proposal ── */
    if (body.action === "draw-decline") {
      const playerName = body.playerName?.trim();
      if (!playerName) return Response.json({ error: "Joueur requis." }, { status: 400 });
      if (playerName !== match.whitePlayer && playerName !== match.blackPlayer) {
        return Response.json({ error: "Vous ne faites pas partie de ce duel." }, { status: 400 });
      }
      const byMe = playerName === match.creatorName ? "creator" : "guest";
      if (match.drawStatus !== "proposed" || match.drawProposedBy === byMe) {
        return Response.json({ error: "Aucune proposition de nulle en attente." }, { status: 409 });
      }
      const [updated] = await db
        .update(matches)
        .set({ drawStatus: "declined", updatedAt: now })
        .where(eq(matches.id, id))
        .returning();
      notifyMatch(id, "❌ Nulle refusée", `${playerName} a refusé la proposition de nulle.`);
      return Response.json({ match: serializeMatch(updated) });
    }

    /* ── Re-arm the recurring alarm ── */
    if (body.action === "reschedule") {
      const nextDate = new Date(body.scheduledAt ?? "");
      if (Number.isNaN(nextDate.getTime())) {
        return Response.json({ error: "Prochaine occurrence invalide." }, { status: 400 });
      }
      await db.delete(matchMoves).where(eq(matchMoves.matchId, id));
      const [updated] = await db
        .update(matches)
        .set({
          scheduledAt: nextDate,
          status: "scheduled",
          lastFen: null,
          clockWhiteSeconds: 0,
          clockBlackSeconds: 0,
          lastMoveAt: null,
          readyWhite: null,
          readyBlack: null,
          drawStatus: "none",
          drawProposedBy: null,
          result: null,
          winnerName: null,
          endedAt: null,
          ratingWhiteAfter: null,
          ratingBlackAfter: null,
          updatedAt: now,
        })
        .where(eq(matches.id, id))
        .returning();
      return Response.json({ match: serializeMatch(updated), moves: [] });
    }

    /* ── Rematch with inverted colors (review 3.3) ── */
    if (body.action === "rematch") {
      const nextDate = new Date(body.scheduledAt ?? "");
      if (Number.isNaN(nextDate.getTime())) {
        return Response.json({ error: "Prochaine occurrence invalide." }, { status: 400 });
      }
      await db.delete(matchMoves).where(eq(matchMoves.matchId, id));
      const [updated] = await db
        .update(matches)
        .set({
          scheduledAt: nextDate,
          status: "scheduled",
          lastFen: null,
          clockWhiteSeconds: 0,
          clockBlackSeconds: 0,
          lastMoveAt: null,
          readyWhite: null,
          readyBlack: null,
          whitePlayer: match.blackPlayer,
          blackPlayer: match.whitePlayer,
          drawStatus: "none",
          drawProposedBy: null,
          result: null,
          winnerName: null,
          endedAt: null,
          ratingWhiteBefore: match.ratingBlackAfter ?? match.ratingBlackBefore ?? 1000,
          ratingBlackBefore: match.ratingWhiteAfter ?? match.ratingWhiteBefore ?? 1000,
          ratingWhiteAfter: null,
          ratingBlackAfter: null,
          updatedAt: now,
        })
        .where(eq(matches.id, id))
        .returning();
      return Response.json({ match: serializeMatch(updated), moves: [] });
    }

    return Response.json({ error: "Action non reconnue." }, { status: 400 });
  } catch {
    return Response.json({ error: "Mise à jour impossible." }, { status: 400 });
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  await db.delete(matches).where(eq(matches.id, id));
  return Response.json({ ok: true });
}
