/* Shared time-control definitions — used by both client and server. */

export const TIME_CONTROLS = {
  bullet: { id: "bullet", label: "Bullet", minutes: 1, seconds: 60, increment: 0, tag: "1 min", hint: "Frappez vite" },
  blitz: { id: "blitz", label: "Blitz", minutes: 3, seconds: 180, increment: 2, tag: "3+2", hint: "Le classique" },
  rapid: { id: "rapid", label: "Rapide", minutes: 10, seconds: 600, increment: 5, tag: "10+5", hint: "Temps de réflexion" },
} as const;

export type TimeControlId = keyof typeof TIME_CONTROLS;

export const TIME_CONTROL_IDS = Object.keys(TIME_CONTROLS) as TimeControlId[];

export function isTimeControl(value: unknown): value is TimeControlId {
  return typeof value === "string" && value in TIME_CONTROLS;
}

export function tcInfo(value: string): (typeof TIME_CONTROLS)[TimeControlId] {
  return TIME_CONTROLS[isTimeControl(value) ? value : "blitz"];
}

/** Increment in seconds for a time control. */
export function tcIncrement(value: string): number {
  return tcInfo(value).increment;
}

/** 183 -> "3:03" ; 75 -> "1:15" */
export function formatClock(totalSeconds: number): string {
  const t = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(t / 3600);
  const minutes = Math.floor((t % 3600) / 60);
  const seconds = t % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}