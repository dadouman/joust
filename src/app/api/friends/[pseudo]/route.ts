import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { friends } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ pseudo: string }> };

/** DELETE /api/friends/:pseudo — retire un ami de la liste. */
export async function DELETE(_request: Request, { params }: RouteContext) {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "Connecte-toi pour gérer tes amis." }, { status: 401 });
  }

  const { pseudo } = await params;
  const friendPseudo = decodeURIComponent(pseudo);

  await db
    .delete(friends)
    .where(and(eq(friends.userPseudo, user.pseudo), eq(friends.friendPseudo, friendPseudo)));

  return Response.json({ ok: true });
}