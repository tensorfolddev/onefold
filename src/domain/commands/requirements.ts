// Requirements: written and kept by whoever manages the project (admins, its managers); developers read them and link
// their tickets (ticket.requirementId). A confirmed one keeps the version that was confirmed, so changing it later
// never loses what was agreed — it just goes back to being a draft until it's confirmed again.
import type { Db } from "../../data/db.ts";
import { now } from "../clock.ts";
import { nextRequirementCode, REQUIREMENT_PRIORITY, SOURCE_KINDS, statusOfRequirement } from "../selectors/requirements.ts";
import type { Person, Requirement, RequirementPriority, RequirementSource, RequirementStatus, SectionItem } from "../types.ts";
import { check, fail, id, newIdError, productOf, replace, requiredError, ValidationError } from "./shared.ts";

export interface RequirementInput { title: string; description?: string; criteria?: SectionItem[]; priority?: RequirementPriority; source?: RequirementSource }
/** A change: null clears the priority or the source (JSON keeps null; undefined would vanish on the way). */
export type RequirementPatch = Partial<Omit<RequirementInput, "priority" | "source">> & { priority?: RequirementPriority | null; source?: RequirementSource | null };

const MAX_TITLE = 200;
const MAX_DESCRIPTION = 20_000;
const MAX_CRITERIA = 50;
const MAX_REASON = 500;
const MAX_SOURCE_NOTE = 200;

const requirementOf = (db: Db, requirementId: string) => {
  const r = db.requirements.find((x) => x.id === requirementId);
  if (!r) throw new ValidationError("Requirement not found");
  return r;
};
const mayEdit = (db: Db, me: Person, r: Requirement) => check(me, "requirement.edit", { product: productOf(db, r.productKey) });

function titleOf(v: unknown): string {
  const title = typeof v === "string" ? v.trim() : "";
  fail(requiredError("Requirement", title));
  fail(title.length > MAX_TITLE ? `Keep the requirement under ${MAX_TITLE} characters` : null);
  return title;
}
function descriptionOf(v: unknown): string {
  if (typeof v !== "string") throw new ValidationError("A description is text");
  fail(v.length > MAX_DESCRIPTION ? "The description is too long" : null);
  return v.trim();
}
function criteriaOf(v: unknown): SectionItem[] {
  if (!Array.isArray(v)) throw new ValidationError("Acceptance criteria are a list");
  fail(v.length > MAX_CRITERIA ? `At most ${MAX_CRITERIA} acceptance criteria` : null);
  return v.map((i) => {
    const text = typeof i?.text === "string" ? i.text.trim() : "";
    if (!text || typeof i.id !== "string" || !i.id || i.id.length > 64) throw new ValidationError("An acceptance criterion can't be empty");
    return { id: i.id, text, done: !!i.done };
  });
}

function priorityOf(v: unknown): RequirementPriority {
  if (typeof v !== "string" || !Object.hasOwn(REQUIREMENT_PRIORITY, v)) throw new ValidationError("Pick Must, Should or Nice to have");
  return v as RequirementPriority;
}
function sourceOf(v: unknown): RequirementSource {
  const kind = (v as RequirementSource | null)?.kind;
  if (typeof kind !== "string" || !Object.hasOwn(SOURCE_KINDS, kind)) throw new ValidationError("Pick where it came from");
  const raw = (v as RequirementSource).note;
  const note = typeof raw === "string" ? raw.trim() : "";
  fail(note.length > MAX_SOURCE_NOTE ? "Keep the source note short" : null);
  return note ? { kind, note } : { kind };
}

/** The words of a requirement — what a confirmation is about. Ticking a criterion as met isn't a change to them. */
const wordsOf = (r: Requirement) => JSON.stringify([r.title, r.description ?? "", (r.criteria ?? []).map((c) => [c.id, c.text])]);
const save = (db: Db, r: Requirement): Db => ({ ...db, requirements: replace(db.requirements, (x) => x.id === r.id, () => r) });

