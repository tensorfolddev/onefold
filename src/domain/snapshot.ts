// What one person's browser receives: the company as *they* may see it. The server keeps the full data and runs every
// change against it; this copy is only for showing screens (and the instant, local preview of a change).
import type { Db } from "../data/db.ts";
import { archivedProducts, visibleProducts } from "./permissions.ts";
import type { Person, Product, Ticket } from "./types.ts";

/** The company cut down to some of its products, and only what belongs to them. */
function onlyProducts(db: Db, keep: (p: Product) => boolean, keepTicket: (t: Ticket) => boolean = () => true): Db {
  const products = db.products.filter(keep);
  const keys = new Set(products.map((p) => p.key));
  const tickets = db.tickets.filter((t) => keys.has(t.productKey) && keepTicket(t));
  const ticketKeys = new Set(tickets.map((t) => t.key));
  const inProducts = <T extends { productKey: string }>(list: T[]) => list.filter((x) => keys.has(x.productKey));
  const onTickets = <T extends { ticketKey: string }>(list: T[]) => list.filter((x) => ticketKeys.has(x.ticketKey));
  // A notification about a product (or one of its tickets) that's left out goes too.
  const outside = new Set([...db.products, ...db.tickets].map((x) => x.key).filter((k) => !keys.has(k) && !ticketKeys.has(k)));
  return {
    ...db,
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
    notifications: db.notifications.filter((n) => !outside.has(n.target)),
  };
}

export function snapshotFor(db: Db, me: Person): Db {
  const admin = me.panel === "admin";
  // Their products, and the archived ones they may still open (never a developer: for them, archived is gone).
  const mine = new Set([...visibleProducts(me, db.products), ...archivedProducts(me, db.products)].map((p) => p.key));
  // A developer never sees an archived ticket (or its updates); admins and managers find them in product Settings.
  const scoped = onlyProducts(db, (p) => mine.has(p.key), (t) => me.panel !== "developer" || !t.archivedAt);
  return {
    ...scoped,
    // Invite links are secrets: only admins see pending invites, and nobody gets the token's hash.
    invites: admin ? db.invites.map((i) => ({ ...i, tokenHash: "" })) : [],
    // Everyone sees names and roles; only admins (and you) see email addresses.
    people: db.people.map((p) => (admin || p.id === me.id ? p : { ...p, email: "" })),
    notifications: scoped.notifications.filter((n) => n.personId === me.id),
  };
}

/** The company without its archived products and everything in them — what anyone's day's work is made of. */
export const withoutArchived = (db: Db): Db => onlyProducts(db, (p) => !p.archivedAt);
