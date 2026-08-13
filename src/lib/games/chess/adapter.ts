/* ── Chess game adapter ──
   All chess-specific logic lives here:
   - clock initialisation on game start
   - timeout detection on tick
   - move application (chess.js rules, clock subtraction, result detection)
   - PGN persistence

   The alarm machinery (tick route) never imports chess.js directly. */

import { asc, eq } from "drizzle-orm";
import { Chess } from "chess.js";
import { db } from "@/db";
import { matchMoves, matches } from "@/db/schema";
import { persistChessResult, type MoveRow } from "@/lib/result";
import { serializeMove } from "@/lib/serialize";
import { tcInfo } from "@/lib/time-control";
import type { GameActionResult, GameAdapter, MatchRow } from "../types";
import { chessFromMatch, detectChessEnd, opponentOf, playerForTurn } from "./pure";

const squarePattern = /^[a-h][1-8]$/;
const promotionPattern = /^[qrbn]$/;

/** Initialize chess clocks once both players are ready. */
async function startClocks(match: MatchRow, now: Date): Promise<MatchRow> {
  if (match.clockWhiteSeconds !== 0 || match.clockBlackSeconds !== 0) return match;
  const seconds = tcInfo(match.timeControl).seconds;
  const [updated] = await db
    .update(matches)
    .set({ clockWhiteSeconds: seconds, clockBlackSeconds: seconds, lastMoveAt: now, updatedAt: now })
    .where(eq(matches.id, match.id))
    .returning();
  return updated ?? match;
}

export const chessAdapter: GameAdapter = {
  type: "chess",
  label: "Échecs",

  onGameStart: async (match, now) => startClocks(match, now),

  onTick: async (match, now) => {
    /* Timeout detection during chess: the player to move ran out of clock.
       Note : la partie peut démarrer via le fallback 60 s sans que readyWhite
       et readyBlack soient tous deux remplis (ex. un joueur absent n'a jamais
       cliqué « Prêt »). La garde pertinente n'est donc pas « les deux prêts »
       mais « les horloges ont été initialisées » (onGameStart a posé lastMoveAt). */
    const chess = chessFromMatch(match);
    const clocksInitialized = match.clockWhiteSeconds > 0 || match.clockBlackSeconds > 0;
    if (match.status === "playing" && match.lastMoveAt && clocksInitialized) {
      const turn = chess.turn();
      const clock = turn === "w" ? match.clockWhiteSeconds : match.clockBlackSeconds;
      const remaining = clock - Math.floor((now.getTime() - match.lastMoveAt.getTime()) / 1000);
      if (remaining <= 0) {
        const loser = playerForTurn(match, turn);
        const winner = opponentOf(match, loser);
        return persistChessResult(match, "timeout", winner);
      }
    }
    return match;
  },

  applyAction: async (match, action, input, playerName) => {
    if (action !== "move") {
      throw new Error("Action échecs inconnue.");
    }

    const from = String(input.from ?? "").toLowerCase();
    const to = String(input.to ?? "").toLowerCase();
    const promotion = input.promotion ? String(input.promotion).toLowerCase() : undefined;

    if (!squarePattern.test(from) || !squarePattern.test(to) || (promotion && !promotionPattern.test(promotion))) {
      throw new Error("Coup invalide.");
    }

    const chess = chessFromMatch(match);
    const expectedPlayer = playerForTurn(match, chess.turn());
    if (playerName !== expectedPlayer) {
      throw new Error(`C’est le tour de ${expectedPlayer}.`);
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
    whiteClock += chess.turn() === "w" ? increment : 0;
    blackClock += chess.turn() === "w" ? 0 : increment;

    if (whiteClock <= 0 || blackClock <= 0) {
      const loser = playerForTurn(match, chess.turn());
      const winner = opponentOf(match, loser);
      const ended = await persistChessResult(match, "timeout", winner);
      return {
        match: ended,
        update: { error: `${loser} a épuisé son temps.`, result: "timeout", winnerName: winner },
      };
    }

    const legalMove = chess.move({ from, to, promotion: promotion ?? "q" });
    if (!legalMove) throw new Error("Ce coup n’est pas légal.");

    const previousMoves = await db
      .select({ ply: matchMoves.ply, san: matchMoves.san })
      .from(matchMoves)
      .where(eq(matchMoves.matchId, match.id))
      .orderBy(asc(matchMoves.ply));

    const end = detectChessEnd(chess, match);
    const nextStatus: "playing" | "completed" = end ? "completed" : "playing";

    const [createdMove] = await db
      .insert(matchMoves)
      .values({
        matchId: match.id,
        ply: previousMoves.length + 1,
        fromSquare: from,
        toSquare: to,
        promotion: legalMove.promotion || null,
        san: legalMove.san,
        fen: chess.fen(),
      })
      .returning();

    if (end && nextStatus === "completed") {
      const allMoves: MoveRow[] = [...previousMoves, { ply: previousMoves.length + 1, san: legalMove.san }];
      const updated = await persistChessResult(match, end.result, end.winner, allMoves);
      return {
        match: updated,
        update: {
          move: serializeMove(createdMove),
          fen: chess.fen(),
          status: "completed",
          result: end.result,
          winnerName: end.winner,
        },
      };
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
      .where(eq(matches.id, match.id))
      .returning();

    return {
      match: updatedMatch,
      update: { move: serializeMove(createdMove), fen: chess.fen(), status: nextStatus },
    };
  },

  serialize: (match) => ({
    /* Legacy chess fields are already flat on the match row; nothing extra. */
    lastFen: match.lastFen,
    whitePlayer: match.whitePlayer,
    blackPlayer: match.blackPlayer,
    clockWhiteSeconds: match.clockWhiteSeconds,
    clockBlackSeconds: match.clockBlackSeconds,
    lastMoveAt: match.lastMoveAt?.toISOString() ?? null,
    pgn: match.pgn,
  }),
};