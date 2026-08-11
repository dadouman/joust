import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { randomBytes } from "node:crypto";
import { db } from "@/db";
import { matches } from "@/db/schema";
import { formatDays, isValidTimeOfDay, parseDays } from "@/lib/recurrence";
import { serializeMatch } from "@/lib/serialize";
import { isTimeControl } from "@/lib/time-control";

export const dynamic = "force-dynamic";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I/O/0/1 ambiguity

function makeCode() {
  let out = "";
  for (let i = 0; i < 6; i += 1) out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return out;
}

async function uniqueCode() {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = makeCode();
    const [existing] = await db.select({ id: matches.id }).from(matches).where(eq(matches.inviteCode, code)).limit(1);
    if (!existing) return code;
  }
  return `${makeCode()}${Date.now() % 10}`;
}

function cleanName(value: unknown, fallback: string) {
  if (typeof value !== "string") return fallback;
  const name = value.trim().replace(/\s+/g, " ");
  return name.length >= 1 && name.length <= 80 ? name : fallback;
}

/* Re-export for backward compat with code/[code]/route.ts */
export { serializeMatch };

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;

    const scheduledAt = new Date(typeof body.scheduledAt === "string" ? body.scheduledAt : "");
    if (Number.isNaN(scheduledAt.getTime()) || scheduledAt.getTime() <= Date.now()) {
      return Response.json({ error: "Prochaine occurrence invalide ou passée." }, { status: 400 });
    }

    const timeOfDay = isValidTimeOfDay(body.timeOfDay) ? body.timeOfDay.trim() : "20:00";
    const recurrenceDays = formatDays(
      Array.isArray(body.recurrenceDays)
        ? (body.recurrenceDays as unknown[]).map((d) => Number(d))
        : parseDays(typeof body.recurrenceDays === "string" ? body.recurrenceDays : ""),
    );
    const timeControl = isTimeControl(body.timeControl) ? body.timeControl : "blitz";
    const creatorName = cleanName(body.creatorName, "Joueur");
    const timeZone =
      typeof body.timeZone === "string" && body.timeZone.length <= 80 ? body.timeZone : "Europe/Paris";

    const [createdMatch] = await db
      .insert(matches)
      .values({
        creatorName,
        creatorToken: randomBytes(24).toString("hex"),
        guestName: "",
        inviteCode: await uniqueCode(),
        scheduledAt,
        timeZone,
        timeOfDay,
        recurrenceDays,
        inviteStatus: "pending",
        timeControl,
        timeControlBy: "creator",
        timeControlConfirmed: false,
        status: "scheduled",
        whitePlayer: creatorName,
        blackPlayer: "",
      })
      .returning();

    return Response.json({ match: serializeMatch(createdMatch) }, { status: 201 });
  } catch {
    return Response.json({ error: "Impossible de créer la joust." }, { status: 400 });
  }
}
