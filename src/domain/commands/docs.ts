import { now, today } from "../clock.ts";
import { can, isOnProduct } from "../permissions.ts";
import type { Doc, DocKind, Person } from "../types.ts";
import type { Db } from "../../data/db.ts";
import { check, fail, id, productOf, replace, requiredError, ValidationError } from "./shared.ts";

// ---------- docs, decisions, milestones ----------
export function addDoc(db: Db, me: Person, productKey: string, input: { kind: DocKind; title: string }): Db {
  const product = productOf(db, productKey);
  check(me, input.kind === "Meeting notes" && !can(me, "doc.add", { product }) ? "doc.addMeetingNotes" : "doc.add", { product });
  fail(requiredError("Title", input.title));
  return { ...db, docs: [...db.docs, { id: id(), productKey, kind: input.kind, title: input.title.trim(), updated: today(), authorId: me.id }] };
}

export function deleteDoc(db: Db, me: Person, docId: string): Db {
  const doc = db.docs.find((d) => d.id === docId);
  if (!doc) throw new ValidationError("Document not found");
  check(me, "doc.delete", { product: productOf(db, doc.productKey) });
  return { ...db, docs: db.docs.filter((d) => d.id !== docId) };
}

export function addDecision(db: Db, me: Person, productKey: string, input: { title: string; why: string }): Db {
  check(me, "decision.add", { product: productOf(db, productKey) });
  fail(requiredError("Decision", input.title));
  fail(requiredError("Why", input.why));
  return { ...db, decisions: [...db.decisions, { id: id(), productKey, title: input.title.trim(), why: input.why.trim(), byId: me.id, date: today() }] };
}

export function upsertMilestone(db: Db, me: Person, productKey: string, input: { id?: string; name: string; due: string; pct: number }): Db {
  check(me, "milestone.edit", { product: productOf(db, productKey) });
  fail(requiredError("Name", input.name));
  fail(requiredError("Due date", input.due));
  if (!(input.pct >= 0 && input.pct <= 100)) throw new ValidationError("Progress must be between 0 and 100");
  const fields = { name: input.name.trim(), due: input.due, pct: Math.round(input.pct) };
  if (input.id) return { ...db, milestones: replace(db.milestones, (m) => m.id === input.id, (m) => ({ ...m, ...fields })) };
  return { ...db, milestones: [...db.milestones, { id: id(), productKey, lateDays: 0, ...fields }] };
}

// ---------- pages: the company's space and each project's, nested; only admins archive and delete ----------

const MAX_TITLE = 200;

const docOf = (db: Db, docId: string): Doc => {
  const doc = db.docs.find((d) => d.id === docId);
  if (!doc) throw new ValidationError("Document not found");
  return doc;
};
/** The project a doc belongs to, or undefined for the company's own space. */
const spaceOf = (db: Db, doc: Pick<Doc, "productKey">) => (doc.productKey ? productOf(db, doc.productKey) : undefined);
const liveDocOf = (db: Db, docId: string): Doc => {
  const doc = docOf(db, docId);
  if (doc.archivedAt) throw new ValidationError(`${doc.title} is archived — restore it first`);
  return doc;
};
const titleOf = (title: string) => {
  fail(requiredError("Title", title));
  if (title.trim().length > MAX_TITLE) throw new ValidationError(`Keep the title under ${MAX_TITLE} characters`);
  return title.trim();
};
const iconOf = (icon: string) => {
  if ([...icon].length > 8) throw new ValidationError("An icon is one emoji");
  return icon;
};

/** These pages and every page under them. ponytail: repeated scans; fine for hundreds of docs, index by parent past that. */
export function withSubpages(docs: Doc[], rootIds: string[]): Set<string> {
  const ids = new Set(rootIds);
  for (let grew = true; grew;) {
    grew = false;
    for (const d of docs) if (d.parentId && ids.has(d.parentId) && !ids.has(d.id)) { ids.add(d.id); grew = true; }
  }
  return ids;
}

export interface NewDoc { productKey?: string; parentId?: string; groupId?: string; title: string; icon?: string; template?: string; kind?: DocKind }

