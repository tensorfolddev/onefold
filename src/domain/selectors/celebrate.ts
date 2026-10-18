// What deserves a cheer after a change, comparing the company before and after it: tickets that just reached Done, and
// epics whose every ticket is now finished. The screens celebrate these (src/ui/celebrate.ts). Pure, so it's tested.
import type { Db } from "../../data/db.ts";
import type { Ticket } from "../types.ts";
import { statusOf } from "./product.ts";

export interface Finished { tickets: Ticket[]; epics: { epic: Ticket; count: number }[] }

const isDone = (db: Db, t: Ticket) => statusOf(db, t)?.category === "done";

/** How many tickets an epic has if every one is finished (done, or won't do) and at least one is done; else 0. */
function completed(db: Db, epicKey: string): number {
  const kids = db.tickets.filter((t) => t.epicKey === epicKey && t.type !== "epic");
  const closed = (t: Ticket) => ["done", "cancelled"].includes(statusOf(db, t)?.category ?? "");
  return kids.length && kids.every(closed) && kids.some((t) => isDone(db, t)) ? kids.length : 0;
}

export function finished(before: Db, after: Db): Finished {
  if (before === after) return { tickets: [], epics: [] };
  const was = new Map(before.tickets.map((t) => [t.key, t]));
  const moved = after.tickets.filter((t) => { const old = was.get(t.key); return old && (old.statusId !== t.statusId || old.epicKey !== t.epicKey); });
  const tickets = moved.filter((t) => t.type !== "epic" && !isDone(before, was.get(t.key)!) && isDone(after, t));
  // Only the epics those changes touched can have just completed.
  const touched = new Set(moved.flatMap((t) => [t.epicKey, was.get(t.key)?.epicKey]).filter((k): k is string => !!k));
  const epics = after.tickets.filter((e) => e.type === "epic" && touched.has(e.key) && !completed(before, e.key) && completed(after, e.key))
    .map((epic) => ({ epic, count: completed(after, epic.key) }));
  return { tickets, epics };
}

/** The words for it, and whether it's a big one (a whole epic). Null when there's nothing to cheer. */
export function cheer({ tickets, epics }: Finished): { message: string; big: boolean } | null {
  if (epics.length) {
    const { epic, count } = epics[0];
    const more = epics.length > 1 ? ` (and ${epics.length - 1} more epic${epics.length > 2 ? "s" : ""})` : "";
    const finishedAll = count === 1 ? "its only ticket is finished" : `all ${count} tickets finished`;
    return { message: `🏆 Epic complete: ${epic.title} — ${finishedAll}${more}. Amazing work!`, big: true };
  }
  if (tickets.length === 1) return { message: `🎉 ${tickets[0].key} is done — nice work!`, big: false };
  if (tickets.length) return { message: `🎉 ${tickets.length} tickets done — great going!`, big: false };
  return null;
}
