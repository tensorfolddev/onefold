import { now } from "../clock.ts";
import { formatHours, shortDate } from "../status.ts";
import { TEMPLATE_NAME } from "../templates.ts";
import type { Activity, Person, Priority, Ticket } from "../types.ts";
import { EPIC_COLORS, type Db } from "../../data/db.ts";
import { notify, textMentions } from "./notify.ts";
import { check, fail, id, liveTicketOf, log, positiveNumberError, productOf, replace, requiredError, ticketOf, ValidationError } from "./shared.ts";

// ---------- tickets ----------
type TicketFields = Partial<Pick<Ticket,
  "title" | "type" | "epicKey" | "assigneeIds" | "priority" | "due" | "estimateH" | "requirementId" | "statusId" | "color">>;
const CLEARABLE = ["epicKey", "due", "estimateH", "requirementId"] as const;
type Clearable = (typeof CLEARABLE)[number];
/** A ticket's changes. `null` clears a field: it survives the JSON trip to the server, where `undefined` is dropped. */
export type TicketPatch = Omit<TicketFields, Clearable> & { [K in Clearable]?: TicketFields[K] | null };
/** Older clients (and older steps) send one assignee; it means "just this person" (none = unassigned). */
type LegacyPatch = TicketPatch & { assigneeId?: string };
const MAX_ASSIGNEES = 20;

const EPIC_STAYS = "Epics stay in the Epic list — give them a colour instead of a status";
const EPIC_ONLY = "Only epics go in the Epic list";

/** New ticket. Default: bottom of Backlog. `statusId` + `position` add it to the top or bottom of a chosen list. */
export function createTicket(
  db: Db, me: Person, productKey: string, title: string,
  opts: { statusId?: string; position?: "top" | "bottom" } = {},
): { db: Db; key: string } {
  const product = productOf(db, productKey);
  check(me, "ticket.create", { product });
  fail(requiredError("Title", title));
  const lists = db.statusesByProduct[productKey] ?? [];
  const first = opts.statusId
    ? lists.find((s) => s.id === opts.statusId)
    : lists.find((s) => s.system === "backlog") ?? lists[0]; // new work starts in Backlog, never in Epic
  if (!first) throw new ValidationError(opts.statusId ? "That list isn't in this product" : `Product ${productKey} has no statuses`);
  const n = Math.max(0, ...db.tickets.filter((t) => t.productKey === productKey).map((t) => Number(t.key.split("-")[1]))) + 1;
  const key = `${productKey}-${n}`;
  const isEpic = first.system === "epic"; // adding in the Epic list makes an epic
  const ticket: Ticket = {
    key, productKey, title: title.trim(), type: isEpic ? "epic" : "task", statusId: first.id, priority: "medium",
    estimateH: 0, createdBy: me.id,
    ...(isEpic && { color: EPIC_COLORS[db.tickets.filter((t) => t.type === "epic").length % EPIC_COLORS.length] }),
  };
  // The order of db.tickets is the board order: top = in front of the list's first card, bottom = after its last.
  const inList = (t: Ticket) => t.productKey === productKey && t.statusId === first.id;
  const firstAt = db.tickets.findIndex(inList);
  const lastAt = db.tickets.findLastIndex(inList);
  const index = opts.position === "top" && firstAt >= 0 ? firstAt : lastAt >= 0 ? lastAt + 1 : db.tickets.length;
  const next = { ...db, tickets: [...db.tickets.slice(0, index), ticket, ...db.tickets.slice(index)] };
  return { db: { ...next, activity: log(next, me, { ticketKey: key, field: "Created", to: first.name }) }, key };
}

const PRIORITY_LABEL: Record<Priority, string> = { critical: "Critical", high: "High", medium: "Medium", low: "Low" };