export function addRequirement(db: Db, me: Person, productKey: string, input: RequirementInput, requirementId: string = id()): Db {
  check(me, "requirement.edit", { product: productOf(db, productKey) });
  fail(newIdError(requirementId, db.requirements.some((r) => r.id === requirementId)));
  const description = input.description === undefined ? "" : descriptionOf(input.description);
  const criteria = input.criteria === undefined ? [] : criteriaOf(input.criteria);
  const at = now();
  const r: Requirement = {
    id: requirementId, productKey, code: nextRequirementCode(db, productKey), title: titleOf(input.title),
    ...(description && { description }), ...(criteria.length > 0 && { criteria }),
    ...(input.priority !== undefined && { priority: priorityOf(input.priority) }), ...(input.source !== undefined && { source: sourceOf(input.source) }),
    status: "draft", rev: 1, createdAt: at, createdBy: me.id, updatedAt: at,
  };
  return { ...db, requirements: [...db.requirements, r] };
}

/** Changing its words bumps the revision; a confirmed one keeps its confirmed version and is a draft again. */
export function updateRequirement(db: Db, me: Person, requirementId: string, patch: RequirementPatch): Db {
  const cur = requirementOf(db, requirementId);
  mayEdit(db, me, cur);
  const next: Requirement = { ...cur };
  if (patch.title !== undefined) next.title = titleOf(patch.title);
  if (patch.description !== undefined) {
    const description = descriptionOf(patch.description);
    if (description) next.description = description;
    else delete next.description;
  }
  if (patch.criteria !== undefined) {
    const criteria = criteriaOf(patch.criteria);
    if (criteria.length) next.criteria = criteria;
    else delete next.criteria;
  }
  // Priority and source aren't its words: changing them doesn't undo a confirmation.
  if (patch.priority === null) delete next.priority;
  else if (patch.priority !== undefined) next.priority = priorityOf(patch.priority);
  if (patch.source === null) delete next.source;
  else if (patch.source !== undefined) next.source = sourceOf(patch.source);
  if (JSON.stringify(next) === JSON.stringify(cur)) return db;
  next.updatedAt = now();
  if (wordsOf(next) !== wordsOf(cur)) {
    next.rev = (cur.rev ?? 1) + 1;
    if (statusOfRequirement(cur) === "confirmed") next.status = "draft";
  }
  return save(db, next);
}

/** Confirmed — outside 1Fold (a call, an email): who recorded it, when, and the words as they were. */
export function markRequirementConfirmed(db: Db, me: Person, requirementId: string): Db {
  const cur = requirementOf(db, requirementId);
  mayEdit(db, me, cur);
  fail(statusOfRequirement(cur) === "dropped" ? `${cur.code} is dropped — restore it first` : null);
  const at = now();
  return save(db, {
    ...cur, status: "confirmed", updatedAt: at,
    confirmed: { rev: cur.rev ?? 1, title: cur.title, description: cur.description ?? "", criteria: cur.criteria ?? [], by: me.id, at },
  });
}

/** Out of scope — kept (struck through), with why, and back with Restore. */
export function dropRequirement(db: Db, me: Person, requirementId: string, reason: string): Db {
  const cur = requirementOf(db, requirementId);
  mayEdit(db, me, cur);
  const why = typeof reason === "string" ? reason.trim() : "";
  fail(requiredError("A reason", why));
  fail(why.length > MAX_REASON ? "Keep the reason short" : null);
  return save(db, { ...cur, status: "dropped", droppedReason: why, updatedAt: now() });
}

/** Back from dropped: confirmed again if nothing changed since it was confirmed, else a draft. */
export function restoreRequirement(db: Db, me: Person, requirementId: string): Db {
  const cur = requirementOf(db, requirementId);
  mayEdit(db, me, cur);
  fail(statusOfRequirement(cur) !== "dropped" ? `${cur.code} isn't dropped` : null);
  const status: RequirementStatus = cur.confirmed && cur.confirmed.rev === (cur.rev ?? 1) ? "confirmed" : "draft";
  const next: Requirement = { ...cur, status, updatedAt: now() };
  delete next.droppedReason;
  return save(db, next);
}

/** Only a mistake can go: never confirmed, and no ticket points at it. Anything else is dropped, so its record stays. */
export function deleteRequirement(db: Db, me: Person, requirementId: string): Db {
  const cur = requirementOf(db, requirementId);
  mayEdit(db, me, cur);
  fail(cur.confirmed ? `${cur.code} was confirmed — drop it instead, so its record stays` : null);
  fail(db.tickets.some((t) => t.requirementId === cur.id) ? `Tickets are linked to ${cur.code} — unlink them, or drop it instead` : null);
  return { ...db, requirements: db.requirements.filter((r) => r.id !== cur.id) };
}
