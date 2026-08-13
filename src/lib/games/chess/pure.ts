/* Pure chess helpers — game logic only, no DB access.
   Kept separate from adapter.ts so the rules can be unit-tested
   without a database and reused by any future chess client. */

import { Chess } from "chess.js";
import type { MatchRow } from "../types";

/** Build a Chess instance from the match's stored state (or a fresh game). */
export function chessFromMatch(match: MatchRow): Chess {
  return new Chess(match.lastFen ?? undefined);
}

/** Current side to move as the player column name: "w" → whitePlayer, "b" → blackPlayer. */
export function playerForTurn(match: MatchRow, turn: "w" | "b"): string {
  return turn === "w" ? match.whitePlayer : match.blackPlayer;
}

export function opponentOf(match: MatchRow, playerName: string): string {
  return playerName === match.whitePlayer ? match.blackPlayer : match.whitePlayer;
}

export function isWhitePlayer(match: MatchRow, playerName: string): boolean {
  return playerName === match.whitePlayer;
}

/** Standard chess end conditions → { result, winner } or null. */
export function detectChessEnd(
  chess: Chess,
  match: MatchRow,
): { result: string; winner: string | null } | null {
  if (chess.isCheckmate()) {
    return {
      result: "checkmate",
      winner: chess.turn() === "w" ? match.blackPlayer : match.whitePlayer,
    };
  }
  if (chess.isStalemate()) return { result: "stalemate", winner: null };
  if (chess.isInsufficientMaterial()) return { result: "insufficient", winner: null };
  if (chess.isThreefoldRepetition()) return { result: "threefold", winner: null };
  if (chess.isDrawByFiftyMoves()) return { result: "fifty", winner: null };
  return null;
}