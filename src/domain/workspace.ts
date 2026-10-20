// Workspaces: the company's (its products, docs, people) and each person's own (their personal products and My docs).
// Screens show one at a time — in your own, nothing of the company's. Commands still run on everything you can see.
import type { Db } from "../data/db.ts";
import { onlyProducts } from "./snapshot.ts";
import type { Doc, Product } from "./types.ts";

export type Workspace = "company" | "personal";

const productIn = (p: Product): Workspace => (p.ownerId ? "personal" : "company");

/** One workspace's slice of what you can see. The bell keeps every notification of yours, whichever you're in. */
export function workspaceView(db: Db, ws: Workspace): Db {
  const scoped = onlyProducts(db, (p) => productIn(p) === ws);
  // A company page has no product and no owner; a personal one has an owner (My docs).
  const docIn = (d: Pick<Doc, "ownerId" | "productKey">) => (ws === "personal" ? !!d.ownerId || d.productKey !== "" : !d.ownerId);
  return {
    ...scoped,
    docs: scoped.docs.filter(docIn),
    docGroups: scoped.docGroups.filter((g) => ws === "company" || g.productKey !== ""),
    notifications: db.notifications,
  };
}

const COMPANY_PAGES = new Set(["people", "teams", "settings"]);
const COMPANY_APPS = new Set(["team-bot", "email"]);

/**
 * The workspace a page belongs to ("/products/AP/tickets" → AP's, "/docs/mine" → yours), or null for a page of either
 * ("/products", Home). Opening a link into the other workspace takes you there.
 */
export function workspaceOfPath(db: Db, rel: string): Workspace | null {
  const [, a, b, c, d] = rel.split("/");
  const ofProduct = (key: string | undefined) => {
    const p = db.products.find((x) => x.key === key);
    return p ? productIn(p) : null;
  };
  const ofDoc = (id: string | undefined) => {
    const doc = db.docs.find((x) => x.id === id);
    return !doc ? null : doc.ownerId ? "personal" : doc.productKey ? ofProduct(doc.productKey) : "company";
  };
  if (a === "products" && b) return c === "docs" && d ? ofDoc(d) ?? ofProduct(b) : ofProduct(b);
  if (a === "t" && b) return ofProduct(db.tickets.find((t) => t.key === decodeURIComponent(b))?.productKey);
  if (a === "docs") return b === "mine" ? "personal" : b ? ofDoc(b) : "company";
  if (a === "d" && b) return ofDoc(b);
  if (a === "integrations" && COMPANY_APPS.has(b)) return "company";
  return COMPANY_PAGES.has(a) ? "company" : null;
}
