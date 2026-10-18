import { now } from "../clock.ts";
import { DEFINITION_OF_DONE, isStoredKind, sectionDef, TEMPLATE_NAME } from "../templates.ts";
import type { Activity, Attachment, Person, SectionValue, Ticket } from "../types.ts";
import type { Db } from "../../data/db.ts";
import { check, liveTicketOf, log, productOf, replace, ValidationError } from "./shared.ts";

// ---------- ticket template (sections, dependencies, images) ----------
const MAX_TEXT = 20_000;
const MAX_ITEMS = 100;
const MAX_DEPENDENCIES = 30;
const MAX_IMAGES = 20;

const editTicket = (db: Db, me: Person, key: string) => {
  const t = liveTicketOf(db, key, me);
  check(me, "ticket.edit", { product: productOf(db, t.productKey) });
  return t;
};
const withTicket = (db: Db, key: string, next: (t: Ticket) => Ticket, entry: Omit<Activity, "id" | "at" | "actorId" | "ticketKey">, me: Person): Db => ({
  ...db,
  tickets: replace(db.tickets, (t) => t.key === key, next),
  activity: log(db, me, { ticketKey: key, ...entry }),
});

/** Write one template section. The template is fixed: only its own section ids, in their own shape, are accepted. */
export function setSection(db: Db, me: Person, key: string, sectionId: string, value: SectionValue): Db {
  const t = editTicket(db, me, key);
  const def = sectionDef(t.type, sectionId);
  if (!def || !isStoredKind(def.kind)) throw new ValidationError(`“${sectionId}” isn't a section of the ${TEMPLATE_NAME[t.type]} template`);
  let clean: SectionValue;
  if (def.kind === "text") {
    if (typeof value !== "string") throw new ValidationError(`${def.title} is text`);
    clean = value.trim();
    if (clean.length > MAX_TEXT) throw new ValidationError(`${def.title} is too long`);
  } else {
    if (!Array.isArray(value)) throw new ValidationError(`${def.title} is a list`);
    if (value.length > MAX_ITEMS) throw new ValidationError(`${def.title} can have at most ${MAX_ITEMS} lines`);
    if (def.kind === "done") {
      // Fixed lines: keep only the ticks, the wording always comes from the template.
      clean = value.map((i) => {
        const line = DEFINITION_OF_DONE.find((d) => d.id === i.id);
        if (!line) throw new ValidationError("Definition of done lines are fixed");
        return { ...line, done: !!i.done };
      });
    } else {
      clean = value.map((i) => {
        const text = typeof i?.text === "string" ? i.text.trim() : "";
        if (!text || typeof i.id !== "string") throw new ValidationError(`Lines in ${def.title} can't be empty`);
        return def.kind === "checklist" ? { id: i.id, text, done: !!i.done } : { id: i.id, text };
      });
    }
  }
  const items = Array.isArray(clean) ? clean : [];
  const to = def.kind === "text" ? `${def.title} updated`
    : def.kind === "checklist" || def.kind === "done" ? `${def.title} · ${items.filter((i) => i.done).length}/${items.length} done`
    : `${def.title} · ${items.length} ${items.length === 1 ? "line" : "lines"}`;
  return withTicket(db, key, (x) => ({ ...x, sections: { ...x.sections, [sectionId]: clean } }), { field: "Section", to }, me);
}

/** "Blocked by": `depKey` must be finished first. Same rules for tickets and epics; loops are refused. */
export function addDependency(db: Db, me: Person, key: string, depKey: string): Db {
  const t = editTicket(db, me, key);
  const dep = db.tickets.find((x) => x.key === depKey);
  if (!dep) throw new ValidationError(`${depKey} doesn't exist`);
  check(me, "product.view", { product: productOf(db, dep.productKey) });
  if (depKey === key) throw new ValidationError("A ticket can't depend on itself");
  if (t.dependsOn?.includes(depKey)) throw new ValidationError(`${key} already depends on ${depKey}`);
  if ((t.dependsOn?.length ?? 0) >= MAX_DEPENDENCIES) throw new ValidationError(`At most ${MAX_DEPENDENCIES} dependencies`);
  // Would depKey (directly or through others) end up waiting on key?
  const seen = new Set<string>();
  const waitsOn = (k: string): boolean => {
    if (k === key) return true;
    if (seen.has(k)) return false;
    seen.add(k);
    return (db.tickets.find((x) => x.key === k)?.dependsOn ?? []).some(waitsOn);
  };
  if (waitsOn(depKey)) throw new ValidationError(`${depKey} already waits on ${key} — that would be a loop`);
  return withTicket(db, key, (x) => ({ ...x, dependsOn: [...(x.dependsOn ?? []), depKey] }), { field: "Dependency", to: `Blocked by ${depKey}` }, me);
}

export function removeDependency(db: Db, me: Person, key: string, depKey: string): Db {
  editTicket(db, me, key);
  return withTicket(db, key, (x) => ({ ...x, dependsOn: (x.dependsOn ?? []).filter((k) => k !== depKey) }), { field: "Dependency", from: `Blocked by ${depKey}`, to: "Removed" }, me);
}

export function addAttachment(db: Db, me: Person, key: string, file: Omit<Attachment, "addedBy" | "addedAt">): Db {
  const t = editTicket(db, me, key);
  if (!/^image\/(png|jpe?g|webp|gif)$/.test(file.type)) throw new ValidationError("Only PNG, JPG, WebP or GIF images");
  if ((t.attachments?.length ?? 0) >= MAX_IMAGES) throw new ValidationError(`At most ${MAX_IMAGES} images per ticket`);
  const att: Attachment = { ...file, name: file.name.trim() || "image", addedBy: me.id, addedAt: now() };
  return withTicket(db, key, (x) => ({ ...x, attachments: [...(x.attachments ?? []), att] }), { field: "Image", to: `Added ${att.name}` }, me);
}

export function removeAttachment(db: Db, me: Person, key: string, attachmentId: string): Db {
  const t = editTicket(db, me, key);
  const att = t.attachments?.find((a) => a.id === attachmentId);
  if (!att) return db;
  return withTicket(db, key, (x) => ({ ...x, attachments: (x.attachments ?? []).filter((a) => a.id !== attachmentId) }), { field: "Image", from: att.name, to: "Removed" }, me);
}
