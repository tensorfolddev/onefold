// What one person's browser receives: the company as *they* may see it. The server keeps the full data and runs every
// change against it; this copy is only for showing screens (and the instant, local preview of a change).
import type { Db } from "../data/db.ts";
import { visibleProducts } from "./permissions.ts";
import type { Person } from "./types.ts";

export function snapshotFor(db: Db, me: Person): Db {
  const admin = me.panel === "admin";
  const products = visibleProducts(me, db.products);
  const keys = new Set(products.map((p) => p.key));
  // A developer never sees an archived ticket (or its updates); admins and managers find them in product Settings.
  const tickets = db.tickets.filter((t) => keys.has(t.productKey) && (me.panel !== "developer" || !t.archivedAt));
  const ticketKeys = new Set(tickets.map((t) => t.key));
  const inProducts = <T extends { productKey: string }>(list: T[]) => list.filter((x) => keys.has(x.productKey));
  const onTickets = <T extends { ticketKey: string }>(list: T[]) => list.filter((x) => ticketKeys.has(x.ticketKey));

  return {
    ...db,
    // Invite links are secrets: only admins see pending invites, and nobody gets the token's hash.
    invites: admin ? db.invites.map((i) => ({ ...i, tokenHash: "" })) : [],
    // Everyone sees names and roles; only admins (and you) see email addresses.
    people: db.people.map((p) => (admin || p.id === me.id ? p : { ...p, email: "" })),
    products,
    statusesByProduct: Object.fromEntries(Object.entries(db.statusesByProduct).filter(([key]) => keys.has(key))),
    tickets,
    requirements: inProducts(db.requirements),
    decisions: inProducts(db.decisions),
    milestones: inProducts(db.milestones),
    docs: inProducts(db.docs),
    stageRequests: inProducts(db.stageRequests),
    activity: onTickets(db.activity),
    comments: onTickets(db.comments),
    notifications: db.notifications.filter((n) => n.personId === me.id && !(n.target.includes("-") && db.tickets.some((t) => t.key === n.target) && !ticketKeys.has(n.target))),
  };
}
