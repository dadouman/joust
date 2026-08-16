import { and, asc, eq, ne, or } from "drizzle-orm";
import { db } from "@/db";
import { matches } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { serializeMatch } from "@/lib/serialize";

export const dynamic = "force-dynamic";

/** Liste tous les jousts actifs de l'utilisateur connecté, triés par
    proximité dans le temps (le plus proche d'abord). Un joust est « actif »
    s'il est programmé ou en cours — les terminés/annulés n'apparaissent pas. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "Connecte-toi pour voir tes jousts." }, { status: 401 });
  }

  const rows = await db
    .select()
    .from(matches)
    .where(
      and(
        or(eq(matches.creatorName, user.pseudo), eq(matches.guestName, user.pseudo)),
        ne(matches.status, "cancelled"),
      ),
    )
    .orderBy(asc(matches.scheduledAt));

  /* On garde uniquement les jousts actifs : programmés ou en cours.
     Un joust « declined » par un partenaire, ou terminé, n'a plus de card. */
  const active = rows.filter((m) => m.status === "scheduled" || m.status === "playing");

  return Response.json({ matches: active.map(serializeMatch) });
}