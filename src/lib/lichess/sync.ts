import { eq } from "drizzle-orm";
import { db } from "@/db";
import { matches } from "@/db/schema";
import { connectBoardGameStream } from "./stream";
import { mapLichessStatus } from "./service";
import { persistChessResult } from "@/lib/result";
import type { GameStateEvent } from "./types";

export async function applyGameState(matchId: string, evt: GameStateEvent) {
  const [match] = await db.select().from(matches).where(eq(matches.id, matchId)).limit(1);
  if (!match) return;

  const now = new Date();
  const clockWhiteSeconds = Math.floor(evt.wtime / 1000);
  const clockBlackSeconds = Math.floor(evt.btime / 1000);
  const isFinished = evt.status !== "created" && evt.status !== "started";

  const common = {
    lastFen: evt.fen,
    clockWhiteSeconds,
    clockBlackSeconds,
    lastMoveAt: now,
  };

  if (isFinished) {
    const result = mapLichessStatus(evt.status, evt.winner as string, match.whitePlayer, match.blackPlayer);
    const updated = await persistChessResult(match, result.result, result.winner);
    await db
      .update(matches)
      .set({ ...common, gameState: { ...(match.gameState ?? {}), lichessStatus: evt.status }, updatedAt: now })
      .where(eq(matches.id, matchId));
    return updated;
  }

  const [updated] = await db
    .update(matches)
    .set({ ...common, status: "playing", updatedAt: now })
    .where(eq(matches.id, matchId))
    .returning();
  return updated;
}
