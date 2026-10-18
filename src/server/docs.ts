// Doc bodies (Markdown) and their versions, outside the company data every browser holds: a body is loaded when someone
// opens the doc and saved by autosave. Each save names the revision it started from; if someone saved in between, it's
// refused with theirs (409) — nothing is silently overwritten. Saves tell the company's open browsers ("org:doc:…").
// Who has a doc open is kept in memory and sent the same way ("org:presence:…").
import { and, desc, eq, sql } from "drizzle-orm";
import type { Db } from "../data/db.ts";
import { AccessError, createDoc as createDocCommand, touchDoc, ValidationError, type NewDoc } from "../domain/commands/index.ts";
import { templateFor } from "../domain/docTemplates.ts";
import { can } from "../domain/permissions.ts";
import { snapshotFor } from "../domain/snapshot.ts";
import type { Doc, Person } from "../domain/types.ts";
import { personFor, type SessionRow } from "./accounts.ts";
import { newId } from "./auth/secrets.ts";
import { applyComposed, mustLoad } from "./changes.ts";
import { saveCompany } from "./company/store.ts";
import { inScope, type Tx } from "./db/client.ts";
import * as s from "./db/schema.ts";
import { CHANNEL, journal, type Source } from "./journal.ts";

export const MAX_BODY_CHARS = 1_000_000;
const VERSION_WINDOW_MS = 10 * 60_000; // one version per author per ten minutes of editing
const TOUCH_EVERY_MS = 2 * 60_000; // "edited 2 min ago by…" in everyone's lists, without a refetch per keystroke
const PRESENCE_TTL_MS = 40_000;

export class DocConflict extends Error {
  latest: { body: string; rev: number; updatedBy?: string; updatedAt: string };
  constructor(latest: DocConflict["latest"]) {
    super("Someone saved a newer version while you were typing");
    this.latest = latest;
  }
}

const spaceOf = (db: Db, doc: Doc) => (doc.productKey ? db.products.find((p) => p.key === doc.productKey) : undefined);

/** The doc as this person may see it (their snapshot), or "not found" — never a hint that it exists. */
function visibleDoc(db: Db, me: Person, id: string): Doc {
  const doc = snapshotFor(db, me).docs.find((d) => d.id === id);
  if (!doc) throw new ValidationError("Document not found");
  return doc;
}

async function notify(tx: Tx, orgId: string, kind: "doc" | "presence", data: object) {
  await tx.execute(sql`select pg_notify(${CHANNEL}, ${`${orgId}:${kind}:${JSON.stringify(data)}`})`);
}

async function bodyRow(tx: Tx, orgId: string, docId: string) {
  const [row] = await tx.select().from(s.docBodies).where(and(eq(s.docBodies.orgId, orgId), eq(s.docBodies.docId, docId)));
  return row;
}

// ---------- create ----------

/** A new doc and its first body (a template's, or the Markdown given) in one change. */
export async function createDoc(who: SessionRow, input: NewDoc & { body?: string }, source: Source = "web"): Promise<{ version: number; id: string }> {
  const template = templateFor(input.template);
  const body = String(input.body ?? template?.body ?? "");
  if (body.length > MAX_BODY_CHARS) throw new ValidationError("That doc is too long");
  return inScope({ orgId: who.orgId, userId: who.userId, lock: true }, async (tx) => {
    const loaded = await mustLoad(tx, who);
    const me = personFor(loaded, who.userId);
    const { db, key: id } = createDocCommand(loaded.db, me, {
      productKey: input.productKey, parentId: input.parentId, title: input.title,
      icon: input.icon ?? template?.icon, template: template?.id, kind: template?.kind ?? input.kind,
    });
    const version = await saveCompany(tx, loaded, db);
    await tx.insert(s.docBodies).values({ orgId: who.orgId, docId: id, body, rev: 1, updatedBy: me.id });
    const doc = db.docs.find((d) => d.id === id)!;
    await tx.insert(s.docVersions).values({ orgId: who.orgId, id: newId("ver"), docId: id, rev: 1, title: doc.title, body, authorId: me.id });
    await journal(tx, { orgId: who.orgId, userId: who.userId, actorId: me.id, source },
      [{ command: "createDoc", args: { id, productKey: doc.productKey, title: doc.title, template: template?.id } }], version);
    return { version, id };
  });
}

