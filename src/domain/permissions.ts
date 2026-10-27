import type { Person, Product } from "./types.ts";

export type Action =
  | "product.view" | "product.edit" | "product.create" | "product.approveStage" | "product.requestStage"
  | "members.edit" | "ticket.create" | "ticket.edit" | "ticket.delete" | "statuses.edit" | "product.brand"
  | "doc.add" | "doc.addMeetingNotes" | "doc.delete" | "doc.create" | "doc.edit" | "doc.archive" | "decision.add" | "milestone.edit" | "ticket.archive"
  | "requirement.edit" | "requirement.archive" | "client.manage" | "client.people"
  | "product.archive" | "product.delete" | "product.group" | "groups.manage" | "members.view"
  | "people.manage" | "teams.manage" | "org.manage";

export interface Ctx {
  product?: Product;
  person?: Person; // the person being acted on (members.edit)
}

const ADMIN_ONLY = new Set<Action>([
  "product.create", "product.edit", "product.approveStage", "product.delete", "ticket.delete", "people.manage", "teams.manage", "org.manage",
  "doc.archive", "doc.delete", "requirement.archive",
]);
/** All that can happen to an archived product: looking at it, restoring it, or (an admin) deleting it for good. */
export const WHILE_ARCHIVED = new Set<Action>(["product.view", "product.archive", "product.delete", "members.view"]);
// A developer on a project does its everyday work: tickets (archiving too), requirements, and talking to its client
// (requests, chats, the weekly update). Who the client's people are — and their sign-in links — stays with managers.
const DEVELOPER_ON_PRODUCT = new Set<Action>([
  "product.view", "ticket.create", "ticket.edit", "ticket.archive", "statuses.edit", "doc.addMeetingNotes",
  "requirement.edit", "client.manage",
]);

export const isOnProduct = (personId: string, p: Product) =>
  p.pmId === personId || p.projectManagerId === personId || p.memberIds.includes(personId);

const mayOpen = (me: Person, p: Product) => me.panel === "admin" || isOnProduct(me.id, p);

/** The products someone works with — every list of products. Archived ones are never in it. */
export const visibleProducts = (me: Person, products: Product[]) => products.filter((p) => !p.archivedAt && mayOpen(me, p));

/** The keys of archived products: their tickets are nobody's work (My Work, load, the brief, MCP lists). */
export const archivedKeys = (products: Product[]) => new Set(products.filter((p) => p.archivedAt).map((p) => p.key));

/** Archived products someone may still open: all of them for admins, their own for managers, none for developers. */
export const archivedProducts = (me: Person, products: Product[]) =>
  me.panel === "developer" ? [] : products.filter((p) => p.archivedAt && mayOpen(me, p));

/** The only place access rules live. The UI hides with it; store actions refuse with it. */
export function can(me: Person | undefined, action: Action, ctx: Ctx = {}): boolean {
  if (!me?.active || !me.panel) return false;
  if (ctx.product?.archivedAt && (me.panel === "developer" || !WHILE_ARCHIVED.has(action))) return false;
  if (me.panel === "admin") return true;
  if (ADMIN_ONLY.has(action)) return false;
  // Docs: anyone who can see the space writes in it — the company's for everyone, a project's for the people on it.
  if (action === "doc.create" || action === "doc.edit") return !ctx.product || isOnProduct(me.id, ctx.product);
  // Company-wide, for managers: the project groups, and the list of everyone.
  if (action === "groups.manage" || (action === "members.view" && !ctx.product)) return me.panel === "manager";
  if (!ctx.product || !isOnProduct(me.id, ctx.product)) return false;
  if (me.panel === "developer") return DEVELOPER_ON_PRODUCT.has(action);
  if (action === "members.edit") return !ctx.person || ctx.person.panel === "developer";
  return true; // manager on their own product
}
