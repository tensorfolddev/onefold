// Product-space selectors. Pure functions over the live store data (callers pass `db` from useDb()).
import type { Db } from "../../data/db.ts";
import type { Milestone, Status, StatusCategory, Ticket, Tone } from "../types.ts";

export const statusOf = (db: Db, t: Ticket): Status | undefined =>
  db.statusesByProduct[t.productKey]?.find((s) => s.id === t.statusId);
export const categoryOf = (db: Db, t: Ticket): StatusCategory => statusOf(db, t)?.category ?? "backlog";
export const toneOf = (db: Db, t: Ticket): Tone => statusOf(db, t)?.tone ?? "backlog";
export const isOpenTicket = (db: Db, t: Ticket) => !["done", "cancelled"].includes(categoryOf(db, t));

/** % of non-cancelled tickets that are done; null when there is nothing to measure. */
export function donePct(db: Db, tickets: Ticket[]): number | null {
  const active = tickets.filter((t) => categoryOf(db, t) !== "cancelled");
  if (!active.length) return null;
  return Math.round((active.filter((t) => categoryOf(db, t) === "done").length / active.length) * 100);
}

const COVERAGE_TONES: Tone[] = ["done", "review", "working", "stuck", "todo", "backlog"];

/** Requirement coverage from its linked tickets: battery segments + short label. */
export function coverage(db: Db, linked: Ticket[]): { segments: { tone: Tone; value: number }[]; label: string } {
  const active = linked.filter((t) => categoryOf(db, t) !== "cancelled");
  if (!linked.length) return { segments: [], label: "not planned yet" };
  if (!active.length) return { segments: [], label: "—" };
  const segments = COVERAGE_TONES.map((tone) => ({ tone, value: active.filter((t) => toneOf(db, t) === tone).length }));
  const done = active.filter((t) => categoryOf(db, t) === "done").length;
  const working = active.filter((t) => categoryOf(db, t) === "in_progress").length;
  if (done === active.length) return { segments, label: "done" };
  if (done + working === 0) return { segments, label: "—" };
  // ponytail: in-progress tickets count half — a heuristic until tickets carry their own % complete.
  return { segments, label: `${Math.round(((done + working / 2) / active.length) * 100)}%` };
}

export const productMilestones = (db: Db, key: string): Milestone[] =>
  db.milestones.filter((m) => m.productKey === key).sort((a, b) => a.due.localeCompare(b.due));

export const nextMilestone = (db: Db, key: string): Milestone | undefined =>
  productMilestones(db, key).find((m) => m.pct < 100);
