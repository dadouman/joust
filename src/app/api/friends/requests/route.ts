import { and, desc, eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { db } from "@/db";
import { friendRequests, friends } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** GET /api/friends/requests — liste les demandes d'ami reçues en attente. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "Connecte-toi pour voir tes demandes d'ami." }, { status: 401 });
  }

  const rows = await db
    .select()
    .from(friendRequests)
    .where(and(eq(friendRequests.toPseudo, user.pseudo), eq(friendRequests.status, "pending")))
    .orderBy(desc(friendRequests.createdAt));

  return Response.json({
    requests: rows.map((r) => ({
      id: r.id,
      fromPseudo: r.fromPseudo,
      toPseudo: r.toPseudo,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
    })),
  });
}

/** POST /api/friends/requests — répond à une demande reçue.
    Body: { id, action: "accept" | "decline" } */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "Connecte-toi pour répondre à une demande." }, { status: 401 });
  }

  try {
    const body = (await request.json()) as { id?: string; action?: string };
    if (!body.id || !["accept", "decline"].includes(body.action ?? "")) {
      return Response.json({ error: "Paramètres invalides." }, { status: 400 });
    }

    const [req] = await db
      .select()
      .from(friendRequests)
      .where(eq(friendRequests.id, body.id))
      .limit(1);

    if (!req || req.toPseudo !== user.pseudo) {
      return Response.json({ error: "Demande introuvable." }, { status: 404 });
    }
    if (req.status !== "pending") {
      return Response.json({ error: "Cette demande a déjà été traitée." }, { status: 409 });
    }

    const now = new Date();
    const status = body.action === "accept" ? "accepted" : "declined";

    await db
      .update(friendRequests)
      .set({ status, respondedAt: now })
      .where(eq(friendRequests.id, req.id));

    if (status === "accepted") {
      /* Crée l'amitié bidirectionnelle. */
      await db.insert(friends).values([
        { userPseudo: user.pseudo, friendPseudo: req.fromPseudo, createdAt: now },
        { userPseudo: req.fromPseudo, friendPseudo: user.pseudo, createdAt: now },
      ]);
    }

    return Response.json({
      ok: true,
      status,
      friend: status === "accepted" ? { pseudo: req.fromPseudo, addedAt: now.toISOString() } : null,
    });
  } catch {
    return Response.json({ error: "Impossible de traiter la demande." }, { status: 400 });
  }
}