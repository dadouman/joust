import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { createSession, setSessionCookie } from "@/lib/auth";
import { verifyPassword } from "@/lib/password";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { email?: string; password?: string };

    const email = (body.email ?? "").trim().toLowerCase();
    const password = body.password ?? "";

    if (!email || !password) {
      return Response.json({ error: "Email et mot de passe requis." }, { status: 400 });
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    if (!user) {
      return Response.json({ error: "Email ou mot de passe incorrect." }, { status: 401 });
    }

    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) {
      return Response.json({ error: "Email ou mot de passe incorrect." }, { status: 401 });
    }

    const token = await createSession(user.id);
    await setSessionCookie(token);

    return Response.json({
      user: { id: user.id, pseudo: user.pseudo, email: user.email },
    });
  } catch {
    return Response.json({ error: "Connexion impossible." }, { status: 400 });
  }
}