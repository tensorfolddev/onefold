// Held-up tickets: still waiting on something unfinished, or parked in a stuck list. The board shows them straining.
import type { Db } from "../../data/db.ts";
import type { Ticket } from "../types.ts";
import { isOpenTicket, toneOf } from "./product.ts";

/** Finished: done or won't do — an epic once every ticket in it is. */
const finished = (db: Db, t: Ticket) => {
  if (t.type !== "epic") return !isOpenTicket(db, t);
  const kids = db.tickets.filter((x) => x.epicKey === t.key);
  return kids.length > 0 && kids.every((x) => !isOpenTicket(db, x));
};

/** The tickets this one still waits on. */
export const openBlockers = (db: Db, t: Ticket): Ticket[] =>
  (t.dependsOn ?? []).map((k) => db.tickets.find((x) => x.key === k)).filter((x): x is Ticket => !!x && !finished(db, x));

/** Still open, and either waiting on something or in a stuck list. */
export const heldUp = (db: Db, t: Ticket) =>
  t.type !== "epic" && isOpenTicket(db, t) && (toneOf(db, t) === "stuck" || openBlockers(db, t).length > 0);
