// A project at a glance: how far along it is, what's late or due soon, the status mix, each epic's progress, what each
// person carries, and the latest activity. Epics are containers and archived tickets are out, so neither counts.
import type { Db } from "../../data/db.ts";
import { today } from "../clock.ts";
import type { Activity, Person, Status, Ticket } from "../types.ts";
import { epicsOf } from "./epics.ts";
import { categoryOf } from "./product.ts";

const SOON_DAYS = 14;
const ACTIVITY = 8;

export interface ProjectOverview {
  total: number; done: number; open: number; inProgress: number; pct: number;
  overdue: Ticket[]; dueSoon: Ticket[];
  byStatus: { status: Status; count: number }[];
  epics: { epic: Ticket; done: number; total: number }[];
  team: { person: Person; open: number; done: number }[];
  activity: Activity[];
}

const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const byDue = (a: Ticket, b: Ticket) => (a.due ?? "").localeCompare(b.due ?? "") || a.key.localeCompare(b.key);

export function projectOverview(db: Db, productKey: string, day = today()): ProjectOverview {
  const live = db.tickets.filter((t) => t.productKey === productKey && !t.archivedAt);
  const work = live.filter((t) => t.type !== "epic");
  const cat = new Map(work.map((t) => [t.key, categoryOf(db, t)]));
  const counted = work.filter((t) => cat.get(t.key) !== "cancelled");
  const isDone = (t: Ticket) => cat.get(t.key) === "done";
  const open = counted.filter((t) => !isDone(t));
  const done = counted.length - open.length;
  const soon = addDays(day, SOON_DAYS);

  const product = db.products.find((p) => p.key === productKey);
  const memberIds = product ? [...new Set([product.pmId, product.projectManagerId, ...product.memberIds])] : [];
  const keys = new Set(live.map((t) => t.key));

  return {
    total: counted.length, done, open: open.length, inProgress: open.filter((t) => cat.get(t.key) === "in_progress").length,
    pct: counted.length ? Math.round((done / counted.length) * 100) : 0,
    overdue: open.filter((t) => t.due && t.due < day).sort(byDue),
    dueSoon: open.filter((t) => t.due && t.due >= day && t.due <= soon).sort(byDue),
    byStatus: (db.statusesByProduct[productKey] ?? []).filter((s) => s.system !== "epic")
      .map((status) => ({ status, count: work.filter((t) => t.statusId === status.id).length })).filter((s) => s.count > 0),
    epics: epicsOf(db, productKey).filter((e) => !e.archivedAt).map((epic) => {
      const kids = counted.filter((t) => t.epicKey === epic.key);
      return { epic, done: kids.filter(isDone).length, total: kids.length };
    }),
    team: memberIds.map((pid) => db.people.find((p) => p.id === pid)).filter((p): p is Person => !!p && p.active)
      .map((person) => {
        const mine = counted.filter((t) => t.assigneeIds?.includes(person.id));
        return { person, open: mine.filter((t) => !isDone(t)).length, done: mine.filter(isDone).length };
      })
      .sort((x, y) => y.open - x.open || x.person.name.localeCompare(y.person.name)),
    activity: db.activity.filter((a) => keys.has(a.ticketKey)).sort((x, y) => y.at.localeCompare(x.at)).slice(0, ACTIVITY),
  };
}
