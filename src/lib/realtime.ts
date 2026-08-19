/* Canal temps réel unique : le SSE (route /api/matches/[id]/stream) interroge
   la base toutes les 200 ms et détecte les changements du match — y compris
   ceux poussés par le stream Lichess (sync.ts). Aucun pub/sub externe requis :
   le broadcast fire-and-forget Supabase était peu fiable et ajoutait du
   superflu réseau. Neon reste la source de vérité. */
export function channelName(matchId: string): string {
  return `game-${matchId}`;
}

/** No-op documenté — conservé pour la compatibilité des appelants (routes,
    runner Lichess). Les changements sont propagés par le SSE qui lit la DB. */
export function broadcastMatchChange(_matchId: string, _payload: Record<string, unknown> = {}) {
  /* SSE uniquement : la base est interrogée toutes les 200 ms. */
}
