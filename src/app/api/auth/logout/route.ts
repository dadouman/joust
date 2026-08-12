import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import { clearSessionCookie, deleteSessionByToken, SESSION_COOKIE } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(_request: NextRequest) {
  try {
    const store = await cookies();
    const token = store.get(SESSION_COOKIE)?.value;
    if (token) await deleteSessionByToken(token);
    await clearSessionCookie();
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: true });
  }
}