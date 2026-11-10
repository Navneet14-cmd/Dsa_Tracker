export const DAY_MS = 24 * 60 * 60 * 1000;

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    // en-CA formats as YYYY-MM-DD
    f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
    formatters.set(tz, f);
  }
  return f;
}

/** Calendar day ("YYYY-MM-DD") of an instant in the given IANA time zone. */
export function dayKey(date: Date, tz = 'UTC'): string {
  return formatter(tz).format(date);
}

function keyToUtcMs(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

/** Whole calendar days from `from` to `to` (both "YYYY-MM-DD"). */
export function daysBetween(from: string, to: string): number {
  return Math.round((keyToUtcMs(to) - keyToUtcMs(from)) / DAY_MS);
}

export function addDaysToKey(key: string, days: number): string {
  return new Date(keyToUtcMs(key) + days * DAY_MS).toISOString().slice(0, 10);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}
