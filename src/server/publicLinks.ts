// Public links to pages in My docs. The owner turns one on (or off); anyone with /share/<token> then reads that page
// and the pages inside it — signed out, read-only, nothing else of the company. The token lives only in public_links:
// the owner asks the server for it. A link stops working the moment it's turned off, the page is archived or moved
// under another, or its owner leaves.
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { and, eq } from "drizzle-orm";
import { AccessError, setDocPublic, ValidationError, withSubpages } from "../domain/commands/index.ts";
import { canDoc } from "../domain/docAccess.ts";
import type { Doc } from "../domain/types.ts";
import { personFor, type SessionRow } from "./accounts.ts";
import { applyComposed, mustLoad } from "./changes.ts";
import { loadCompany } from "./company/store.ts";
import { database, inScope, type Tx } from "./db/client.ts";
import * as s from "./db/schema.ts";
import { fileAt, opensInBrowser } from "./files.ts";

const TOKEN = /^[A-Za-z0-9_-]{43}$/; // 32 random bytes, base64url
const FILE_ID = /^[A-Za-z0-9_-]{1,80}$/;

export const sharePath = (token: string) => `/share/${token}`;

/** The page, if it's the owner's to share and can have a link: a live top page in My docs. */
async function ownTopPage(tx: Tx, who: SessionRow, docId: string): Promise<Doc> {
  const loaded = await mustLoad(tx, who);
  const doc = loaded.db.docs.find((d) => d.id === docId);
  if (!doc || !canDoc(loaded.db.docs, personFor(loaded, who.userId), "doc.share", doc)) throw new AccessError();
  if (!doc.ownerId || doc.parentId) throw new ValidationError("Only a top page in My docs gets a public link");
  if (doc.archivedAt) throw new ValidationError(`${doc.title} is archived — restore it first`);
  return doc;
}

/** The page's public link (its path), for its owner; null when it has none. */
export async function publicLinkOf(who: SessionRow, docId: string): Promise<string | null> {
  return inScope({ orgId: who.orgId, userId: who.userId }, async (tx) => {
    await ownTopPage(tx, who, docId);
    const [row] = await tx.select({ token: s.publicLinks.token }).from(s.publicLinks)
      .where(and(eq(s.publicLinks.orgId, who.orgId), eq(s.publicLinks.docId, docId)));
    return row ? sharePath(row.token) : null;
  });
}

/** Turns the page's public link on (a new one, or the one it has) or off (it stops working at once). */
export async function setPublicLink(who: SessionRow, docId: string, on: boolean): Promise<string | null> {
  const path = await inScope({ orgId: who.orgId, userId: who.userId }, async (tx) => {
    const doc = await ownTopPage(tx, who, docId);
    const where = and(eq(s.publicLinks.orgId, who.orgId), eq(s.publicLinks.docId, docId));
    if (!on) { await tx.delete(s.publicLinks).where(where); return null; }
    await tx.insert(s.publicLinks).values({ token: randomBytes(32).toString("base64url"), orgId: who.orgId, docId, createdBy: doc.ownerId! })
      .onConflictDoNothing();
    const [row] = await tx.select({ token: s.publicLinks.token }).from(s.publicLinks).where(where);
    return sharePath(row.token);
  });
  // The page says it's public, for everyone it's shared with; the link itself already works (or already doesn't).
  await applyComposed(who, "web", (db, me) => ({ db: setDocPublic(db, me, docId, on), steps: [{ name: "setDocPublic", args: [docId, on] }] }));
  return path;
}

interface Link { orgId: string; docId: string }
interface Opened { root: Doc; docs: Doc[] }

/** The company and page a token is for (public_links has no row-level security: this is the one way in). */
async function linkOf(token: string): Promise<Link | null> {
  if (!TOKEN.test(token)) return null;
  const [link] = await database().select({ orgId: s.publicLinks.orgId, docId: s.publicLinks.docId }).from(s.publicLinks).where(eq(s.publicLinks.token, token));
  return link ?? null;
}

/** What a link opens, inside that company's scope: its live, public top page in My docs, whose owner is still here. */
async function open(tx: Tx, link: Link): Promise<Opened | null> {
  // ponytail: loads the company per view to check the page and its owner; the routes rate-limit views.
  const loaded = await loadCompany(tx, link.orgId);
  const root = loaded?.db.docs.find((d) => d.id === link.docId);
  if (!loaded || !root?.ownerId || !root.isPublic || root.parentId || root.archivedAt) return null;
  if (!loaded.db.people.find((p) => p.id === root.ownerId)?.active) return null;
  return { root, docs: loaded.db.docs };
}

/** The pages a link opens: its top page and every page under it that isn't archived (nor under an archived one). */
const liveTree = ({ root, docs }: Opened) => withSubpages(docs.filter((d) => !d.archivedAt), [root.id]);

export interface PublicPage {
  title: string; icon?: string; cover?: string; link?: string; body: string;
  crumbs: { id: string; title: string; icon?: string }[]; // from the top page down to (not including) this one
  pages: { id: string; title: string; icon?: string }[]; // the pages inside this one
}

/** A page a public link opens (its top page, or a page inside it), with its files pointed at the link's file route. */
export async function readPublicPage(token: string, pageId?: string): Promise<PublicPage | null> {
  const link = await linkOf(token);
  if (!link) return null;
  return inScope({ orgId: link.orgId }, async (tx) => {
    const opened = await open(tx, link);
    if (!opened) return null;
    const { root, docs } = opened;
    const page = pageId ? docs.find((d) => d.id === pageId) : root;
    if (!page || !liveTree(opened).has(page.id)) return null; // the top page, or a live page under it (as for files)
    const [b] = await tx.select({ body: s.docBodies.body }).from(s.docBodies).where(and(eq(s.docBodies.orgId, link.orgId), eq(s.docBodies.docId, page.id)));
    const crumbs: PublicPage["crumbs"] = [];
    for (let at = page; at.parentId;) {
      const up = docs.find((d) => d.id === at.parentId);
      if (!up) break;
      crumbs.unshift({ id: up.id, title: up.title, icon: up.icon });
      at = up;
    }
    const viaLink = (text: string) => text.replace(/\/api\/files\/([A-Za-z0-9_-]+)/g, `/api/share/${token}/files/$1`); // files, through this link
    return {
      title: page.title, icon: page.icon, cover: page.cover && viaLink(page.cover), link: page.link, crumbs,
      body: viaLink(b?.body ?? ""),
      pages: docs.filter((d) => d.parentId === page.id && !d.archivedAt).map((d) => ({ id: d.id, title: d.title, icon: d.icon })),
    };
  });
}

/** A file in a page a public link opens — only a file of that page, or of a page inside it. */
export async function readPublicFile(token: string, fileId: string): Promise<{ bytes: Buffer; type: string; name: string; download: boolean } | null> {
  const link = FILE_ID.test(fileId) ? await linkOf(token) : null;
  if (!link) return null;
  const found = await inScope({ orgId: link.orgId }, async (tx) => {
    const opened = await open(tx, link);
    if (!opened) return null;
    const [f] = await tx.select().from(s.docFiles).where(and(eq(s.docFiles.orgId, link.orgId), eq(s.docFiles.id, fileId)));
    return f && liveTree(opened).has(f.docId) ? { name: f.name, type: f.type } : null;
  });
  if (!found) return null;
  try {
    return { bytes: await readFile(/*turbopackIgnore: true*/ fileAt(link.orgId, fileId)), type: found.type, name: found.name, download: !opensInBrowser(found.type) };
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
}
