import { asc, eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { db } from "@/db";
import { matchMoves, matches } from "@/db/schema";
import { assertCanActAs } from "@/lib/auth";
import { getGame } from "@/lib/games";
import { broadcastMatchChange } from "@/lib/realtime";
import { notifyPlayer } from "@/lib/push";
import { persistResult } from "@/lib/result";
import { serializeMatch, serializeMove } from "@/lib/serialize";
import { isTimeControl } from "@/lib/time-control";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

async function findMatch(id: string) {
  const [match] = await db.select().from(matches).where(eq(matches.id, id)).limit(1);
  return match;
}

/** Start the game: delegate to the registered game adapter (chess initialises clocks). */
async function startGame(match: typeof matches.$inferSelect, now: Date) {
  return getGame(match.gameType).onGameStart(match, now);
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
      token?: string;
    };
    const now = new Date();
    const playerName = body.playerName?.trim();
    const token = body.token;

    /** Require the request to be authenticated as `playerName`.
        Legacy per-match tokens still work; otherwise the session cookie must match the account pseudo. */
    async function requireActor() {
      const actor = await assertCanActAs(match, playerName ?? "", token);
      if (!actor) {
        return Response.json(
          { error: "Connecte-toi pour agir sur une joust." },
          { status: 401 },
        );
      }
      if (!playerName) {
        return Response.json({ error: "Joueur requis." }, { status: 400 });
      }
      if (playerName !== match.creatorName && playerName !== match.guestName) {
        return Response.json({ error: "Vous ne faites pas partie de ce duel." }, { status: 400 });
      }
      return null;
    }

    /* ── A friend joins with the invite code ── */
    if (body.action === "join") {
      const cleanName = playerName?.slice(0, 80);
      if (!cleanName) return Response.json({ error: "Pseudo requis." }, { status: 400 });
      const actor = await assertCanActAs(match, cleanName, token);
      if (!actor) {
        return Response.json({ error: "Connecte-toi pour rejoindre une joust." }, { status: 401 });
      }
      if (cleanName === match.creatorName) {
        return Response.json({ error: "Ce pseudo est déjà celui de l’hôte." }, { status: 409 });
      }
      if (match.guestName && match.guestName !== cleanName) {
        return Response.json({ error: "Cette joust a déjà un adversaire." }, { status: 409 });
      }

      const [updated] = await db
        .update(matches)
        .set({ guestName: cleanName, blackPlayer: cleanName, updatedAt: now })
        .where(eq(matches.id, id))
        .returning();
      /* Notification ciblée au créateur uniquement : « proposition de joust reçue » */
      notifyPlayer(id, match.creatorName, "👋 Un adversaire !", `${cleanName} a rejoint votre Joust.`);
      broadcastMatchChange(id, { action: "join" });
      return Response.json({ match: serializeMatch(updated), moves: [] });
    }

    /* ── Accept the current parameters as-is ── */
    if (body.action === "accept") {
      const denied = await requireActor();
      if (denied) return denied;
      const proposer = match.timeControlBy === "creator" ? match.guestName : match.creatorName;
      const responder = playerName;
      const [updated] = await db
        .update(matches)
        .set({ inviteStatus: "accepted", timeControlConfirmed: true, updatedAt: now })
        .where(eq(matches.id, id))
        .returning();
      /* Réponse à une proposition : le partenaire a validé → notifier uniquement le proposant */
      notifyPlayer(id, proposer || match.creatorName, "✅ Proposition acceptée !", `${responder} a validé les paramètres de la joust.`);
      broadcastMatchChange(id, { action: "accept" });
      return Response.json({ match: serializeMatch(updated) });
    }

    /* ── Counter-proposal: change any parameter, needs the other side to accept ── */
    if (body.action === "counter") {
      const denied = await requireActor();
      if (denied) return denied;
      const by = body.by === "guest" ? "guest" : "creator";
      const chosen = isTimeControl(body.timeControl) ? body.timeControl : match.timeControl;
      const nextDate = body.scheduledAt ? new Date(body.scheduledAt) : match.scheduledAt;
      const proposedTimeOfDay = typeof body.timeOfDay === "string" ? body.timeOfDay : match.timeOfDay;
      const safeTimeOfDay = /^\d{1,2}:\d{2}$/.test(proposedTimeOfDay.trim()) ? proposedTimeOfDay.trim() : match.timeOfDay;
      const proposedDays = typeof body.recurrenceDays === "string" ? body.recurrenceDays : match.recurrenceDays;
      const safeRecurrence = proposedDays
        .split(",")
        .map(Number)
        .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
        .join(",");
      const proposer = by === "guest" ? match.guestName : match.creatorName;
      const target = by === "guest" ? match.creatorName : match.guestName;
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
      /* Réponse à une proposition : contre-proposition → notifier le partenaire ciblé */
      if (target) notifyPlayer(id, target, "🔄 Contre-proposition", `${proposer} propose d’autres paramètres.`);
      broadcastMatchChange(id, { action: "counter" });
      return Response.json({ match: serializeMatch(updated) });
    }

    /* ── Guest declines ── */
    if (body.action === "decline") {
      const denied = await requireActor();
      if (denied) return denied;
      const [updated] = await db
        .update(matches)
        .set({ inviteStatus: "declined", updatedAt: now })
        .where(eq(matches.id, id))
        .returning();
      notifyPlayer(id, match.creatorName, "😔 Invitation refusée", `${match.guestName} a décliné la joust.`);
      return Response.json({ match: serializeMatch(updated) });
    }

    /* ── Arrival validation: player clicked "Je suis arrivé(e)" ──
       Nouveau flow : pas de timer auto. La validation d'arrivée n'est possible
       qu'à l'heure prévue de la joust (jamais avant). Quand les deux arrivées
       sont validées, l'un des joueurs lance la partie explicitement (action start). */
    if (body.action === "arrive") {
      const denied = await requireActor();
      if (denied) return denied;
      if (match.status !== "scheduled" || match.inviteStatus !== "accepted" || !match.timeControlConfirmed) {
        return Response.json({ error: "La joust doit être validée pour valider ton arrivée." }, { status: 409 });
      }
      if (now.getTime() < match.scheduledAt.getTime()) {
        return Response.json({ error: "La validation d'arrivée n'est possible qu'à l'heure prévue de la joust." }, { status: 409 });
      }

      const isCreator = playerName === match.creatorName;
      const isGuest = playerName === match.guestName;
      if (!isCreator && !isGuest) {
        return Response.json({ error: "Vous ne faites pas partie de ce duel." }, { status: 400 });
      }

      const [updated] = await db
        .update(matches)
        .set(
          isCreator
            ? { arrivalCreator: now, updatedAt: now }
            : { arrivalGuest: now, updatedAt: now },
        )
        .where(eq(matches.id, id))
        .returning();

      /* Créateur arrivé → notifier l'invité qu'il peut valider son arrivée. */
      if (isCreator && match.guestName) {
        notifyPlayer(id, match.guestName, "🎯 Ton adversaire est arrivé !", `${match.creatorName} t'attend — valide ton arrivée pour lancer la partie.`);
      }
      /* Invité arrivé → notifier le créateur que la partie va se lancer. */
      if (isGuest) {
        notifyPlayer(id, match.creatorName, "✅ Ton adversaire est arrivé !", `${match.guestName} a validé son arrivée — la partie va commencer.`);
      }
      broadcastMatchChange(id, { action: "arrive", playerName });
      return Response.json({ match: serializeMatch(updated) });
    }

    /* ── Nudge: le joueur arrivé relance une notification à l'adversaire absent
       (1 min min. entre deux). Aucun timer ne se déclenche automatiquement. */
    if (body.action === "nudge") {
      const denied = await requireActor();
      if (denied) return denied;
      if (now.getTime() < match.scheduledAt.getTime()) {
        return Response.json({ error: "La validation d'arrivée n'est possible qu'à l'heure prévue de la joust." }, { status: 409 });
      }
      const isCreator = playerName === match.creatorName;
      const isGuest = playerName === match.guestName;
      if (!isCreator && !isGuest) {
        return Response.json({ error: "Vous ne faites pas partie de ce duel." }, { status: 400 });
      }
      const iArrived = isCreator ? match.arrivalCreator : match.arrivalGuest;
      if (!iArrived) {
        return Response.json({ error: "Valide d'abord ton arrivée pour relancer une notification." }, { status: 409 });
      }
      const target = isCreator ? match.guestName : match.creatorName;
      if (!target) {
        return Response.json({ error: "L'adversaire n'a pas encore rejoint la joust." }, { status: 409 });
      }
      const targetArrived = isCreator ? match.arrivalGuest : match.arrivalCreator;
      if (targetArrived) {
        return Response.json({ error: "Ton adversaire a déjà validé son arrivée." }, { status: 409 });
      }
      /* 1 minute minimum entre deux relances. */
      if (match.arrivalNoticeSentAt && now.getTime() - match.arrivalNoticeSentAt.getTime() < 60_000) {
        const wait = Math.max(0, 60 - Math.floor((now.getTime() - match.arrivalNoticeSentAt.getTime()) / 1000));
        return Response.json({ error: `Tu pourras relancer une notification dans ${wait} s.` }, { status: 429 });
      }
      const [updated] = await db
        .update(matches)
        .set({ arrivalNoticeSentAt: now, arrivalNoticeCount: (match.arrivalNoticeCount ?? 0) + 1, updatedAt: now })
        .where(eq(matches.id, id))
        .returning();
      notifyPlayer(id, target, "🔔 Rappel : ton adversaire t'attend !", `${playerName} a validé son arrivée — clique pour valider la tienne et lancer la partie.`);
      broadcastMatchChange(id, { action: "nudge" });
      return Response.json({ match: serializeMatch(updated) });
    }

    /* ── Ultimatum: le joueur arrivé donne 1 minute à l'adversaire absent,
       sinon forfait. C'est le SEUL mécanisme qui déclenche un décompte :
       aucun timer ne part automatiquement. ── */
    if (body.action === "ultimatum") {
      const denied = await requireActor();
      if (denied) return denied;
      if (now.getTime() < match.scheduledAt.getTime()) {
        return Response.json({ error: "La validation d'arrivée n'est possible qu'à l'heure prévue de la joust." }, { status: 409 });
      }
      const isCreator = playerName === match.creatorName;
      const isGuest = playerName === match.guestName;
      if (!isCreator && !isGuest) {
        return Response.json({ error: "Vous ne faites pas partie de ce duel." }, { status: 400 });
      }
      const iArrived = isCreator ? match.arrivalCreator : match.arrivalGuest;
      if (!iArrived) {
        return Response.json({ error: "Valide d'abord ton arrivée pour envoyer un ultimatum." }, { status: 409 });
      }
      const target = isCreator ? match.guestName : match.creatorName;
      if (!target) {
        return Response.json({ error: "L'adversaire n'a pas encore rejoint la joust." }, { status: 409 });
      }
      const targetArrived = isCreator ? match.arrivalGuest : match.arrivalCreator;
      if (targetArrived) {
        return Response.json({ error: "Ton adversaire a déjà validé son arrivée." }, { status: 409 });
      }
      if (match.ultimatumDeadline) {
        return Response.json({ error: "Un ultimatum est déjà en cours." }, { status: 409 });
      }
      const deadline = new Date(now.getTime() + 60_000);
      const [updated] = await db
        .update(matches)
        .set({
          ultimatumSentAt: now,
          ultimatumDeadline: deadline,
          ultimatumBy: isCreator ? "creator" : "guest",
          updatedAt: now,
        })
        .where(eq(matches.id, id))
        .returning();
      notifyPlayer(id, target, "⏳ ULTIMATUM — 1 minute !", `${playerName} donne 1 minute pour te connecter et valider ton arrivée, sinon tu perds la partie.`);
      broadcastMatchChange(id, { action: "ultimatum" });
      return Response.json({ match: serializeMatch(updated) });
    }

    /* ── Ready check: player clicked "Prêt" ── */
    if (body.action === "ready") {
      const denied = await requireActor();
      if (denied) return denied;
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

      /* « Adversaire prêt » → notifier uniquement l'autre joueur (jamais celui qui a cliqué) */
      const targetReady = isWhitePlayer ? match.blackPlayer : match.whitePlayer;
      if (targetReady) notifyPlayer(id, targetReady, "✅ Ton adversaire est prêt !", `${playerName} est prêt à jouer — à toi de valider.`);
      return Response.json({ match: serializeMatch(updated) });
    }

    /* ── Manual start (both validations required) ── */
    if (body.action === "start") {
      const denied = await requireActor();
      if (denied) return denied;
      if (match.inviteStatus !== "accepted" || !match.timeControlConfirmed) {
        return Response.json({ error: "Les deux joueurs doivent valider la joust." }, { status: 409 });
      }
      /* Pas de départ automatique : la partie ne peut être lancée qu'à l'heure
         prévue ET une fois que les deux joueurs ont validé leur arrivée. */
      if (now.getTime() < match.scheduledAt.getTime()) {
        return Response.json({ error: "La joust ne peut commencer qu'à l'heure prévue." }, { status: 409 });
      }
      if (!match.arrivalCreator || !match.arrivalGuest) {
        return Response.json({ error: "Les deux joueurs doivent avoir validé leur arrivée." }, { status: 409 });
      }
      const [started] = await db
        .update(matches)
        .set({ status: "playing", updatedAt: now })
        .where(eq(matches.id, id))
        .returning();
      const withClocks = await startGame(started, now);
      /* Seul l'adversaire doit être prévenu du lancement (le lanceur est sur l'écran). */
      const otherPlayer = playerName === match.whitePlayer ? match.blackPlayer : match.whitePlayer;
      if (otherPlayer) notifyPlayer(id, otherPlayer, "▶️ La partie est lancée !", "Rejoignez l'échiquier, votre adversaire vous attend.");
      return Response.json({ match: serializeMatch(withClocks ?? started) });
    }

    /* ── Resign (review 3.2 §2) ── */
    if (body.action === "resign") {
      const denied = await requireActor();
      if (denied) return denied;
      const winner = playerName === match.whitePlayer ? match.blackPlayer : match.whitePlayer;
      const updated = await persistResult(match, "resign", winner);
      /* Pas de notification push : la victoire/défaite est affichée à l'écran
         via la mise à jour en temps réel (SSE / broadcast). */
      return Response.json({ match: serializeMatch(updated) });
    }

    /* ── Draw proposal (review 3.2 §2) ── */
    if (body.action === "draw") {
      const denied = await requireActor();
      if (denied) return denied;
      if (match.status !== "playing") {
        return Response.json({ error: "La partie n'est pas en cours." }, { status: 409 });
      }
      const by = playerName === match.creatorName ? "creator" : "guest";
      const [updated] = await db
        .update(matches)
        .set({ drawStatus: "proposed", drawProposedBy: by, updatedAt: now })
        .where(eq(matches.id, id))
        .returning();
      /* Pas de notification push pendant la partie : l'état est propagé en temps réel
         (SSE / broadcast), l'adversaire connecté verra la proposition à l'écran. */
      return Response.json({ match: serializeMatch(updated) });
    }

    /* ── Accept draw proposal ── */
    if (body.action === "draw-accept") {
      const denied = await requireActor();
      if (denied) return denied;
      const byMe = playerName === match.creatorName ? "creator" : "guest";
      if (match.drawStatus !== "proposed" || match.drawProposedBy === byMe) {
        return Response.json({ error: "Aucune proposition de nulle en attente." }, { status: 409 });
      }
      const updated = await persistResult(match, "agreed", null);
      /* Pas de notification push : la fin de partie (nulle) est affichée à l'écran
         via la mise à jour en temps réel (SSE / broadcast). */
      return Response.json({ match: serializeMatch(updated) });
    }

    /* ── Decline draw proposal ── */
    if (body.action === "draw-decline") {
      const denied = await requireActor();
      if (denied) return denied;
      const byMe = playerName === match.creatorName ? "creator" : "guest";
      if (match.drawStatus !== "proposed" || match.drawProposedBy === byMe) {
        return Response.json({ error: "Aucune proposition de nulle en attente." }, { status: 409 });
      }
      const [updated] = await db
        .update(matches)
        .set({ drawStatus: "declined", updatedAt: now })
        .where(eq(matches.id, id))
        .returning();
      /* Pas de notification push pendant la partie : le proposeur connecté
         verra le refus à l'écran via la mise à jour en temps réel. */
      return Response.json({ match: serializeMatch(updated) });
    }

    /* ── Re-arm the recurring alarm ── */
    if (body.action === "reschedule") {
      const denied = await requireActor();
      if (denied) return denied;
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
          arrivalCreator: null,
          arrivalGuest: null,
          arrivalNoticeSentAt: null,
          arrivalNoticeCount: 0,
          ultimatumSentAt: null,
          ultimatumDeadline: null,
          ultimatumBy: null,
          reminder5SentAt: null,
          drawStatus: "none",
          drawProposedBy: null,
          result: null,
          winnerName: null,
          endedAt: null,
          updatedAt: now,
        })
        .where(eq(matches.id, id))
        .returning();
      return Response.json({ match: serializeMatch(updated), moves: [] });
    }

    /* ── Rematch with inverted colors (review 3.3) ── */
    if (body.action === "rematch") {
      const denied = await requireActor();
      if (denied) return denied;
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
          arrivalCreator: null,
          arrivalGuest: null,
          arrivalNoticeSentAt: null,
          arrivalNoticeCount: 0,
          ultimatumSentAt: null,
          ultimatumDeadline: null,
          ultimatumBy: null,
          reminder5SentAt: null,
          whitePlayer: match.blackPlayer,
          blackPlayer: match.whitePlayer,
          drawStatus: "none",
          drawProposedBy: null,
          result: null,
          winnerName: null,
          endedAt: null,
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