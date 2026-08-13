/* ── Game adapter registry ──
   Every game type registers its adapter here.
   The alarm machinery only ever talks to `getGame(match.gameType)`. */

import { chessAdapter } from "./chess";
import type { GameAdapter } from "./types";

const registry = new Map<string, GameAdapter>();

function register(adapter: GameAdapter) {
  registry.set(adapter.type, adapter);
}

/* Current game: chess (the only one shipped today).
   To add a new game, create src/lib/games/<name>/adapter.ts implementing
   GameAdapter, then register it here. No other file needs to change. */
register(chessAdapter);

export function getGame(type: string): GameAdapter {
  const adapter = registry.get(type);
  if (!adapter) {
    throw new Error(`Jeu inconnu : ${type}`);
  }
  return adapter;
}

export function knownGameTypes(): string[] {
  return [...registry.keys()];
}

export function isKnownGameType(value: unknown): value is string {
  return typeof value === "string" && registry.has(value);
}

export { chessAdapter };