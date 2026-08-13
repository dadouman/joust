/* ── Game abstraction contract ──
   The alarm / rendez-vous machinery (status transitions, ready check, push)
   must stay agnostic of the game being played behind the match.
   Each game type (chess today, connect-4, tic-tac-toe tomorrow…) registers
   an adapter implementing this interface. */

import { matches } from "@/db/schema";

export type MatchRow = typeof matches.$inferSelect;

/** Payload returned by a game action (e.g. a chess move). */
export interface GameActionResult {
  /** The updated match row (including gameState / legacy columns). */
  match: MatchRow;
  /** Optional game-specific payload echoed to the client (e.g. { move, fen }). */
  update?: Record<string, unknown>;
}

/** Contract every game must implement to plug into the alarm system. */
export interface GameAdapter {
  /** Discriminator matching `matches.gameType`. */
  readonly type: string;

  /** Human-friendly French label, e.g. "Échecs". */
  readonly label: string;

  /**
   * Called by the alarm machinery once both players are ready (or the
   * 60-second fallback elapsed). The game starts here: chess initialises
   * the clocks, a future game could shuffle tiles, deal cards, etc.
   */
  onGameStart(match: MatchRow, now: Date): Promise<MatchRow>;

  /**
   * Called on every tick while `status === "playing"`.
   * Game-specific timeouts / state advances live here (chess clock timeout).
   * Must return the match unchanged when nothing happens.
   */
  onTick(match: MatchRow, now: Date): Promise<MatchRow>;

  /**
   * Apply a player action (a chess move, a column drop, a card play…).
   * The route layer handles authentication; the adapter owns the rules.
   */
  applyAction(
    match: MatchRow,
    action: string,
    input: Record<string, unknown>,
    playerName: string,
  ): Promise<GameActionResult>;

  /** Game-specific serialized state merged into the API match payload. */
  serialize(match: MatchRow): Record<string, unknown>;
}