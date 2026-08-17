/* ── Types Lichess API — vérifiés sur la documentation officielle (août 2026).
   Ne contient que les types nécessaires au flux « deux joueurs invités » :
   challenge direct → acceptation → stream de partie → coups → résultat. ── */

/** Réponse de `POST /api/challenge/{username}` */
export interface ChallengeResponse {
  id: string;
  url: string;
  status: "created" | "accepted" | "declined" | "canceled" | "offline";
  challenger?: { id: string; name: string };
  destUser?: { id: string; name: string };
  rated: boolean;
  variant: { key: string; name: string; short: string };
  timeControl: {
    type: "clock" | "correspondence" | "unlimited";
    limit?: number;
    increment?: number;
    show?: string;
  };
  color?: "white" | "black" | "random";
  finalColor?: "white" | "black" | "random";
  perf: { icon: string; name: string };
  /** Token d'acceptation lorsqu'on utilise `acceptByToken` (réservé aux challenges créés par notre backend). */
  token?: string;
}

/** Événements du flux global `GET /api/stream/event` */
export type StreamEvent =
  | { type: "challenge"; challenge: ChallengeResponse }
  | { type: "gameStart"; game: { id: string } }
  | { type: "gameFinish"; game: { id: string } }
  | { type: "challengeCanceled"; challenge: ChallengeResponse }
  | { type: "challengeDeclined"; challenge: ChallengeResponse };

/** Le premier message du stream de partie : état complet. */
export interface GameFullEvent {
  type: "gameFull";
  id: string;
  rated: boolean;
  variant: { key: string; name: string; short: string };
  clock: { initial: number; increment: number };
  speed: string;
  /** "white" si on joue blancs, "black" sinon — pour savoir notre orientation. */
  orientation: "white" | "black";
  /** Les deux joueurs. */
  players: {
    white: PlayerFull;
    black: PlayerFull;
  };
  /** FEN initiale. */
  initialFen: string;
  state: GameStateEvent;
}

export interface PlayerFull {
  id: string;
  name: string;
  title?: string;
  rating?: number;
  provisional?: boolean;
  /** -1 si abonné / abandonné / déconnecté (flag d'arbitre de la partie). */
  disconnected?: boolean;
  /** false une fois qu'on a joué son premier coup. */
  bot?: boolean;
  aiLevel?: number;
}

/** Message de mise à jour de l'état d'une partie (2e message et suivants du stream). */
export interface GameStateEvent {
  type: "gameState";
  /** FEN complète de la position. */
  fen: string;
  /** Coups en notation UCI séparés par des espaces. */
  moves: string;
  /** millisecondes |
   * 0 si partie terminée. */
  wtime: number;
  btime: number;
  winc: number;
  binc: number;
  /** created | started | aborted | mate | resign | stalemate | timeout |
   *  draw | outoftime | cheat | noStart | unknownFinish | variantEnd. */
  status: string;
  /** Gagnant : "white" | "black" | null. */
  winner?: "white" | "black";
}

/** Message du stream de partie : soit l'état complet initial, soit une mise à jour. */
export type BoardGameStreamEvent = GameFullEvent | GameStateEvent;

/** Métadonnées exportées via `GET /api/game/{id}` (partie terminée). */
export interface ExportedGame {
  id: string;
  rated: boolean;
  players?: {
    white: { user?: { id: string; name: string }; rating?: number };
    black: { user?: { id: string; name: string }; rating?: number };
  };
  winner?: "white" | "black";
  status: string;
  /** PGN complet (en-têtes + coups) */
  pgn?: string;
}

/** Erreur API normalisée. */
export class LichessApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: string,
  ) {
    super(message);
    this.name = "LichessApiError";
  }
}