// Test fixture: a sample company (TensorFold) for the automated tests. Never shipped to staging or production.
// Its dates were written against SEED_TODAY; `shiftTo` moves them, keeping the gaps between them.
import { daysBetween, addDays } from "../domain/clock.ts";
import * as seed from "../domain/seed.ts";
import { DB_VERSION, normalize, type Db } from "./db.ts";

const shiftDates = <T>(value: T, days: number): T =>
  days === 0 ? structuredClone(value)
    : JSON.parse(JSON.stringify(value).replace(/"(\d{4}-\d{2}-\d{2})(T[0-9:.]*Z?)?"/g, (_, d: string, t = "") => `"${addDays(d, days)}${t}"`));

export function demoDb(shiftTo: string = seed.SEED_TODAY): Db {
  const days = daysBetween(seed.SEED_TODAY, shiftTo);
  const raw: Db = {
    version: DB_VERSION,
    org: seed.org,
    invites: [],
    people: seed.people,
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
