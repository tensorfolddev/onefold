// Who may see and change a doc. A personal page (My docs) is its owner's: private until they share it — with some
// people (to read, or to write too) or with everyone at the company — and nobody's role reaches it otherwise, an
// admin's included. A personal page's subpages share with their top page. Every other page follows its space.
import { can } from "./permissions.ts";
import type { Doc, Person, Product } from "./types.ts";

export type DocAction = "doc.view" | "doc.edit" | "doc.archive" | "doc.delete" | "doc.share";
export type PersonalAccess = "own" | "edit" | "view" | "none";
const MAX_DEPTH = 64;

/** The top page a doc sits under (itself at the top level): where a personal page's sharing is set. */
export function rootOf(docs: Doc[], doc: Doc): Doc {
  let at = doc;
  for (let i = 0; at.parentId && i < MAX_DEPTH; i += 1) {
    const up = docs.find((d) => d.id === at.parentId);
    if (!up) break;
    at = up;
  }
  return at;
}

/** How far someone reaches into a personal page. */
export function personalAccess(docs: Doc[], me: Person, doc: Doc): PersonalAccess {
  if (!me.active || !me.panel) return "none";
  if (doc.ownerId === me.id) return "own";
  const root = rootOf(docs, doc);
  const share = root.sharedWith?.find((s) => s.personId === me.id);
  if (share?.edit || root.companyAccess === "edit") return "edit";
  if (share || root.companyAccess === "view") return "view";
  return "none";
}

/** Whether someone may do this to a doc. `product`: the project it's in (none for the company's space or My docs). */
export function canDoc(docs: Doc[], me: Person | undefined, action: DocAction, doc: Doc, product?: Product): boolean {
  if (!me) return false;
  if (doc.ownerId) {
    const reach = personalAccess(docs, me, doc);
    if (reach === "own") return true;
    if (action === "doc.view") return reach !== "none";
    if (action === "doc.edit") return reach === "edit";
    return false; // archiving, deleting and sharing a personal page are its owner's alone
  }
  if (action === "doc.share") return false; // a company or project page is shared by its space
  if (action === "doc.view") return !product || can(me, "product.view", { product });
  return can(me, action, { product });
}
