import { z } from 'zod';

/** zod v4 error option: distinguishes a missing field from a wrongly-typed one. */
export const req = (label: string, kind: string) => ({
  error: (issue: { input?: unknown }) =>
    issue.input === undefined ? `${label} is required` : `${label} must be ${kind}`,
});

/** cuid-style identifiers used by every model. */
export const id = (label = 'id') =>
  z.string(req(label, 'a string')).regex(/^[A-Za-z0-9_-]{1,64}$/, { error: `Invalid ${label}` });

export const IdParams = z.object({ id: id('id') });
export type IdParams = z.infer<typeof IdParams>;

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Optional IANA time zone (e.g. "Asia/Kolkata") used for day-based stats. */
export const timeZone = z
  .string()
  .trim()
  .max(64)
  .refine(isValidTimeZone, { error: 'tz must be a valid IANA time zone, e.g. "America/New_York"' })
  .optional()
  .default('UTC');

/** Accepts ISO strings, epoch millis or Date objects. */
export const dateInput = (label: string) =>
  z.preprocess(
    (v) => (typeof v === 'string' || typeof v === 'number' ? new Date(v) : v),
    z.date({
      error: (issue: { input?: unknown }) =>
        issue.input === undefined ? `${label} is required` : `${label} must be a valid date`,
    }),
  );

/** Treat a missing body (e.g. a POST with no payload) as an empty object. */
export const optionalBody = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (v === undefined || v === null ? {} : v), schema);
