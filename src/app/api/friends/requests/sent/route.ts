import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { friendRequests } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** GET /api/friends/requests/sent — liste les demandes d'ami envoyées en attente. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "Connecte-toi pour voir tes demandes envoyées." }, { status: 401 });
  }

  const rows = await db
    .select()
    .from(friendRequests)
    .where(and(eq(friendRequests.fromPseudo, user.pseudo), eq(friendRequests.status, "pending")))
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