/** A new page at the end of its space (or of its parent's pages). Returns its id as `key`. */
export function createDoc(db: Db, me: Person, input: NewDoc): { db: Db; key: string } {
  const productKey = input.productKey ?? "";
  check(me, "doc.create", { product: spaceOf(db, { productKey }) });
  if (input.parentId && liveDocOf(db, input.parentId).productKey !== productKey) throw new ValidationError("A page sits in its parent's space");
  const at = now();
  const doc: Doc = {
    id: id(), productKey, title: titleOf(input.title), kind: input.kind ?? "Brief", authorId: me.id,
    createdAt: at, updated: at.slice(0, 10), updatedAt: at, updatedBy: me.id, rev: 1,
    ...(input.parentId && { parentId: input.parentId }),
    ...(!input.parentId && input.groupId && db.docGroups.some((g) => g.id === input.groupId && g.productKey === productKey) && { groupId: input.groupId }),
    ...(input.icon && { icon: iconOf(input.icon) }),
    ...(input.template && { template: input.template }),
  };
  return { db: { ...db, docs: [...db.docs, doc] }, key: doc.id };
}

export interface DocPatch { title?: string; icon?: string | null; cover?: string | null }

export function updateDoc(db: Db, me: Person, docId: string, patch: DocPatch): Db {
  const doc = liveDocOf(db, docId);
  check(me, "doc.edit", { product: spaceOf(db, doc) });
  const next: Doc = { ...doc };
  if (patch.title !== undefined) next.title = titleOf(patch.title);
  if (patch.icon === null) delete next.icon; else if (patch.icon !== undefined) next.icon = iconOf(patch.icon);
  if (patch.cover === null) delete next.cover; else if (patch.cover !== undefined) next.cover = patch.cover.slice(0, 40);
  return { ...db, docs: replace(db.docs, (d) => d.id === docId, () => next) };
}

/** Moves a page (with its subpages) under another page of the same space, or to the top; before `beforeId` or last. */
export function moveDoc(db: Db, me: Person, docId: string, to: { parentId?: string | null; beforeId?: string }): Db {
  const doc = liveDocOf(db, docId);
  check(me, "doc.edit", { product: spaceOf(db, doc) });
  const parentId = to.parentId === undefined ? doc.parentId : to.parentId ?? undefined;
  if (parentId) {
    if (liveDocOf(db, parentId).productKey !== doc.productKey) throw new ValidationError("Pages move within their own space");
    if (withSubpages(db.docs, [docId]).has(parentId)) throw new ValidationError("A page can't go inside itself");
  }
  const moved: Doc = { ...doc };
  if (parentId) { moved.parentId = parentId; delete moved.groupId; } else delete moved.parentId;
  const rest = db.docs.filter((d) => d.id !== docId);
  const at = to.beforeId ? rest.findIndex((d) => d.id === to.beforeId) : -1;
  return { ...db, docs: at < 0 ? [...rest, moved] : [...rest.slice(0, at), moved, ...rest.slice(at)] };
}

/** Archives pages with everything under them: gone from every list, read-only, until an admin restores them. */
export function archiveDocs(db: Db, me: Person, docIds: string[]): Db {
  for (const docId of docIds) check(me, "doc.archive", { product: spaceOf(db, liveDocOf(db, docId)) });
  const ids = withSubpages(db.docs, docIds);
  const at = now();
  return { ...db, docs: db.docs.map((d) => (ids.has(d.id) && !d.archivedAt ? { ...d, archivedAt: at, archivedBy: me.id } : d)) };
}

/** Brings pages back with the subpages archived together with them. A page whose parent is still archived goes to the top. */
export function restoreDocs(db: Db, me: Person, docIds: string[]): Db {
  const back = new Map<string, string>(); // id → the archivedAt it shared with its root
  for (const docId of docIds) {
    const root = docOf(db, docId);
    check(me, "doc.archive", { product: spaceOf(db, root) });
    if (!root.archivedAt) continue;
    for (const id of withSubpages(db.docs, [docId])) back.set(id, root.archivedAt);
  }
  const restoring = new Set([...back].filter(([id, at]) => docOf(db, id).archivedAt === at).map(([id]) => id));
  return {
    ...db,
    docs: db.docs.map((d) => {
      if (!restoring.has(d.id)) return d;
      const out = { ...d };
      delete out.archivedAt;
      delete out.archivedBy;
      const parent = d.parentId ? db.docs.find((p) => p.id === d.parentId) : undefined;
      if (parent?.archivedAt && !restoring.has(parent.id)) delete out.parentId;
      return out;
    }),
  };
}

/** What an admin types to delete archived pages for good. */
export const docDeletePhrase = (titles: string[]) => `Delete ${titles.length === 1 ? titles[0] : `${titles.length} docs`}`;