export function updateTicket(db: Db, me: Person, key: string, given: LegacyPatch): Db {
  const { assigneeId: one, ...rest } = given;
  const sent: TicketPatch = "assigneeId" in given ? { ...rest, assigneeIds: one ? [one] : [] } : rest;
  // A cleared field (null) is there and undefined from here on; null anywhere else means nothing was sent for it.
  const patch = Object.fromEntries(Object.entries(sent).flatMap(([k, v]): [string, unknown][] =>
    v !== null ? [[k, v]] : (CLEARABLE as readonly string[]).includes(k) ? [[k, undefined]] : [])) as TicketFields;
  const cur = liveTicketOf(db, key, me);
  check(me, "ticket.edit", { product: productOf(db, cur.productKey) });
  if (patch.title !== undefined) fail(requiredError("Title", patch.title));
  fail(positiveNumberError("Estimate", patch.estimateH));
  if (patch.color !== undefined && !EPIC_COLORS.includes(patch.color)) throw new ValidationError("Pick a colour from the palette");
  if (patch.statusId !== undefined && patch.statusId !== cur.statusId) {
    const toEpicList = db.statusesByProduct[cur.productKey]?.find((s) => s.id === patch.statusId)?.system === "epic";
    if (cur.type === "epic") throw new ValidationError(EPIC_STAYS);
    if (toEpicList) throw new ValidationError(EPIC_ONLY);
  }
  if (patch.type !== undefined && patch.type !== cur.type && (cur.type === "epic" || patch.type === "epic")) {
    throw new ValidationError("A ticket can switch between task and bug; epics stay epics");
  }
  if (patch.epicKey !== undefined) {
    const epic = db.tickets.find((t) => t.key === patch.epicKey);
    if (cur.type === "epic") throw new ValidationError("Epics can't belong to another epic");
    if (epic?.type !== "epic" || epic.productKey !== cur.productKey) throw new ValidationError("Pick an epic from this product");
  }
  if (patch.assigneeIds !== undefined) {
    const ids = [...new Set(patch.assigneeIds)];
    if (ids.length > MAX_ASSIGNEES) throw new ValidationError(`At most ${MAX_ASSIGNEES} people on one ticket`);
    if (ids.some((pid) => !db.people.some((p) => p.id === pid && p.active))) throw new ValidationError("Pick people from your team");
    patch.assigneeIds = ids.length ? ids : undefined;
  }
  const name = (pid?: string) => db.people.find((p) => p.id === pid)?.name ?? "—";
  const names = (ids?: string[]) => ids?.length ? ids.map(name).join(", ") : "—";
  const status = (sid: string) => db.statusesByProduct[cur.productKey]?.find((s) => s.id === sid)?.name ?? "—";
  const req = (rid?: string) => db.requirements.find((r) => r.id === rid)?.code ?? "None";
  const describe: { [K in keyof TicketFields]-?: [Activity["field"], (v: Ticket[K]) => string] } = {
    title: ["Title", (v) => v ?? ""],
    type: ["Type", (v) => TEMPLATE_NAME[v]],
    epicKey: ["Epic", (v) => v ?? "None"],
    assigneeIds: ["Assignee", names],
    priority: ["Priority", (v) => PRIORITY_LABEL[v]],
    due: ["Due date", (v) => shortDate(v) || "—"],
    estimateH: ["Estimate", (v) => formatHours(v)],
    requirementId: ["Requirement", req],
    statusId: ["Status", status],
    color: ["Colour", () => "Changed"],
  };
  const clean = { ...patch, ...(patch.title !== undefined && { title: patch.title.trim() }) };
  let activity = db.activity;
  for (const field of Object.keys(clean) as (keyof TicketFields)[]) {
    const before = cur[field], after = clean[field];
    if (Array.isArray(before) || Array.isArray(after) ? String(before ?? []) === String(after ?? []) : before === after) continue;
    const [label, fmt] = describe[field] as [Activity["field"], (v: unknown) => string];
    const from = field === "color" ? undefined : fmt(cur[field]);
    activity = [...activity, { id: id(), ticketKey: key, at: now(), actorId: me.id, field: label, from, to: fmt(clean[field]) }];
  }
  const updated = { ...db, activity, tickets: replace(db.tickets, (t) => t.key === key, (t) => ({ ...t, ...clean })) };
  // Newly put on it (by someone else): they're told.
  const had = new Set(cur.assigneeIds ?? []);
  const added = clean.assigneeIds === undefined ? [] : clean.assigneeIds.filter((pid) => !had.has(pid) && pid !== me.id);
  const title = clean.title ?? cur.title;
  return notify(updated, me, added.map((pid) => ({ personId: pid, kind: "assigned" as const, text: `assigned you ${key} ${title}`, target: key })));
}

/**
 * Kanban drag and drop: set the status (logged like any edit) and place the ticket right before `beforeKey`,
 * or at the end of that status's tickets. The order of db.tickets is the board order.
 */
export function moveTicket(db: Db, me: Person, key: string, statusId: string, beforeKey?: string): Db {
  const cur = liveTicketOf(db, key, me);
  const sameColumn = cur.statusId === statusId;
  if (sameColumn) check(me, "ticket.edit", { product: productOf(db, cur.productKey) });
  const next = sameColumn ? db : updateTicket(db, me, key, { statusId }); // updateTicket checks + logs the status change
  const moved = next.tickets.find((t) => t.key === key)!;
  const rest = next.tickets.filter((t) => t.key !== key);
  let at = beforeKey ? rest.findIndex((t) => t.key === beforeKey) : -1;
  if (at < 0) {
    const lastInColumn = rest.findLastIndex((t) => t.productKey === cur.productKey && t.statusId === statusId);
    at = lastInColumn >= 0 ? lastInColumn + 1 : rest.length;
  }
  return { ...next, tickets: [...rest.slice(0, at), moved, ...rest.slice(at)] };
}

