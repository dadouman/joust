import { eq } from "drizzle-orm";
import { db } from "@/db";
import { matches } from "@/db/schema";
import { createChallenge, acceptChallenge } from "./service";
import { connectBoardGameStream } from "./stream";
import { applyGameState } from "./sync";
import { lichessAccount } from "./client";
import { broadcastMatchChange } from "@/lib/realtime";
import type { MatchRow } from "@/lib/games/types";
import { tcInfo } from "@/lib/time-control";

export async function startLichessGame(match: MatchRow): Promise<string> {
  const whiteToken = process.env.LICHESS_WHITE_TOKEN ?? "";
  const blackToken = process.env.LICHESS_BLACK_TOKEN ?? "";
  if (!whiteToken || !blackToken) {
    throw new Error("Tokens Lichess manquants dans l'environnement.");
  }

  let blackUsername = process.env.LICHESS_BLACK_USERNAME ?? "";
  if (!blackUsername) {
    const acc = await lichessAccount(blackToken);
    blackUsername = acc.username;
  }

  const tc = tcInfo(match.timeControl);
  const ch = (await createChallenge(whiteToken, blackUsername, tc.minutes, tc.increment)) as unknown as { id: string };
  await acceptChallenge(blackToken, ch.id);

  const gameState = { ...(match.gameState ?? {}), lichessGameId: ch.id, lichessStatus: "created" };
  await db
    .update(matches)
    .set({ gameState, status: "playing", updatedAt: new Date() })
    .where(eq(matches.id, match.id));

  void connectBoardGameStream(ch.id, whiteToken, (evt) => {
    if (evt.type === "gameState") {
      void applyGameState(match.id, evt).then(() => {
        broadcastMatchChange(match.id, { fen: evt.fen });
      });
    } else if (evt.type === "gameFull" && evt.state) {
      void applyGameState(match.id, evt.state).then(() => {
        broadcastMatchChange(match.id, { fen: evt.state.fen });
      });
    }
  });

  return ch.id;
}