// ---------- read ----------

export interface OpenDoc { doc: Doc; body: string; rev: number; presence: Presence[] }

export async function readDoc(who: SessionRow, id: string): Promise<OpenDoc> {
  return inScope({ orgId: who.orgId, userId: who.userId }, async (tx) => {
    const loaded = await mustLoad(tx, who);
    const doc = visibleDoc(loaded.db, personFor(loaded, who.userId), id);
    const row = await bodyRow(tx, who.orgId, id);
    return { doc, body: row?.body ?? "", rev: row?.rev ?? 0, presence: presenceOf(who.orgId, id) };
  });
}

// ---------- save ----------

/**
 * Saves a body that started from `baseRev`. Someone else saved since → DocConflict with theirs, unless `force` ("keep
 * mine"), which first keeps theirs as a version. ponytail: loads the company per save to check access; autosave
 * batches keystrokes (≥ 800 ms apart), so that's a few loads a minute per open editor.
 */
export async function saveBody(who: SessionRow, id: string, input: { body: string; baseRev: number; force?: boolean }): Promise<{ rev: number }> {
  if (typeof input.body !== "string" || input.body.length > MAX_BODY_CHARS) throw new ValidationError("That doc is too long");
  const saved = await inScope({ orgId: who.orgId, userId: who.userId }, async (tx) => {
    const loaded = await mustLoad(tx, who);
    const me = personFor(loaded, who.userId);
    const doc = visibleDoc(loaded.db, me, id);
    if (doc.archivedAt) throw new ValidationError(`${doc.title} is archived — restore it first`);
    if (!can(me, "doc.edit", { product: spaceOf(loaded.db, doc) })) throw new AccessError();
    // A doc made before bodies existed has none yet: start it at revision 0, then lock the row.
    await tx.insert(s.docBodies).values({ orgId: who.orgId, docId: id, body: "", rev: 0 }).onConflictDoNothing();
    const [cur] = (await tx.execute(sql`select body, rev, updated_by, updated_at from doc_bodies
      where org_id = ${who.orgId} and doc_id = ${id} for update`)).rows as { body: string; rev: number; updated_by: string | null; updated_at: string }[];
    if (cur.rev !== input.baseRev && !input.force) {
      throw new DocConflict({ body: cur.body, rev: cur.rev, updatedBy: cur.updated_by ?? undefined, updatedAt: String(cur.updated_at) });
    }
    if (cur.body === input.body) return { rev: cur.rev, doc, me, changed: false };
    const rev = cur.rev + 1;
    const now = new Date();
    if (input.force && cur.rev !== input.baseRev) await addVersion(tx, who.orgId, id, cur.rev, doc.title, cur.body, cur.updated_by, now, false);
    await tx.update(s.docBodies).set({ body: input.body, rev, updatedAt: now.toISOString(), updatedBy: me.id })
      .where(and(eq(s.docBodies.orgId, who.orgId), eq(s.docBodies.docId, id)));
    await addVersion(tx, who.orgId, id, rev, doc.title, input.body, me.id, now, true);
    await notify(tx, who.orgId, "doc", { docId: id, productKey: doc.productKey, rev, personId: me.id });
    return { rev, doc, me, changed: true };
  });
  if (saved.changed && Date.now() - Date.parse(saved.doc.updatedAt ?? "1970-01-01") > TOUCH_EVERY_MS) {
    const at = new Date().toISOString();
    await applyComposed(who, "web", (db, me) => ({ db: touchDoc(db, me, id, at, saved.rev), steps: [{ name: "touchDoc", args: [id, saved.rev] }] }));
  }
  return { rev: saved.rev };
}

