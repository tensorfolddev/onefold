import { today } from "../clock.ts";
import { can } from "../permissions.ts";
import type { DocKind, Person } from "../types.ts";
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
