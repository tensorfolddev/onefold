// The one place 1Fold asks "what time is it?". Real time in the app; tests pin it with fixClock().
let fixed: string | null = null;

/** Local date, "2026-10-15". */
export const today = () => (fixed ? fixed.slice(0, 10) : new Date().toLocaleDateString("en-CA"));
/** This moment in UTC, to the second: "2026-10-15T04:41:07Z". Unambiguous everywhere; screens show it in local time. */
export function now() {
  if (fixed) return fixed;
  return `${new Date().toISOString().slice(0, 19)}Z`;
}
/** Tests only: freeze the clock at an ISO date-time (or pass null to use real time again). */
export const fixClock = (iso: string | null) => { fixed = iso; };

const DAY_MS = 86_400_000;
/** Whole days from a to b (ISO dates). */
export const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(`${b.slice(0, 10)}T00:00:00Z`) - Date.parse(`${a.slice(0, 10)}T00:00:00Z`)) / DAY_MS);
export const addDays = (iso: string, n: number) =>
  new Date(Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10) + iso.slice(10);
