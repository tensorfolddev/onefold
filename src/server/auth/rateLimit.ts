// Limits on guessable endpoints (sign-in, sign-up, invite links): at most `limit` tries per key per window.
// ponytail: in memory — one web process per environment (design §6). With several web copies, move this into Postgres.
import { TooMany } from "../http.ts";

const hits = new Map<string, { count: number; until: number }>();
const MAX_KEYS = 50_000;

/** Counts a try for `key`; throws TooMany once it's over `limit` within `windowMs`. */
export function limit(key: string, max: number, windowMs: number) {
  const now = Date.now();
  const entry = hits.get(key);
  if (!entry || entry.until < now) {
    if (hits.size >= MAX_KEYS) for (const [k, e] of hits) if (e.until < now) hits.delete(k);
    hits.set(key, { count: 1, until: now + windowMs });
    return;
  }
  entry.count += 1;
  if (entry.count > max) throw new TooMany();
}

export const MINUTE = 60_000;
