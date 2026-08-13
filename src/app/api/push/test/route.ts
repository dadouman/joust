import { NextRequest } from "next/server";
import { sendPushToMatch } from "@/lib/push";

export const dynamic = "force-dynamic";

/* POST /api/push/test — envoie une notification push de test à tous les
   appareils abonnés d'un match.
   Body : { matchId, title?, body? } */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      matchId?: string;
      title?: string;
      body?: string;
    };
    if (!body.matchId) return Response.json({ error: "matchId manquant." }, { status: 400 });

    const sent = await sendPushToMatch(
      body.matchId,
      body.title?.slice(0, 80) ?? "🔔 Joust",
      body.body?.slice(0, 200) ?? "Notifications activées !",
    );

    if (sent === 0) {
      return Response.json(
        { error: "Aucun appareil abonné pour ce duel. Activez d’abord les notifications." },
        { status: 400 },
      );
    }
    return Response.json({ ok: true, sent });
  } catch {
    return Response.json({ error: "Envoi impossible." }, { status: 400 });
  }
}