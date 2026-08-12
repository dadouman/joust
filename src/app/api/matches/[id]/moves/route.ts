import { asc, eq } from "drizzle-orm";
import { Chess } from "chess.js";
import { NextRequest } from "next/server";
import { db } from "@/db";
import { matchMoves, matches } from "@/db/schema";
import { assertCanActAs } from "@/lib/auth";
import { notifyMatch } from "@/lib/push";
import { persistResult } from "@/lib/result";
import { serializeMatch, serializeMove } from "@/lib/serialize";
import { tcInfo } from "@/lib/time-control";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

const squarePattern = /^[a-h][1-8]$/;
const promotionPattern = /^[qrbn]$/;

export async function POST(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;

  try {
    const body = (await request.json()) as {
      from?: string;
      to?: string;
      promotion?: string;
      playerName?: string;
      token?: string;
    };
    const from = body.from?.toLowerCase() ?? "";
    const to = body.to?.toLowerCase() ?? "";
    const promotion = body.promotion?.toLowerCase();
    const playerName = body.playerName?.trim();
    const token = body.token;

    if (!squarePattern.test(from) || !squarePattern.test(to) || (promotion && !promotionPattern.test(promotion))) {
      return Response.json({ error: "Coup invalide." }, { status: 400 });
    }
    if (!playerName) {
      return Response.json({ error: "Joueur requis." }, { status: 400 });
    }

    const [match] = await db.select().from(matches).where(eq(matches.id, id)).limit(1);
    if (!match) return Response.json({ error: "Rendez-vous introuvable." }, { status: 404 });

    /* Authenticate: session cookie must match the account pseudo, or legacy per-match token. */
    const actor = await assertCanActAs(match, playerName, token);
    if (!actor) {
      return Response.json({ error: "Connecte-toi pour jouer." }, { status: 401 });
    }

    if (match.status === "completed") {
      return Response.json({ error: "Cette partie est déjà terminée." }, { status: 409 });
    }
    if (match.inviteStatus !== "accepted" || !match.timeControlConfirmed) {
      return Response.json({ error: "Les deux joueurs doivent valider la joust." }, { status: 409 });
    }
    if (match.status === "scheduled" && match.scheduledAt.getTime() > Date.now()) {
      return Response.json({ error: "La partie n'a pas encore commencé." }, { status: 409 });
    }

    const chess = new Chess(match.lastFen ?? undefined);
    const expectedPlayer = chess.turn() === "w" ? match.whitePlayer : match.blackPlayer;
    if (playerName !== expectedPlayer) {
      return Response.json({ error: `C’est le tour de ${expectedPlayer}.` }, { status: 409 });
    }

    /* ── Chess clock: subtract elapsed time, then add Fischer increment ── */
    const now = new Date();
    const increment = tcInfo(match.timeControl).increment;
    let whiteClock = match.clockWhiteSeconds;
    let blackClock = match.clockBlackSeconds;
    if (match.lastMoveAt) {
      const elapsed = Math.floor((now.getTime() - match.lastMoveAt.getTime()) / 1000);
      if (chess.turn() === "w") whiteClock -= elapsed;
      else blackClock -= elapsed;
    }
    /* Add increment to the mover's clock (Fischer) */
    whiteClock += chess.turn() === "w" ? increment : 0;
    blackClock += chess.turn() === "w" ? 0 : increment;

    if (whiteClock <= 0 || blackClock <= 0) {
      const loser = chess.turn() === "w" ? match.whitePlayer : match.blackPlayer;
      const winner = chess.turn() === "w" ? match.blackPlayer : match.whitePlayer;
      const updated = await persistResult(match, "timeout", winner);
      notifyMatch(id, "⏱️ Temps écoulé !", `${loser} a épuisé son temps — partie terminée.`);
      return Response.json(
        { error: `${loser} a épuisé son temps.`, match: updated },
        { status: 409 },
      );
    }

    const legalMove = chess.move({ from, to, promotion: promotion ?? "q" });
    if (!legalMove) return Response.json({ error: "Ce coup n’est pas légal." }, { status: 400 });

    const previousMoves = await db
      .select({ ply: matchMoves.ply, san: matchMoves.san })
      .from(matchMoves)
      .where(eq(matchMoves.matchId, id))
      .orderBy(asc(matchMoves.ply));
    /* Result detection (review 3.2 §6) */
    let nextStatus: "playing" | "completed" = "playing";
    let gameResult: string | null = null;
    let gameWinner: string | null = null;

    if (chess.isCheckmate()) {
      nextStatus = "completed";
      gameResult = "checkmate";
      gameWinner = chess.turn() === "w" ? match.blackPlayer : match.whitePlayer;
    } else if (chess.isStalemate()) {
      nextStatus = "completed";
      gameResult = "stalemate";
    } else if (chess.isInsufficientMaterial()) {
      nextStatus = "completed";
      gameResult = "insufficient";
    } else if (chess.isThreefoldRepetition()) {
      nextStatus = "completed";
      gameResult = "threefold";
    } else if (chess.isDrawByFiftyMoves()) {
      nextStatus = "completed";
      gameResult = "fifty";
    }

    const [createdMove] = await db
      .insert(matchMoves)
      .values({
        matchId: id,
        ply: previousMoves.length + 1,
        fromSquare: from,
        toSquare: to,
        promotion: legalMove.promotion || null,
        san: legalMove.san,
        fen: chess.fen(),
      })
      .returning();

    if (nextStatus === "completed" && gameResult) {
      const allMoves = [...previousMoves, { ply: previousMoves.length + 1, san: legalMove.san }];
      const updated = await persistResult(match, gameResult, gameWinner, allMoves);
      notifyMatch(
        id,
        gameWinner ? "♛ Échec et mat !" : "🤝 Partie nulle",
        gameWinner
          ? `${gameWinner} gagne (${gameResult}).`
          : `Partie nulle (${gameResult}).`,
      );
      return Response.json({ move: serializeMove(createdMove), match: serializeMatch(updated) });
    }

    const [updatedMatch] = await db
      .update(matches)
      .set({
        lastFen: chess.fen(),
        status: nextStatus,
        clockWhiteSeconds: whiteClock,
        clockBlackSeconds: blackClock,
        lastMoveAt: now,
        updatedAt: now,
      })
      .where(eq(matches.id, id))
      .returning();

    return Response.json({ move: serializeMove(createdMove), match: serializeMatch(updatedMatch) });
  } catch {
    return Response.json({ error: "Impossible d’enregistrer le coup." }, { status: 400 });
  }
}