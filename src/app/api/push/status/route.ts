import { and, eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { db } from "@/db";
import { pushSubscriptions } from "@/db/schema";

export const dynamic = "force-dynamic";

/* GET /api/push/status?matchId=...&playerName=...
   Vérifie si le joueur est abonné côté serveur pour ce match. */
export async function GET(request: NextRequest) {
  try {
    const matchId = request.nextUrl.searchParams.get("matchId");
    const playerName = request.nextUrl.searchParams.get("playerName");
    if (!matchId || !playerName) {
      return Response.json({ error: "Paramètres manquants." }, { status: 400 });
    }

    const rows = await db
      .select({ id: pushSubscriptions.id })
      .from(pushSubscriptions)
      .where(
        and(
          eq(pushSubscriptions.matchId, matchId),
          eq(pushSubscriptions.playerName, playerName),
        ),
      )
      .limit(1);

    return Response.json({ subscribed: rows.length > 0 });
  } catch {
    return Response.json({ error: "Vérification impossible." }, { status: 500 });
  }
}