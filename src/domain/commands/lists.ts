import type { Person, Status, StatusCategory, Tone } from "../types.ts";
import type { Db } from "../../data/db.ts";
import { check, fail, id, productOf, replace, requiredError, ValidationError } from "./shared.ts";
import { updateTicket } from "./tickets.ts";

// ---------- lists (a product's statuses = its Kanban columns) ----------
export type StatusPatch = Partial<Pick<Status, "name" | "tone" | "category">>;

const listsOf = (db: Db, productKey: string) => db.statusesByProduct[productKey] ?? [];
const FIXED_LIST = "Epic and Backlog are fixed lists — they can't be renamed, moved or deleted";
const editableList = (db: Db, productKey: string, statusId: string) => {
  const list = listsOf(db, productKey).find((s) => s.id === statusId);
  if (!list) throw new ValidationError("List not found");
  if (list.system) throw new ValidationError(FIXED_LIST);
  return list;
};
const withLists = (db: Db, productKey: string, lists: Status[]): Db =>
  ({ ...db, statusesByProduct: { ...db.statusesByProduct, [productKey]: lists } });
const listNameError = (db: Db, productKey: string, name: string, exceptId?: string) =>
  requiredError("List name", name) ??
  (listsOf(db, productKey).some((s) => s.id !== exceptId && s.name.toLowerCase() === name.trim().toLowerCase())
    ? `There is already a list called ${name.trim()}` : null);

export function addStatus(db: Db, me: Person, productKey: string, input: { name: string; category?: StatusCategory; tone?: Tone }): Db {
  check(me, "statuses.edit", { product: productOf(db, productKey) });
  fail(listNameError(db, productKey, input.name));
  const status: Status = {
    id: `${productKey.toLowerCase()}-${id().slice(0, 8)}`, name: input.name.trim(),
    category: input.category ?? "in_progress", tone: input.tone ?? "working",
  };
  return withLists(db, productKey, [...listsOf(db, productKey), status]);
}

export function updateStatus(db: Db, me: Person, productKey: string, statusId: string, patch: StatusPatch): Db {
  check(me, "statuses.edit", { product: productOf(db, productKey) });
  editableList(db, productKey, statusId);
  if (patch.name !== undefined) fail(listNameError(db, productKey, patch.name, statusId));
  const clean = { ...patch, ...(patch.name !== undefined && { name: patch.name.trim() }) };
  return withLists(db, productKey, replace(listsOf(db, productKey), (s) => s.id === statusId, (s) => ({ ...s, ...clean })));
}

/** Put a list right before `beforeId` (or at the end) — never in front of the fixed Epic + Backlog lists. */
export function moveStatus(db: Db, me: Person, productKey: string, statusId: string, beforeId?: string): Db {
  check(me, "statuses.edit", { product: productOf(db, productKey) });
  const moving = editableList(db, productKey, statusId);
  const rest = listsOf(db, productKey).filter((s) => s.id !== statusId);
  const fixed = rest.filter((s) => s.system).length;
  const at = beforeId ? rest.findIndex((s) => s.id === beforeId) : -1;
  const index = at < 0 ? rest.length : Math.max(at, fixed);
  return withLists(db, productKey, [...rest.slice(0, index), moving, ...rest.slice(index)]);
}

/** Delete a list. Its tickets must go somewhere: `moveToId` is required when it has any. */
export function deleteStatus(db: Db, me: Person, productKey: string, statusId: string, moveToId?: string): Db {
  check(me, "statuses.edit", { product: productOf(db, productKey) });
  editableList(db, productKey, statusId);
  const lists = listsOf(db, productKey);
  const tickets = db.tickets.filter((t) => t.productKey === productKey && t.statusId === statusId);
  if (tickets.length && (!moveToId || moveToId === statusId || !lists.some((s) => s.id === moveToId))) {
    throw new ValidationError("Choose a list to move its tickets to");
  }
  const moved = tickets.reduce((acc, t) => updateTicket(acc, me, t.key, { statusId: moveToId! }), db);
  return withLists(moved, productKey, lists.filter((s) => s.id !== statusId));
}