/** Deletes archived pages and their subpages for good: admins only, archived only, and only with the phrase typed. */
export function deleteDocs(db: Db, me: Person, docIds: string[], typed = ""): Db {
  const roots = docIds.map((docId) => docOf(db, docId));
  for (const doc of roots) {
    check(me, "doc.delete", { product: spaceOf(db, doc) });
    if (!doc.archivedAt) throw new ValidationError(`Archive ${doc.title} before deleting it`);
  }
  const phrase = docDeletePhrase(roots.map((d) => d.title));
  if (typed.trim() !== phrase) throw new ValidationError(`Type "${phrase}" to delete for good`);
  const gone = withSubpages(db.docs, docIds);
  return { ...db, docs: db.docs.filter((d) => !gone.has(d.id)) };
}

/** Server only: a body save's "edited at / by", throttled by the caller. */
export function touchDoc(db: Db, me: Person, docId: string, at: string, rev: number): Db {
  const doc = docOf(db, docId);
  check(me, "doc.edit", { product: spaceOf(db, doc) });
  return { ...db, docs: replace(db.docs, (d) => d.id === docId, (d) => ({ ...d, updatedAt: at, updatedBy: me.id, rev, updated: at.slice(0, 10) })) };
}

/** Server only: tells the people newly mentioned in a doc — if they can see it, and never you. */
export function notifyDocMentions(db: Db, me: Person, docId: string, personIds: string[]): Db {
  const doc = docOf(db, docId);
  const product = spaceOf(db, doc);
  const at = now();
  const told = [...new Set(personIds)]
    .map((pid) => db.people.find((p) => p.id === pid))
    .filter((p): p is Person => !!p && p.id !== me.id && p.active && !!p.panel && (!product || p.panel === "admin" || isOnProduct(p.id, product)));
  if (!told.length) return db;
  return {
    ...db,
    notifications: [
      ...told.map((p) => ({ id: id(), personId: p.id, kind: "mention" as const, actorId: me.id, text: `mentioned you in ${doc.title}`, target: `/d/${doc.id}`, at, read: false })),
      ...db.notifications,
    ],
  };
}

// ---------- groups of pages in a space's sidebar (anyone who writes in the space manages them) ----------

const groupOf = (db: Db, groupId: string) => {
  const g = db.docGroups.find((x) => x.id === groupId);
  if (!g) throw new ValidationError("Group not found");
  return g;
};
const groupName = (db: Db, productKey: string, name: string, exceptId?: string) => {
  fail(requiredError("Group name", name));
  const n = name.trim();
  if (n.length > 60) throw new ValidationError("Keep the group name under 60 characters");
  if (db.docGroups.some((g) => g.productKey === productKey && g.id !== exceptId && g.name.toLowerCase() === n.toLowerCase())) {
    throw new ValidationError("There's already a group with that name");
  }
  return n;
};

/** A new group in a space. The caller passes the id, so the browser and the server name it the same. */
export function addDocGroup(db: Db, me: Person, productKey: string, name: string, groupId = `dg-${id().slice(0, 8)}`): Db {
  check(me, "doc.edit", { product: spaceOf(db, { productKey }) });
  return { ...db, docGroups: [...db.docGroups, { id: groupId, productKey, name: groupName(db, productKey, name) }] };
}

export function renameDocGroup(db: Db, me: Person, groupId: string, name: string): Db {
  const g = groupOf(db, groupId);
  check(me, "doc.edit", { product: spaceOf(db, g) });
  return { ...db, docGroups: replace(db.docGroups, (x) => x.id === groupId, (x) => ({ ...x, name: groupName(db, g.productKey, name, groupId) })) };
}

/** Deleting a group never deletes pages: they go back to the space's ungrouped pages. */
export function deleteDocGroup(db: Db, me: Person, groupId: string): Db {
  const g = groupOf(db, groupId);
  check(me, "doc.edit", { product: spaceOf(db, g) });
  return {
    ...db,
    docGroups: db.docGroups.filter((x) => x.id !== groupId),
    docs: db.docs.map((d) => {
      if (d.groupId !== groupId) return d;
      const out = { ...d };
      delete out.groupId;
      return out;
    }),
  };
}

/** Puts a page (with its subpages) in a group of its space — at the top level — or takes it out (null). */
export function setDocGroup(db: Db, me: Person, docId: string, groupId: string | null): Db {
  const doc = liveDocOf(db, docId);
  check(me, "doc.edit", { product: spaceOf(db, doc) });
  if (groupId && groupOf(db, groupId).productKey !== doc.productKey) throw new ValidationError("That group is in another space");
  return {
    ...db,
    docs: replace(db.docs, (d) => d.id === docId, (d) => {
      const out = { ...d };
      delete out.groupId;
      delete out.parentId;
      if (groupId) out.groupId = groupId;
      return out;
    }),
  };
}
