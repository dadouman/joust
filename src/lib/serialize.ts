/* Shared serialization helpers - used by all API routes.
   Session tokens are NEVER exposed to the client (review 2.2.2). */
import { matchMoves, matches } from "@/db/schema";

export function serializeMatch(match: typeof matches.$inferSelect) {
  const { creatorToken: _creatorToken, guestToken: _guestToken, ...rest } = match;
  void _creatorToken;
  void _guestToken;
  return {
    ...rest,
    scheduledAt: match.scheduledAt.toISOString(),
    readyWhite: match.readyWhite?.toISOString() ?? null,
    readyBlack: match.readyBlack?.toISOString() ?? null,
    arrivalCreator: match.arrivalCreator?.toISOString() ?? null,
    arrivalGuest: match.arrivalGuest?.toISOString() ?? null,
    arrivalNoticeSentAt: match.arrivalNoticeSentAt?.toISOString() ?? null,
    ultimatumDeadline: match.ultimatumDeadline?.toISOString() ?? null,
    lastMoveAt: match.lastMoveAt?.toISOString() ?? null,
    endedAt: match.endedAt?.toISOString() ?? null,
    createdAt: match.createdAt.toISOString(),
    updatedAt: match.updatedAt.toISOString(),
  };
}

export function serializeMove(move: typeof matchMoves.$inferSelect) {
  return { ...move, createdAt: move.createdAt.toISOString() };
}