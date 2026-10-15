import type { Person, Product } from "./types.ts";

export type Action =
  | "product.view" | "product.edit" | "product.create" | "product.approveStage" | "product.requestStage"
  | "members.edit" | "ticket.create" | "ticket.edit" | "ticket.delete" | "statuses.edit" | "product.brand"
  | "doc.add" | "doc.addMeetingNotes" | "doc.delete" | "decision.add" | "milestone.edit"
  | "people.manage" | "teams.manage" | "org.manage";

export interface Ctx {
  product?: Product;
  person?: Person; // the person being acted on (members.edit)
}

const ADMIN_ONLY = new Set<Action>([
  "product.create", "product.edit", "product.approveStage", "people.manage", "teams.manage", "org.manage",
]);
const DEVELOPER_ON_PRODUCT = new Set<Action>([
  "product.view", "ticket.create", "ticket.edit", "ticket.delete", "statuses.edit", "doc.addMeetingNotes",
]);

export const isOnProduct = (personId: string, p: Product) =>
  p.pmId === personId || p.projectManagerId === personId || p.memberIds.includes(personId);

export const visibleProducts = (me: Person, products: Product[]) =>
  me.panel === "admin" ? products : products.filter((p) => isOnProduct(me.id, p));

/** The only place access rules live. The UI hides with it; store actions refuse with it. */
export function can(me: Person | undefined, action: Action, ctx: Ctx = {}): boolean {
  if (!me?.active || !me.panel) return false;
  if (me.panel === "admin") return true;
  if (ADMIN_ONLY.has(action)) return false;
  if (!ctx.product || !isOnProduct(me.id, ctx.product)) return false;
  if (me.panel === "developer") return DEVELOPER_ON_PRODUCT.has(action);
  if (action === "members.edit") return !ctx.person || ctx.person.panel === "developer";
  return true; // manager on their own product
}
