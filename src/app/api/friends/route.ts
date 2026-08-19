import { and, desc, eq, or } from "drizzle-orm";
import { NextRequest } from "next/server";
import { db } from "@/db";
import { friendRequests, friends, users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** GET /api/friends — liste les amis (mutuellement acceptés) de l'utilisateur. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "Connecte-toi pour voir tes amis." }, { status: 401 });
  }

  const rows = await db
    .select({ friendPseudo: friends.friendPseudo, createdAt: friends.createdAt })
    .from(friends)
    .where(eq(friends.userPseudo, user.pseudo))
    .orderBy(desc(friends.createdAt));

  return Response.json({ friends: rows.map((r) => ({ pseudo: r.friendPseudo, addedAt: r.createdAt.toISOString() })) });
}

/** POST /api/friends — envoie une demande d'ami à un pseudo.
    L'acceptation mutuelle est requise : le destinataire doit accepter
    la demande (via acceptFriendRequest) avant que l'amitié soit créée. */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "Connecte-toi pour envoyer une demande d'ami." }, { status: 401 });
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

    /* Le pseudo doit appartenir à un compte existant. */
    const [target] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.pseudo, friendPseudo))
      .limit(1);
    if (!target) {
      return Response.json({ error: "Ce pseudo n'existe pas." }, { status: 404 });
    }

    /* Déjà amis ? */
    const [existingFriend] = await db
      .select({ id: friends.id })
      .from(friends)
      .where(and(eq(friends.userPseudo, user.pseudo), eq(friends.friendPseudo, friendPseudo)))
      .limit(1);
    if (existingFriend) {
      return Response.json({ error: `${friendPseudo} est déjà dans ta liste d'amis.` }, { status: 409 });
    }

    /* Déjà une demande en attente dans un sens ou l'autre ? */
    const [pendingEither] = await db
      .select({ id: friendRequests.id, fromPseudo: friendRequests.fromPseudo, toPseudo: friendRequests.toPseudo, status: friendRequests.status })
      .from(friendRequests)
      .where(
        or(
          and(eq(friendRequests.fromPseudo, user.pseudo), eq(friendRequests.toPseudo, friendPseudo)),
          and(eq(friendRequests.fromPseudo, friendPseudo), eq(friendRequests.toPseudo, user.pseudo)),
        ),
      )
      .limit(1);

    if (pendingEither) {
      if (pendingEither.status === "pending") {
        if (pendingEither.fromPseudo === user.pseudo) {
          return Response.json({ error: `Demande d'ami déjà envoyée à ${friendPseudo}.` }, { status: 409 });
        }
        /* Demande inverse existante → accepter directement (amitié réciproque). */
        const now = new Date();
        await db
          .update(friendRequests)
          .set({ status: "accepted", respondedAt: now })
          .where(eq(friendRequests.id, pendingEither.id));
        await acceptFriendship(user.pseudo, friendPseudo);
        return Response.json({
          friend: { pseudo: friendPseudo, addedAt: now.toISOString() },
          acceptedIncoming: true,
        }, { status: 201 });
      }
      /* Demande précédente refusée/accepée → nouvelle tentative permise. */
      await db.delete(friendRequests).where(eq(friendRequests.id, pendingEither.id));
    }

    const [created] = await db
      .insert(friendRequests)
      .values({ fromPseudo: user.pseudo, toPseudo: friendPseudo, status: "pending" })
      .returning();

    return Response.json({
      request: {
        id: created.id,
        fromPseudo: created.fromPseudo,
        toPseudo: created.toPseudo,
        status: created.status,
        createdAt: created.createdAt.toISOString(),
      },
    }, { status: 201 });
  } catch {
    return Response.json({ error: "Impossible d'envoyer la demande d'ami." }, { status: 400 });
  }
}

/** Helper: create the bidirectional friendship rows. */
async function acceptFriendship(a: string, b: string) {
  const now = new Date();
  await db.insert(friends).values([
    { userPseudo: a, friendPseudo: b, createdAt: now },
    { userPseudo: b, friendPseudo: a, createdAt: now },
  ]);
}