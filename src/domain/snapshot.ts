// What one person's browser receives: the company as *they* may see it. The server keeps the full data and runs every
// change against it; this copy is only for showing screens (and the instant, local preview of a change).
import type { Db } from "../data/db.ts";
import { chatProduct, lineAsSeenBy, seesLine } from "./commands/chat.ts";
import { personalAccess } from "./docAccess.ts";
import { archivedProducts, can, visibleProducts } from "./permissions.ts";
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
    docs: db.docs.filter((d) => d.productKey === "" || keys.has(d.productKey)), // "" = the company's own docs
    docGroups: db.docGroups.filter((g) => g.productKey === "" || keys.has(g.productKey)),
    stageRequests: inProducts(db.stageRequests),
    asks: inProducts(db.asks),
    clientMessages: inProducts(db.clientMessages),
    chatReads: db.chatReads.filter((r) => keys.has(chatProduct(db, r.subject) ?? "")),
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
    // Client people: only those on their products; emails for admins and whoever manages a project they're on.
    clientPeople: db.clientPeople.flatMap((c) => {
      const on = scoped.products.filter((p) => p.clients?.some((x) => x.personId === c.id));
      if (!admin && !on.length) return [];
      return admin || on.some((p) => can(me, "client.people", { product: p })) ? [c] : [{ ...c, email: "" }];
    }),
    notifications: scoped.notifications.filter((n) => n.personId === me.id),
    // Chat lines as they see them: not the ones they deleted for themselves; a deleted one without its words; their own stars.
    clientMessages: scoped.clientMessages.filter((m) => seesLine(m, me.id)).map((m) => lineAsSeenBy(m, me.id)),
    ...vaultFor(db, me),
    // Archived docs: admins, in Settings. A personal page: only whoever it's shared with — and archived, only its owner.
    docs: scoped.docs.filter((d) => (d.ownerId
      ? personalAccess(db.docs, me, d) !== "none" && (!d.archivedAt || d.ownerId === me.id)
      : admin || !d.archivedAt)),
  };
}

/**
 * The vault, for one person: their own account in full (their private key, locked); everyone else's public key only —
 * to share with them — never another's locked keys, so nobody can even try to guess someone's master password; the
 * vaults they hold a key to or are invited into; and only the items they can open.
 */
function vaultFor(db: Db, me: Person): Pick<Db, "vaultAccounts" | "vaults" | "vaultItems"> {
  const hidden = { salt: "", iv: "", wrappedPrivateKey: "", recoverySalt: "", recoveryIv: "", recoveryWrappedPrivateKey: "" };
  const vaults = db.vaults.filter((v) => !!v.keys[me.id] || !!v.invited?.includes(me.id));
  const open = new Set(vaults.filter((v) => v.keys[me.id]).map((v) => v.id));
  return {
    vaultAccounts: Object.fromEntries(Object.entries(db.vaultAccounts).map(([pid, a]) => [pid, pid === me.id ? a : { ...a, ...hidden }])),
    vaults,
    vaultItems: db.vaultItems.filter((i) => open.has(i.vaultId)),
  };
}

/** The company without its archived products and everything in them — what anyone's day's work is made of. */
export const withoutArchived = (db: Db): Db => onlyProducts(db, (p) => !p.archivedAt);