// ---------- archive ----------

/** The tickets a change covers: archiving (or restoring) an epic takes its tickets with it. */
const withEpicTickets = (db: Db, keys: string[]) => {
  const epics = new Set(keys.filter((k) => ticketOf(db, k).type === "epic"));
  return new Set([...keys, ...db.tickets.filter((t) => t.epicKey && epics.has(t.epicKey)).map((t) => t.key)]);
};

function setArchived(db: Db, me: Person, keys: string[], on: boolean): Db {
  for (const key of keys) check(me, "ticket.archive", { product: productOf(db, ticketOf(db, key).productKey) });
  const covered = withEpicTickets(db, keys);
  const changing = db.tickets.filter((t) => covered.has(t.key) && !!t.archivedAt !== on);
  if (!changing.length) throw new ValidationError(on ? "Already archived" : "Nothing archived to restore");
  const at = now();
  const keysChanging = new Set(changing.map((t) => t.key));
  return {
    ...db,
    tickets: db.tickets.map((t) => {
      if (!keysChanging.has(t.key)) return t;
      if (on) return { ...t, archivedAt: at, archivedBy: me.id };
      const back = { ...t }; // a copy, so the fields are gone, not merely undefined
      delete back.archivedAt;
      delete back.archivedBy;
      return back;
    }),
    activity: [...db.activity, ...changing.map((t): Activity => ({ id: id(), ticketKey: t.key, at, actorId: me.id, field: "Archive", to: on ? "Archived" : "Restored" }))],
  };
}

/** Archives tickets (an epic with its tickets): off every board and list, read-only, until restored. */
export const archiveTickets = (db: Db, me: Person, keys: string[]): Db => setArchived(db, me, keys, true);

/** Brings archived tickets back (an epic with its tickets) exactly as they were. */
export const restoreTickets = (db: Db, me: Person, keys: string[]): Db => setArchived(db, me, keys, false);

/** What an admin types to delete archived tickets for good. */
export const ticketDeletePhrase = (keys: string[]) => `Delete ${keys.length === 1 ? keys[0] : `${keys.length} tickets`}`;

/**
 * Deletes archived tickets for good: admins only, archived tickets only, and only once ticketDeletePhrase is typed —
 * checked here too, so no client can skip it. Anything else is archived instead, never deleted.
 */
export function deleteTickets(db: Db, me: Person, keys: string[], typed = ""): Db {
  for (const key of keys) {
    const t = ticketOf(db, key);
    check(me, "ticket.delete", { product: productOf(db, t.productKey) });
    if (!t.archivedAt) throw new ValidationError(`Archive ${key} before deleting it`);
  }
  if (typed.trim() !== ticketDeletePhrase(keys)) throw new ValidationError(`Type "${ticketDeletePhrase(keys)}" to delete for good`);
  const gone = new Set(keys);
  // Nothing may point at a deleted ticket: drop it from dependencies, unlink tickets from a deleted epic.
  const unlink = (t: Ticket): Ticket => {
    const dependsOn = t.dependsOn?.filter((k) => !gone.has(k));
    const lost = t.epicKey !== undefined && gone.has(t.epicKey);
    if (!lost && dependsOn?.length === t.dependsOn?.length) return t;
    return { ...t, dependsOn, ...(lost && { epicKey: undefined }) };
  };
  return {
    ...db,
    tickets: db.tickets.filter((t) => !gone.has(t.key)).map(unlink),
    activity: db.activity.filter((a) => !gone.has(a.ticketKey)),
    comments: db.comments.filter((c) => !gone.has(c.ticketKey)),
  };
}

/** An update on a ticket; whoever it @mentions (or @@mentions, urgently) is told. */
export function addComment(db: Db, me: Person, ticketKey: string, body: string): Db {
  const ticket = liveTicketOf(db, ticketKey, me);
  const product = productOf(db, ticket.productKey);
  check(me, "ticket.edit", { product });
  fail(requiredError("Update", body));
  const posted = { ...db, comments: [...db.comments, { id: id(), ticketKey, authorId: me.id, at: now(), body: body.trim() }] };
  return notify(posted, me, textMentions(db, me, product, body).map(({ person, urgent }) => ({
    personId: person.id, kind: "mention" as const, text: `mentioned you in ${ticketKey} ${ticket.title}`, target: ticketKey, urgent,
  })));
}
