/* Per-player session token verification (review 2.2.2). */
import { matches } from "@/db/schema";

export type MatchRow = typeof matches.$inferSelect;

export function verifyPlayerToken(
  match: MatchRow,
  playerName: string,
  token: string | undefined | null,
): string | null {
  if (!token) return null;
  if (playerName === match.creatorName && token === match.creatorToken) return playerName;
  if (playerName === match.guestName && token === match.guestToken) return playerName;
  return null;
}