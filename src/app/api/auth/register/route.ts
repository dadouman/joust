import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { createSession, setSessionCookie } from "@/lib/auth";
import { hashPassword } from "@/lib/password";

export const dynamic = "force-dynamic";

const PSEUDO_RE = /^[\p{L}\p{N}_ -]{2,40}$/u;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { pseudo?: string; email?: string; password?: string };

    const pseudo = (body.pseudo ?? "").trim().replace(/\s+/g, " ");
    const email = (body.email ?? "").trim().toLowerCase();
    const password = body.password ?? "";

    if (!PSEUDO_RE.test(pseudo)) {
      return Response.json({ error: "Pseudo invalide (2 à 40 caractères, sans caractères spéciaux)." }, { status: 400 });
    }
    if (!EMAIL_RE.test(email)) {
      return Response.json({ error: "Email invalide." }, { status: 400 });
    }
    if (password.length < 8) {
      return Response.json({ error: "Mot de passe trop court (8 caractères minimum)." }, { status: 400 });
    }
    if (password.length > 128) {
      return Response.json({ error: "Mot de passe trop long." }, { status: 400 });
    }

    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    if (existing) {
      return Response.json({ error: "Un compte existe déjà avec cet email." }, { status: 409 });
    }

    const [existingPseudo] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.pseudo, pseudo))
      .limit(1);
    if (existingPseudo) {
      return Response.json({ error: "Ce pseudo est déjà pris." }, { status: 409 });
    }

    const passwordHash = await hashPassword(password);
    const [created] = await db
      .insert(users)
      .values({ pseudo, email, passwordHash })
      .returning();

    const token = await createSession(created.id);
    await setSessionCookie(token);

    return Response.json(
      { user: { id: created.id, pseudo: created.pseudo, email: created.email } },
      { status: 201 },
    );
  } catch {
    return Response.json({ error: "Inscription impossible." }, { status: 400 });
  }
}