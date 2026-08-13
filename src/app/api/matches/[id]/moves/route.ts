/* POST /api/matches/[id]/moves — generic game action endpoint.
   The chess rules (legality, clocks, result detection) live in the game
   adapter; this route only handles authentication, match guards and
   delegates to `getGame(match.gameType).applyAction`. */

import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { db } from "@/db";
import { matches } from "@/db/schema";
import { assertCanActAs } from "@/lib/auth";
import { getGame } from "@/lib/games";
import { broadcastMatchChange } from "@/lib/realtime";
import { notifyMatch } from "@/lib/push";
import { serializeMatch } from "@/lib/serialize";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;

  try {
    const body = (await request.json()) as {
      action?: string;
      from?: string;
      to?: string;
      promotion?: string;
      playerName?: string;
      token?: string;
    };
    const action = body.action ?? "move";
    const playerName = body.playerName?.trim();
    const token = body.token;

    if (!playerName) {
      return Response.json({ error: "Joueur requis." }, { status: 400 });
    }

    const [match] = await db.select().from(matches).where(eq(matches.id, id)).limit(1);
    if (!match) return Response.json({ error: "Rendez-vous introuvable." }, { status: 404 });

    /* Authenticate: session cookie must match the account pseudo, or legacy per-match token. */
    const actor = await assertCanActAs(match, playerName, token);
    if (!actor) {
      return Response.json({ error: "Connecte-toi pour jouer." }, { status: 401 });
    }

    /* Generic match guards (game-agnostic). */
    if (match.status === "completed") {
      return Response.json({ error: "Cette partie est déjà terminée." }, { status: 409 });
    }
    if (match.inviteStatus !== "accepted" || !match.timeControlConfirmed) {
      return Response.json({ error: "Les deux joueurs doivent valider la joust." }, { status: 409 });
    }
    if (match.status === "scheduled" && match.scheduledAt.getTime() > Date.now()) {
      return Response.json({ error: "La partie n'a pas encore commencé." }, { status: 409 });
    }

    /* Delegate the game rules to the registered adapter (chess today). */
    const input: Record<string, unknown> = { from: body.from, to: body.to, promotion: body.promotion };
    const adapter = getGame(match.gameType);

    try {
      const result = await adapter.applyAction(match, action, input, playerName);

      const serialized = serializeMatch(result.match);
      const update = result.update ?? {};

      /* Notifications for known chess outcomes. */
      if (update.result === "timeout") {
        notifyMatch(id, "⏱️ Temps écoulé !", `${update.winnerName} gagne — partie terminée.`);
      }
      if (update.status === "completed" && update.result && update.result !== "timeout") {
        notifyMatch(
          id,
          update.winnerName ? "♛ Échec et mat !" : "🤝 Partie nulle",
          update.winnerName
            ? `${update.winnerName} gagne (${update.result}).`
            : `Partie nulle (${update.result}).`,
        );
      }

      if (update.status) {
        broadcastMatchChange(id, {
          fen: update.fen,
          status: update.status,
          result: update.result,
          winnerName: update.winnerName,
        });
      }

      if (update.move) {
        return Response.json({ move: update.move, match: serialized });
      }
      if (update.error) {
        return Response.json({ error: String(update.error), match: serialized }, { status: 409 });
      }
      return Response.json({ match: serialized });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Coup invalide.";
      return Response.json({ error: message }, { status: 400 });
    }
  } catch {
    return Response.json({ error: "Impossible d’enregistrer le coup." }, { status: 400 });
  }
}