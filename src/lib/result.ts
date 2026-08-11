/* Shared helpers for persisting game results - review 3.2 & 3.3. */
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { matches, playerStats } from "@/db/schema";
import { newRatings, pairKey } from "@/lib/elo";

export type MatchRow = typeof matches.$inferSelect;

/** Persist head-to-head stats + Elo after a finished game. */
export async function persistResult(
  match: MatchRow,
  result: string,
  winner: string | null,
) {
  const white = match.whitePlayer;
  const black = match.blackPlayer;
  const now = new Date();
  const scoreWhite = winner === null ? 0.5 : winner === white ? 1 : 0;
  const ra = match.ratingWhiteBefore ?? 1000;
  const rb = match.ratingBlackBefore ?? 1000;
  const { ratingA, ratingB } = newRatings(ra, rb, scoreWhite);

  const [updated] = await db
    .update(matches)
    .set({
      status: "completed",
      result,
      winnerName: winner,
      endedAt: now,
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