// Shared by every command: errors, validation, small helpers. Commands are pure: (db, me, …) → new db.
import { can, type Action, type Ctx } from "../permissions.ts";
import { now } from "../clock.ts";
import type { Activity, Person, Stage } from "../types.ts";
import type { Db } from "../../data/db.ts";

export class AccessError extends Error {
  constructor() { super("You don't have access to do that."); }
}
export class ValidationError extends Error {}

export const STAGES: Stage[] = ["INTAKE", "DEFINE", "PLAN", "BUILD", "RELEASE"];
export const COLORS = ["var(--color-bright-blue)", "var(--color-grass_green)", "var(--color-purple)", "var(--color-dark-orange)",
  "var(--color-teal)", "var(--color-berry)", "var(--color-navy)", "var(--color-sofia_pink)"];
export const id = () => crypto.randomUUID();

export function check(me: Person, action: Action, ctx: Ctx) {
  if (!can(me, action, ctx)) throw new AccessError();
}
export function fail(msg: string | null): void {
  if (msg) throw new ValidationError(msg);
}

// ---------- validation (forms show the same messages) ----------
export const requiredError = (label: string, v?: string) => (v?.trim() ? null : `${label} is required`);
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const domainOf = (email: string) => email.trim().toLowerCase().split("@")[1] ?? "";
/** A teammate's email: valid, unused here, and on the company domain while the domain lock is on. */
export const emailError = (email: string, db: Db, exceptId?: string) => {
  const e = email.trim().toLowerCase();
  if (!e) return "Email is required";
  if (!EMAIL_RE.test(e)) return "Enter a valid email address";
  if (db.org.domainLock && domainOf(e) !== db.org.emailDomain) return `Only @${db.org.emailDomain} emails can join ${db.org.name}`;
  return db.people.some((p) => p.id !== exceptId && p.email.toLowerCase() === e) ? "Someone already uses this email" : null;
};
export const productKeyError = (key: string, db: Db) => {
  if (!/^[A-Z]{2,4}$/.test(key)) return "Key must be 2–4 capital letters";
  return db.products.some((p) => p.key === key) ? `Key ${key} is already used` : null;
};
export const positiveNumberError = (label: string, v?: number) =>
  v === undefined || (Number.isFinite(v) && v >= 0) ? null : `${label} must be 0 or more`;
export const MIN_PASSWORD = 8;

// ---------- lookups that throw ----------
export const productOf = (db: Db, key: string) => {
  const p = db.products.find((x) => x.key === key);
  if (!p) throw new ValidationError(`Product ${key} not found`);
  return p;
};
export const ticketOf = (db: Db, key: string) => {
  const t = db.tickets.find((x) => x.key === key);
  if (!t) throw new ValidationError(`Ticket ${key} not found`);
  return t;
};
export const personOf = (db: Db, pid: string) => {
  const p = db.people.find((x) => x.id === pid);
  if (!p) throw new ValidationError("Person not found");
  return p;
};
export const replace = <T>(list: T[], match: (x: T) => boolean, next: (x: T) => T) => list.map((x) => (match(x) ? next(x) : x));
export const log = (db: Db, me: Person, entry: Omit<Activity, "id" | "at" | "actorId">): Activity[] =>
  [...db.activity, { ...entry, id: id(), at: now(), actorId: me.id }];
export const initialsOf = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