/** Keeps a version: the author's latest one is updated if it's under ten minutes old (`coalesce`), else a new one. */
async function addVersion(tx: Tx, orgId: string, docId: string, rev: number, title: string, body: string, authorId: string | null, at: Date, coalesce: boolean) {
  if (coalesce) {
    const [last] = await tx.select().from(s.docVersions).where(and(eq(s.docVersions.orgId, orgId), eq(s.docVersions.docId, docId)))
      .orderBy(desc(s.docVersions.at)).limit(1);
    if (last && last.authorId === authorId && at.getTime() - Date.parse(last.at) < VERSION_WINDOW_MS) {
      await tx.update(s.docVersions).set({ rev, title, body, at: at.toISOString() }).where(and(eq(s.docVersions.orgId, orgId), eq(s.docVersions.id, last.id)));
      return;
    }
  }
  await tx.insert(s.docVersions).values({ orgId, id: newId("ver"), docId, rev, title, body, authorId, at: at.toISOString() });
}

// ---------- search ----------

export interface DocHit { id: string; title: string; icon?: string; productKey: string; snippet: string }

/** Titles and bodies of the docs this person may see. Each word matches as a prefix, so it works while typing. */
export async function searchDocs(who: SessionRow, q: string): Promise<DocHit[]> {
  const words = q.split(/\s+/).map((w) => w.replace(/[^\p{L}\p{N}]/gu, "")).filter(Boolean).slice(0, 8);
  if (!words.length) return [];
  return inScope({ orgId: who.orgId, userId: who.userId }, async (tx) => {
    const loaded = await mustLoad(tx, who);
    const docs = snapshotFor(loaded.db, personFor(loaded, who.userId)).docs.filter((d) => !d.archivedAt);
    const byId = new Map(docs.map((d) => [d.id, d]));
    const lower = words.map((w) => w.toLowerCase());
    const hits = new Map<string, DocHit>();
    for (const d of docs) {
      if (lower.every((w) => d.title.toLowerCase().includes(w))) hits.set(d.id, { id: d.id, title: d.title, icon: d.icon, productKey: d.productKey, snippet: "" });
    }
    const query = words.map((w) => `${w}:*`).join(" & ");
    const rows = (await tx.execute(sql`select doc_id, ts_headline('simple', body, to_tsquery('simple', ${query}),
        'StartSel=«,StopSel=»,MaxWords=18,MinWords=6,MaxFragments=1') as snippet
      from doc_bodies where org_id = ${who.orgId} and search @@ to_tsquery('simple', ${query}) limit 50`)).rows as { doc_id: string; snippet: string }[];
    for (const r of rows) {
      const d = byId.get(r.doc_id);
      if (!d) continue; // not theirs to see
      hits.set(d.id, { id: d.id, title: d.title, icon: d.icon, productKey: d.productKey, snippet: r.snippet.replace(/\s+/g, " ").trim() });
    }
    return [...hits.values()].slice(0, 20);
  });
}

// ---------- presence ----------

export interface Presence { personId: string; editing: boolean }
const holder = globalThis as unknown as { __onefoldPresence?: Map<string, Map<string, { editing: boolean; at: number }>> };
// ponytail: in this process's memory — right for one app server; move to Postgres or Redis when there are several.
const present = (holder.__onefoldPresence ??= new Map());

export function presenceOf(orgId: string, docId: string, now = Date.now()): Presence[] {
  const here = present.get(`${orgId}:${docId}`);
  if (!here) return [];
  for (const [personId, p] of here) if (now - p.at > PRESENCE_TTL_MS) here.delete(personId);
  return [...here].map(([personId, p]) => ({ personId, editing: p.editing }));
}

/** "I have this doc open (and am typing)" — or, with `open: false`, "I left". Tells everyone when that changes. */
export async function setPresence(who: SessionRow, id: string, state: { editing: boolean; open?: boolean }): Promise<Presence[]> {
  return inScope({ orgId: who.orgId, userId: who.userId }, async (tx) => {
    const loaded = await mustLoad(tx, who);
    const me = personFor(loaded, who.userId);
    const doc = visibleDoc(loaded.db, me, id);
    const key = `${who.orgId}:${id}`;
    const before = JSON.stringify(presenceOf(who.orgId, id));
    const here = present.get(key) ?? new Map();
    if (state.open === false) here.delete(me.id); else here.set(me.id, { editing: !!state.editing, at: Date.now() });
    present.set(key, here);
    const people = presenceOf(who.orgId, id);
    if (JSON.stringify(people) !== before) await notify(tx, who.orgId, "presence", { docId: id, productKey: doc.productKey, people });
    return people;
  });
}
