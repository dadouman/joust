import { and, eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { db } from "@/db";
import { friends, users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** GET /api/friends — liste les pseudos des amis de l'utilisateur connecté. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "Connecte-toi pour voir tes amis." }, { status: 401 });
  }

  const rows = await db
    .select({ friendPseudo: friends.friendPseudo, createdAt: friends.createdAt })
    .from(friends)
    .where(eq(friends.userPseudo, user.pseudo))
    .orderBy(friends.createdAt);

  return Response.json({ friends: rows.map((r) => ({ pseudo: r.friendPseudo, addedAt: r.createdAt.toISOString() })) });
}

/** POST /api/friends — ajoute un ami par pseudo (le pseudo doit exister dans `users`). */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "Connecte-toi pour ajouter un ami." }, { status: 401 });
  }

  try {
    const body = (await request.json()) as { pseudo?: string };
    const friendPseudo = body.pseudo?.trim();
    if (!friendPseudo) {
      return Response.json({ error: "Pseudo requis." }, { status: 400 });
    }
    if (friendPseudo.length > 80) {
      return Response.json({ error: "Pseudo trop long." }, { status: 400 });
    }
    if (friendPseudo.toLowerCase() === user.pseudo.toLowerCase()) {
      return Response.json({ error: "Tu ne peux pas t'ajouter toi-même." }, { status: 400 });
    }

    /* Le pseudo doit appartenir à un compte existant (sinon « ami » fantôme). */
    const [target] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.pseudo, friendPseudo))
      .limit(1);
    if (!target) {
      return Response.json({ error: "Ce pseudo n'existe pas." }, { status: 404 });
    }

    const [existing] = await db
      .select({ id: friends.id })
      .from(friends)
      .where(and(eq(friends.userPseudo, user.pseudo), eq(friends.friendPseudo, friendPseudo)))
      .limit(1);
    if (existing) {
      return Response.json({ error: `${friendPseudo} est déjà dans ta liste d'amis.` }, { status: 409 });
    }

    const [created] = await db
      .insert(friends)
      .values({ userPseudo: user.pseudo, friendPseudo })
      .returning();

    return Response.json({
      friend: { pseudo: created.friendPseudo, addedAt: created.createdAt.toISOString() },
    }, { status: 201 });
  } catch {
    return Response.json({ error: "Impossible d'ajouter cet ami." }, { status: 400 });
  }
}