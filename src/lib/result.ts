/* Shared helpers for persisting game results + final PGN. */
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { matches, playerStats } from "@/db/schema";
import { newRatings, pairKey } from "@/lib/elo";

export type MatchRow = typeof matches.$inferSelect;
export type MoveRow = { san: string; ply: number };

/** Build a minimal but complete PGN from the stored SAN moves. */
export function buildPgn(
  match: MatchRow,
  moves: MoveRow[],
  result: string,
  winner: string | null,
): string {
  const headers = [
    `[Event "Joust"]`,
    `[Site "Joust"]`,
    `[Date "${new Date().toISOString().slice(0, 10)}"]`,
    `[White "${match.whitePlayer}"]`,
    `[Black "${match.blackPlayer}"]`,
    `[Result "${winner ? (winner === match.whitePlayer ? "1-0" : "0-1") : "1/2-1/2"}"]`,
    `[TimeControl "${match.timeControl}"]`,
  ].join("\n");

  const san = moves.sort((a, b) => a.ply - b.ply).map((m) => m.san);
  let body = "";
  for (let i = 0; i < san.length; i += 2) {
    const moveNumber = i / 2 + 1;
    const white = san[i];
    const black = san[i + 1] ?? "";
    body += `${moveNumber}. ${white}${black ? ` ${black}` : ""} `;
  }

  const suffix =
    result === "checkmate"
      ? "#"
      : winner
        ? (winner === match.whitePlayer ? " 1-0" : " 0-1")
        : " 1/2-1/2";

  return `${headers}\n\n${body.trim()}${suffix}`;
}

/** Persist head-to-head stats + Elo + final PGN after a finished game. */
export async function persistResult(
  match: MatchRow,
  result: string,
  winner: string | null,
  moves: MoveRow[] = [],
) {
  const white = match.whitePlayer;
  const black = match.blackPlayer;
  const now = new Date();
  const scoreWhite = winner === null ? 0.5 : winner === white ? 1 : 0;
  const ra = match.ratingWhiteBefore ?? 1000;
  const rb = match.ratingBlackBefore ?? 1000;
  const { ratingA, ratingB } = newRatings(ra, rb, scoreWhite);

  const pgn = buildPgn(match, moves, result, winner);

  const [updated] = await db
    .update(matches)
    .set({
      status: "completed",
      result,
      winnerName: winner,
      endedAt: now,
      pgn,
      ratingWhiteAfter: ratingA,
      ratingBlackAfter: ratingB,
      updatedAt: now,
    })
    .where(eq(matches.id, match.id))
    .returning();

  const key = pairKey(white, black);
  const names = [white.trim(), black.trim()].sort((x, y) => x.localeCompare(y));
  const a = names[0];
  const b = names[1];
  const rows = await db.select().from(playerStats).where(eq(playerStats.pairKey, key)).limit(1);
  const existing = rows[0];

  const ratingAcol = a === white ? ratingA : ratingB;
  const ratingBcol = b === black ? ratingB : ratingA;

  if (existing) {
    await db.update(playerStats).set({
      winsA: existing.winsA + (winner === a ? 1 : 0),
      winsB: existing.winsB + (winner === b ? 1 : 0),
      draws: existing.draws + (winner ? 0 : 1),
      matchCount: existing.matchCount + 1,
      ratingA: ratingAcol,
      ratingB: ratingBcol,
      updatedAt: now,
    }).where(eq(playerStats.id, existing.id));
  } else {
    await db.insert(playerStats).values({
      pairKey: key,
      playerA: a,
      playerB: b,
      winsA: winner === a ? 1 : 0,
      winsB: winner === b ? 1 : 0,
      draws: winner ? 0 : 1,
      matchCount: 1,
      ratingA: ratingAcol,
      ratingB: ratingBcol,
    });
  }

  return updated ?? match;
}