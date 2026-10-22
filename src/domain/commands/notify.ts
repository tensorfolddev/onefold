// Notifications: who a mention can reach, the notices themselves, and marking them read. A mention is "@Full Name";
// "@@Full Name" is an urgent one (it's also sent on WhatsApp, server side). Nobody is ever told about their own doing.
import { now } from "../clock.ts";
import { isOnProduct } from "../permissions.ts";
import type { Notification, Person, Product } from "../types.ts";
import type { Db } from "../../data/db.ts";
import { id } from "./shared.ts";

/** The people a notice about this project can reach: active, with access, on it (or an admin) — and not you. */
export const reachable = (db: Db, me: Person, product?: Product): Person[] =>
  db.people.filter((p) => p.id !== me.id && p.active && !!p.panel && (!product || p.panel === "admin" || isOnProduct(p.id, product)));

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Whom a plain-text body (a ticket update) @mentions, by full name; @@ makes it urgent. */
export function textMentions(db: Db, me: Person, product: Product | undefined, body: string): { person: Person; urgent: boolean }[] {
  return reachable(db, me, product).flatMap((person) => {
    const marks = [...body.matchAll(new RegExp(`(?:^|[^@\\w])(@@?)${escape(person.name)}(?![\\w])`, "giu"))].map((m) => m[1]);
    return marks.length ? [{ person, urgent: marks.includes("@@") }] : [];
  });
}

export type NewNotice = Pick<Notification, "personId" | "kind" | "text" | "target"> & { urgent?: boolean };

/** Adds these notices from you, newest first. */
export function notify(db: Db, me: Person, notices: NewNotice[]): Db {
  if (!notices.length) return db;
  const at = now();
  const made: Notification[] = notices.map((n) => ({
    id: id(), personId: n.personId, kind: n.kind, actorId: me.id, text: n.text, target: n.target, at, read: false,
    ...(n.urgent && { urgent: true }),
  }));
  return { ...db, notifications: [...made, ...db.notifications] };
}

/** Deletes these notices of yours. Never anyone else's. */
export function deleteNotifications(db: Db, me: Person, ids: string[]): Db {
  const pick = new Set(Array.isArray(ids) ? ids.filter((x) => typeof x === "string") : []);
  return { ...db, notifications: db.notifications.filter((n) => !(n.personId === me.id && pick.has(n.id))) };
}

/** Marks your notices read: these ones, or all of them. Never anyone else's. */
export function markNotificationsRead(db: Db, me: Person, ids: string[] | "all"): Db {
  const pick = ids === "all" ? undefined : new Set(Array.isArray(ids) ? ids.filter((x) => typeof x === "string") : []);
  return {
    ...db,
    notifications: db.notifications.map((n) => (n.personId === me.id && !n.read && (!pick || pick.has(n.id)) ? { ...n, read: true } : n)),
  };
}
