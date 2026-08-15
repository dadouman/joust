/* POST /api/matches/[id]/tick — mutable state machine polled by the client.
   The wake-up mechanics are game-agnostic (see advanceAlarm); any game
   logic (chess clock timeout…) runs inside the game adapter registered
   for `match.gameType`. This route NEVER imports a specific game engine. */
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { db } from "@/db";
import { matches } from "@/db/schema";
import { advanceAlarm } from "@/lib/alarm";
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
     Le broadcast rend la fin immédiate pour les deux joueurs ; le résultat
     est affiché à l'écran (card de fin de partie) — pas de push ici. */
  if (updated.status === "completed" && match.status !== "completed") {
    broadcastMatchChange(id, {
      status: updated.status,
      result: updated.result,
      winnerName: updated.winnerName,
    });
    /* Pas de notification push pour le timeout : le résultat est affiché à l'écran
       via la mise à jour en temps réel (SSE / broadcast). */
  }

  return Response.json({ ok: true, status: updated.status });
}