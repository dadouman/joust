import { NextRequest } from "next/server";
import { deleteSubscription, saveSubscription } from "@/lib/push";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      matchId?: string;
      playerName?: string;
      subscription?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
    };

    const endpoint = body.subscription?.endpoint;
    const p256dh = body.subscription?.keys?.p256dh;
    const auth = body.subscription?.keys?.auth;
    if (!body.matchId || !body.playerName || !endpoint || !p256dh || !auth) {
      return Response.json({ error: "Abonnement incomplet." }, { status: 400 });
    }

    await saveSubscription({
      matchId: body.matchId,
      playerName: body.playerName.slice(0, 80),
      endpoint,
      p256dh,
      auth,
    });

    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "Impossible d’enregistrer l’abonnement." }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = (await request.json()) as { endpoint?: string };
    if (!body.endpoint) return Response.json({ error: "endpoint manquant." }, { status: 400 });
    await deleteSubscription(body.endpoint);
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "Impossible de supprimer l’abonnement." }, { status: 400 });
  }
}
