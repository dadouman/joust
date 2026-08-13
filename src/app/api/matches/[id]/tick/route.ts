/* POST /api/matches/[id]/tick — mutable state machine polled by the client.
   The wake-up mechanics are game-agnostic (see advanceAlarm); any game
   logic (chess clock timeout…) runs inside the game adapter registered
   for `match.gameType`. This route NEVER imports a specific game engine. */
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { db } from "@/db";
import { matches } from "@/db/schema";
import { advanceAlarm } from "@/lib/alarm";
import { notifyMatch } from "@/lib/push";
import { broadcastMatchChange } from "@/lib/realtime";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const [match] = await db.select().from(matches).where(eq(matches.id, id)).limit(1);
  if (!match) return Response.json({ error: "Joust introuvable." }, { status: 404 });

  const now = new Date();
  const updated = await advanceAlarm(match, now);

  /* Timeout détecté par le tick (perte au temps) : propager la fin de partie.
     Le SSE le fera aussi via updatedAt, mais ce broadcast + push rend la fin
     immédiate et notifie les joueurs comme le font déjà les routes PATCH/moves. */
  if (updated.status === "completed" && match.status !== "completed") {
    broadcastMatchChange(id, {
      status: updated.status,
      result: updated.result,
      winnerName: updated.winnerName,
    });
    if (updated.result === "timeout" && updated.winnerName) {
      notifyMatch(id, "⏱️ Temps écoulé !", `${updated.winnerName} gagne — partie terminée.`);
    }
  }

  return Response.json({ ok: true, status: updated.status });
}