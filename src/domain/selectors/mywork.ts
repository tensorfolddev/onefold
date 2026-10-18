// Selectors for My Work (the signed-in person's view). Pure functions over the live store data.
// Relative imports, so the server (the worker's daily brief) can use these too.
import { today } from "../clock.ts";
import { archivedKeys } from "../permissions.ts";
import { statusOf, toneOf as toneOfTicket } from "./product.ts";
import type { Db } from "../../data/db.ts";
import { shortDate } from "../status.ts";
import type { Ticket, Tone } from "../types.ts";

const DAY_MS = 86400000;
const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export interface WeekDay { iso: string; name: string; num: number; isToday: boolean; isWeekend: boolean }

/** Mon..Sun of the week containing `day` (today by default). UTC math so there is no timezone drift. */
export function weekOf(day = today()): WeekDay[] {
  const t = Date.parse(`${day}T00:00:00Z`);
  const start = t - ((new Date(t).getUTCDay() + 6) % 7) * DAY_MS;
  return DAY_NAMES.map((name, i) => {
    const iso = new Date(start + i * DAY_MS).toISOString().slice(0, 10);
    return { iso, name, num: Number(iso.slice(8)), isToday: iso === day, isWeekend: i >= 5 };
  });
}

export const weekLabel = (days: WeekDay[]) =>
  `${shortDate(days[0].iso)} – ${shortDate(days[6].iso)}, ${days[6].iso.slice(0, 4)}`;

export const requirementOf = (db: Db, t: Ticket) => db.requirements.find((r) => r.id === t.requirementId);

export const toneOf = (db: Db, t: Ticket): Tone => toneOfTicket(db, t);

export const isOverdue = (db: Db, t: Ticket) => !!t.due && t.due < today() && statusOf(db, t)?.category !== "done";

export type GroupId = "now" | "next" | "review" | "done";
export interface WorkGroup { id: GroupId; title: string; tone: Tone; tickets: Ticket[] }

const GROUPS: { id: GroupId; title: string; tone: Tone }[] = [
  { id: "now", title: "Now", tone: "working" },
  { id: "next", title: "Next", tone: "todo" },
  { id: "review", title: "In review", tone: "review" },
  { id: "done", title: "Done this week", tone: "done" },
];

function groupOf(db: Db, t: Ticket): GroupId | null {
  const s = statusOf(db, t);
  if (!s) return null;
  if (s.tone === "review") return "review";
  if (s.category === "in_progress") return "now"; // working + stuck
  if (s.category === "todo") return "next";
  if (s.category === "done") return "done";
  return null; // backlog / cancelled are not "my work"
}

/** NOW / NEXT / IN REVIEW / DONE for the current user, soonest due first. */
export function groupMyWork(db: Db, personId: string, tickets: Ticket[]): WorkGroup[] {
  const archived = archivedKeys(db.products);
  const mine = tickets.filter((t) => !!t.assigneeIds?.includes(personId) && !archived.has(t.productKey));
  return GROUPS.map((g) => ({
    ...g,
    tickets: mine.filter((t) => groupOf(db, t) === g.id).sort((a, b) => (a.due ?? "~").localeCompare(b.due ?? "~")),
  }));
}
