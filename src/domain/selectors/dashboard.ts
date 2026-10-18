// Derived selectors for the home screens + Teams. Pure functions over the live store data.
import { categoryOf, donePct as donePctOf, isOpenTicket, statusOf } from "./product.ts";
import type { Db } from "../../data/db.ts";
import { archivedKeys } from "../permissions.ts";
import type { StatusCategory, Team, Ticket } from "../types.ts";

export { nextMilestone } from "./product.ts";

export const isBlocked = (db: Db, t: Ticket) => statusOf(db, t)?.tone === "stuck";
export const isOpen = isOpenTicket;

/** Share of a product's tickets that are done, cancelled excluded. null when there is nothing to measure. */
export const donePct = (db: Db, tickets: Ticket[], productKey: string) =>
  donePctOf(db, tickets.filter((t) => t.productKey === productKey));

export const lateMilestones = (db: Db, productKeys: string[]) =>
  db.milestones.filter((m) => m.lateDays > 0 && productKeys.includes(m.productKey));

export const membersOf = (db: Db, team: Team["id"]) => db.people.filter((p) => p.team === team && p.active);

/** Estimated hours of the open tasks and bugs someone owns — what planning compares with their capacity. */
export const bookedH = (db: Db, personId: string) => {
  const archived = archivedKeys(db.products);
  return db.tickets.filter((t) => !!t.assigneeIds?.includes(personId) && t.type !== "epic" && !archived.has(t.productKey) && isOpenTicket(db, t))
    .reduce((s, t) => s + t.estimateH, 0);
};

export function teamLoad(db: Db, team: Team["id"]) {
  const members = membersOf(db, team);
  const booked = members.reduce((s, p) => s + bookedH(db, p.id), 0);
  const capacity = members.reduce((s, p) => s + p.capacityH, 0);
  return { booked, capacity, pct: capacity ? Math.round((booked / capacity) * 100) : 0 };
}

/** Over capacity → red, nearly full → orange, else green. */
export const loadColor = (pct: number) =>
  pct > 100 ? "var(--color-stuck-red)" : pct >= 85 ? "var(--color-working_orange)" : "var(--color-done-green)";

export function countByCategory(db: Db, tickets: Ticket[]) {
  const counts: Record<StatusCategory, number> = { backlog: 0, todo: 0, in_progress: 0, done: 0, cancelled: 0 };
  tickets.forEach((t) => { counts[categoryOf(db, t)] += 1; });
  return counts;
}
