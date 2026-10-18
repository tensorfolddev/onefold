// Epics are numbered within their product — Epic 1, Epic 2… — in the order they were made (their key numbers).
// ponytail: worked out on the fly (a scan of the product's tickets); keep a stored number if boards get very large.
import type { Db } from "../../data/db.ts";
import type { Ticket } from "../types.ts";

const keyNumber = (key: string) => Number(key.split("-").pop());

export const epicNumber = (db: Db, epic: Ticket) =>
  db.tickets.filter((t) => t.type === "epic" && t.productKey === epic.productKey && keyNumber(t.key) <= keyNumber(epic.key)).length;

export const epicLabel = (db: Db, epic: Ticket) => `Epic ${epicNumber(db, epic)}`;

/** A product's epics, Epic 1 first. */
export const epicsOf = (db: Db, productKey: string) =>
  db.tickets.filter((t) => t.type === "epic" && t.productKey === productKey).sort((a, b) => keyNumber(a.key) - keyNumber(b.key));
