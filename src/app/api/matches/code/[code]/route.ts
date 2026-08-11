import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { db } from "@/db";
import { matches } from "@/db/schema";
import { serializeMatch } from "@/lib/serialize";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ code: string }> };

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const { code } = await params;
  const normalized = code.trim().toUpperCase().slice(0, 8);

  const [match] = await db.select().from(matches).where(eq(matches.inviteCode, normalized)).limit(1);
  if (!match) {
    return Response.json({ error: "Aucune joust ne correspond à ce code." }, { status: 404 });
  }

  return Response.json({ match: serializeMatch(match) });
}
