import { desc, ne } from "drizzle-orm";
import { db } from "@/db";
import { matchMoves, matches } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { serializeMatch } from "@/lib/serialize";

export const dynamic = "force-dynamic";

/** GET /api/matches/history — historique des parties terminées de l'utilisateur.
    Retourne un tableau de sessions (card) groupées par adversaire + récurrence.
    Chaque session expose win/loose/draw et la liste des parties (sub-cards). */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "Connecte-toi pour voir ton historique." }, { status: 401 });
  }

  const rows = await db
    .select()
    .from(matches)
    .where(ne(matches.status, "cancelled"))
    .orderBy(desc(matches.endedAt));

  /* Parties terminées auxquelles l'utilisateur a participé. */
  const mine = rows.filter(
    (m) =>
      (m.status === "completed" || m.result != null) &&
      (m.creatorName === user.pseudo || m.guestName === user.pseudo),
  );

  /* Récupère les coups de toutes ces parties en une seule requête. */
  const ids = new Set(mine.map((m) => m.id));
  const movesByMatch = new Map<string, { id: string; san: string; ply: number }[]>();
  if (ids.size > 0) {
    const allMoves = await db
      .select({
        id: matchMoves.id,
        matchId: matchMoves.matchId,
        san: matchMoves.san,
        ply: matchMoves.ply,
      })
      .from(matchMoves);
    for (const mv of allMoves) {
      if (!ids.has(mv.matchId)) continue;
      const arr = movesByMatch.get(mv.matchId) ?? [];
      arr.push({ id: mv.id, san: mv.san, ply: mv.ply });
      movesByMatch.set(mv.matchId, arr);
    }
  }

  /* Regroupe par (adversaire, récurrence, heure) : une « card » par session. */
  const groupKey = (m: (typeof matches.$inferSelect)) => {
    const opponent = m.creatorName === user.pseudo ? m.guestName : m.creatorName;
    return `${opponent}::${m.recurrenceDays}::${m.timeOfDay}`;
  };

  const sessions = new Map<string, (typeof matches.$inferSelect)[]>();
  for (const m of mine) {
    const k = groupKey(m);
    const arr = sessions.get(k) ?? [];
    arr.push(m);
    sessions.set(k, arr);
  }

  const sessionList = Array.from(sessions.entries()).map(([key, list]) => {
    const opponent = list[0].creatorName === user.pseudo ? list[0].guestName : list[0].creatorName;
    const wins = list.filter((m) => m.winnerName === user.pseudo).length;
    const losses = list.filter((m) => m.winnerName && m.winnerName !== user.pseudo).length;
    const draws = list.filter((m) => !m.winnerName).length;

    return {
      id: key,
      opponent,
      timeOfDay: list[0].timeOfDay,
      recurrenceDays: list[0].recurrenceDays,
      timeControl: list[0].timeControl,
      wins,
      losses,
      draws,
      matchCount: list.length,
      matches: list.map((m) => ({
        match: serializeMatch(m),
        moves: (movesByMatch.get(m.id) ?? []).sort((a, b) => a.ply - b.ply),
      })),
    };
  });

  const totalWins = mine.filter((m) => m.winnerName === user.pseudo).length;
  const totalLosses = mine.filter((m) => m.winnerName && m.winnerName !== user.pseudo).length;
  const totalDraws = mine.filter((m) => !m.winnerName).length;

  return Response.json({
    totalWins,
    totalLosses,
    totalDraws,
    totalMatches: mine.length,
    sessions: sessionList,
  });
}