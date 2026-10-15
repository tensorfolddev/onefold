// The demo company. Its dates were written against SEED_TODAY; they're moved to `shiftTo` (normally the real today)
// so the demo always looks current — due dates, overdue tickets, activity "2h ago" all stay meaningful.
import { daysBetween, addDays } from "../domain/clock.ts";
import * as seed from "../domain/seed.ts";
import type { Credential } from "../domain/commands/org.ts";
import { DB_VERSION, normalize, type Db } from "./db.ts";

const shiftDates = <T>(value: T, days: number): T =>
  days === 0 ? structuredClone(value)
    : JSON.parse(JSON.stringify(value).replace(/"(\d{4}-\d{2}-\d{2})(T[0-9:.]*)?"/g, (_, d: string, t = "") => `"${addDays(d, days)}${t}"`));

/** Everyone in the demo shares one demo password; pass its hash in (hashing is async, building isn't). */
export function demoDb(credential: Credential = { hash: "", salt: "" }, shiftTo: string = seed.SEED_TODAY): Db {
  const days = daysBetween(seed.SEED_TODAY, shiftTo);
  const raw: Db = {
    version: DB_VERSION,
    org: seed.org,
    invites: [],
    people: seed.people.map((p) => ({ ...p, passwordHash: credential.hash, passwordSalt: credential.salt })),
    teams: seed.teams,
    jobTitles: seed.jobTitles,
    productGroups: seed.productGroups,
    products: seed.products,
    statusesByProduct: seed.statusesByProduct,
    tickets: seed.tickets,
    requirements: seed.requirements,
    decisions: seed.decisions,
    milestones: seed.milestones,
    docs: seed.docs,
    activity: seed.activity,
    comments: seed.comments,
    notifications: seed.notifications,
    stageRequests: seed.stageRequests,
  };
  return normalize(shiftDates(raw, days));
}
