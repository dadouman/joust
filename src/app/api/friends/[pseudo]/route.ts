import { and, eq, or } from "drizzle-orm";
import { db } from "@/db";
import { friends } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ pseudo: string }> };

/** DELETE /api/friends/:pseudo — retire un ami (dans les deux sens). */
export async function DELETE(_request: Request, { params }: RouteContext) {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "Connecte-toi pour gérer tes amis." }, { status: 401 });
  }

  const { pseudo } = await params;
  const friendPseudo = decodeURIComponent(pseudo);

  /* Supprime les deux directions (user→friend et friend→user). */
  await db
    .delete(friends)
    .where(
      or(
        and(eq(friends.userPseudo, user.pseudo), eq(friends.friendPseudo, friendPseudo)),
        and(eq(friends.userPseudo, friendPseudo), eq(friends.friendPseudo, user.pseudo)),
      ),
    );

  return Response.json({ ok: true });
}