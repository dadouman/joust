/* Shared recurrence helpers — used by both client and server. */

export const WEEKDAYS = [
  { value: 1, short: "L", label: "Lundi" },
  { value: 2, short: "M", label: "Mardi" },
  { value: 3, short: "M", label: "Mercredi" },
  { value: 4, short: "J", label: "Jeudi" },
  { value: 5, short: "V", label: "Vendredi" },
  { value: 6, short: "S", label: "Samedi" },
  { value: 0, short: "D", label: "Dimanche" },
] as const;

const SHORT_LABEL: Record<number, string> = {
  0: "dim",
  1: "lun",
  2: "mar",
  3: "mer",
  4: "jeu",
  5: "ven",
  6: "sam",
};

/** "1,3,5" -> [1,3,5] */
export function parseDays(csv: string | null | undefined): number[] {
  if (!csv) return [];
  return csv
    .split(",")
    .map((d) => Number.parseInt(d, 10))
    .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
    .sort((a, b) => a - b);
}

/** [1,3,5] -> "1,3,5" */
export function formatDays(days: number[]): string {
  return [...new Set(days)]
    .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
    .sort((a, b) => a - b)
    .join(",");
}

/** "20:30" -> { hours: 20, minutes: 30 } */
export function parseTimeOfDay(value: string): { hours: number; minutes: number } {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return { hours: 20, minutes: 0 };
  const hours = Math.min(23, Math.max(0, Number.parseInt(match[1], 10)));
  const minutes = Math.min(59, Math.max(0, Number.parseInt(match[2], 10)));
  return { hours, minutes };
}

export function isValidTimeOfDay(value: unknown): value is string {
  return typeof value === "string" && /^\d{1,2}:\d{2}$/.test(value.trim());
}

/**
 * Next absolute occurrence of the alarm, computed in the caller's local timezone.
 * - No days selected  -> next time today, otherwise tomorrow (one-shot).
 * - Days selected     -> next matching weekday at that time, strictly in the future.
 */
export function computeNextOccurrence(timeOfDay: string, days: number[], from: Date = new Date()): Date {
  const { hours, minutes } = parseTimeOfDay(timeOfDay);

  const candidate = new Date(from);
  candidate.setSeconds(0, 0);
  candidate.setHours(hours, minutes, 0, 0);

  if (days.length === 0) {
    if (candidate.getTime() <= from.getTime()) candidate.setDate(candidate.getDate() + 1);
    return candidate;
  }

  for (let offset = 0; offset <= 7; offset += 1) {
    const probe = new Date(candidate);
    probe.setDate(candidate.getDate() + offset);
    if (days.includes(probe.getDay()) && probe.getTime() > from.getTime()) return probe;
  }

  // Fallback (should not happen)
  const fallback = new Date(candidate);
  fallback.setDate(fallback.getDate() + 7);
  return fallback;
}

/** Human summary: "Lun, mer, ven à 20:30" */
export function describeRecurrence(timeOfDay: string, days: number[]): string {
  if (days.length === 0) return `Une fois à ${timeOfDay}`;

  const isWeekdays = days.length === 5 && [1, 2, 3, 4, 5].every((d) => days.includes(d));
  if (isWeekdays) return `En semaine à ${timeOfDay}`;

  const isWeekend = days.length === 2 && days.includes(0) && days.includes(6);
  if (isWeekend) return `Le week-end à ${timeOfDay}`;

  const ordered = [1, 2, 3, 4, 5, 6, 0].filter((d) => days.includes(d));
  return `${ordered.map((d) => SHORT_LABEL[d]).join(", ")} à ${timeOfDay}`;
}
