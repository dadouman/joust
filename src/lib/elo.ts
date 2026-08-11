/* Friendly Elo rating between two friends - review 3.3. */

export const K_FACTOR = 32;

export function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + 10 ** ((ratingB - ratingA) / 400));
}

export function newRatings(
  ratingA: number,
  ratingB: number,
  scoreA: number,
): { ratingA: number; ratingB: number } {
  const eA = expectedScore(ratingA, ratingB);
  const eB = 1 - eA;
  return {
    ratingA: Math.round(ratingA + K_FACTOR * (scoreA - eA)),
    ratingB: Math.round(ratingB + K_FACTOR * ((1 - scoreA) - eB)),
  };
}

/** Stable pair key for the two-player stats table */
export function pairKey(name1: string, name2: string): string {
  const [a, b] = [name1.trim(), name2.trim()].sort();
  return `${a}|${b}`.toLowerCase();
}