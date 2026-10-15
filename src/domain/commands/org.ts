// Company sign-up and invites. Passwords arrive already hashed (data/passwords.ts) — the store never sees them.
import { daysBetween, now, today } from "../clock.ts";
import type { Invite, Notification, Org, Panel, Person, Role } from "../types.ts";
import { emptyDb, type Db } from "../../data/db.ts";
import { check, COLORS, domainOf, EMAIL_RE, emailError, fail, id, initialsOf, replace, requiredError, ValidationError } from "./shared.ts";

export interface Credential { hash: string; salt: string }
export interface SignUpInput { name: string; email: string; credential: Credential; company: string; slug: string }
export interface InviteInput { email: string; panel: Panel; role?: Role }

export const INVITE_DAYS = 14;
const MAX_INVITES = 50;
/** Personal email providers: a company signing up with one of these doesn't get a domain lock. */
const FREE_MAIL = new Set(["gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com", "yahoo.com", "icloud.com", "me.com", "proton.me", "protonmail.com", "aol.com", "gmx.com"]);
/** Personal mailboxes: a founder signing up with one doesn't lock invites to that domain. */
export const isFreeMail = (domain: string) => FREE_MAIL.has(domain);
const RESERVED = new Set(["admin", "manager", "dev", "api", "app", "signin", "signup", "invite", "forgot", "demo", "settings", "www"]);
const DEFAULT_ROLE: Record<Panel, Role> = { admin: "CTO", manager: "Team Lead", developer: "Engineer" };

/** "TensorFold Labs" → "tensorfold-labs". */
export const slugify = (name: string) =>
  name.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32);

export const slugError = (slug: string, taken: (s: string) => boolean) => {
  if (!/^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$/.test(slug)) return "Use 3–32 lowercase letters, numbers or dashes";
  if (RESERVED.has(slug)) return "That address is reserved — try another";
  return taken(slug) ? "That address is taken — try another" : null;
};

const newToken = () => `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, "").slice(0, 32);
const isPending = (i: Invite) => !i.acceptedAt && !i.revokedAt;
export const inviteState = (i: Invite) =>
  i.revokedAt ? "revoked" : i.acceptedAt ? "accepted" : daysBetween(i.createdAt, today()) > INVITE_DAYS ? "expired" : "pending";

function newPerson(db: Db | null, input: { name: string; email: string; panel: Panel; role: Role; credential: Credential }): Person {
  return {
    id: `u-${id().slice(0, 8)}`, name: input.name.trim(), initials: initialsOf(input.name),
    color: COLORS[(db?.people.length ?? 0) % COLORS.length], role: input.role, team: "", capacityH: 40,
    email: input.email.trim().toLowerCase(), passwordHash: input.credential.hash, passwordSalt: input.credential.salt,
    panel: input.panel, active: true,
  };
}

/** A new company: the founder is its first Admin. `slugTaken` says which addresses already exist. */
export function signUp(input: SignUpInput, slugTaken: (slug: string) => boolean): { db: Db; founder: Person } {
  fail(requiredError("Your name", input.name));
  const email = input.email.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) throw new ValidationError("Enter a valid work email");
  if (!input.credential.hash || !input.credential.salt) throw new ValidationError("Choose a password");
  fail(requiredError("Company name", input.company));
  fail(slugError(input.slug, slugTaken));
  const founder = newPerson(null, { name: input.name, email, panel: "admin", role: "CEO", credential: input.credential });
  const domain = domainOf(email);
  const org: Org = {
    id: `org-${id().slice(0, 8)}`, slug: input.slug, name: input.company.trim(), emailDomain: domain,
    domainLock: !FREE_MAIL.has(domain), createdAt: today(), createdBy: founder.id,
  };
  return { db: emptyDb(org, founder), founder };
}

/** Invite teammates by email. Each gets a link; until there's an email service, admins copy and send it. */
export function inviteMembers(db: Db, me: Person, invites: InviteInput[]): Db {
  check(me, "people.manage", {});
  if (!invites.length) throw new ValidationError("Add at least one email");
  if (invites.length > MAX_INVITES) throw new ValidationError(`Invite at most ${MAX_INVITES} people at a time`);
  const seen = new Set<string>();
  const added: Invite[] = invites.map((inv) => {
    const email = inv.email.trim().toLowerCase();
    const err = emailError(email, db);
    if (err) throw new ValidationError(`${email || "Email"}: ${err}`);
    if (seen.has(email)) throw new ValidationError(`${email} is in the list twice`);
    seen.add(email);
    if (db.invites.some((i) => i.email === email && inviteState(i) === "pending")) throw new ValidationError(`${email} is already invited`);
    if (!["admin", "manager", "developer"].includes(inv.panel)) throw new ValidationError("Pick a role");
    const role = inv.role ?? DEFAULT_ROLE[inv.panel];
    if (!db.jobTitles.includes(role)) throw new ValidationError("Pick a job title from the list");
    return { token: newToken(), email, panel: inv.panel, role, invitedBy: me.id, createdAt: now() };
  });
  return { ...db, invites: [...db.invites, ...added] };
}

export function revokeInvite(db: Db, me: Person, token: string): Db {
  check(me, "people.manage", {});
  const inv = db.invites.find((i) => i.token === token);
  if (!inv || !isPending(inv)) throw new ValidationError("That invite isn't pending any more");
  return { ...db, invites: replace(db.invites, (i) => i.token === token, (i) => ({ ...i, revokedAt: now() })) };
}

/** Why an invite link can't be used, or null when it can. */
export function inviteProblem(db: Db, token: string) {
  const inv = db.invites.find((i) => i.token === token);
  if (!inv) return "This invite link isn't valid.";
  const state = inviteState(inv);
  if (state === "accepted") return "This invite was already used — sign in instead.";
  if (state === "revoked") return "This invite was cancelled. Ask your admin for a new one.";
  if (state === "expired") return `This invite has expired (they last ${INVITE_DAYS} days). Ask your admin for a new one.`;
  if (db.people.some((p) => p.email === inv.email)) return "There's already an account for this email — sign in instead.";
  return null;
}

/** The invitee picks their name and password and joins with the role they were invited as. */
export function acceptInvite(db: Db, token: string, input: { name: string; credential: Credential }): { db: Db; person: Person } {
  const problem = inviteProblem(db, token);
  if (problem) throw new ValidationError(problem);
  fail(requiredError("Your name", input.name));
  if (!input.credential.hash || !input.credential.salt) throw new ValidationError("Choose a password");
  const inv = db.invites.find((i) => i.token === token)!;
  const person = newPerson(db, { name: input.name, email: inv.email, panel: inv.panel, role: inv.role, credential: input.credential });
  const notice: Notification = {
    id: id(), personId: inv.invitedBy, kind: "invite", actorId: person.id, text: `joined ${db.org.name}`, target: "/people", at: now(), read: false,
  };
  return {
    db: {
      ...db,
      people: [...db.people, person],
      invites: replace(db.invites, (i) => i.token === token, (i) => ({ ...i, acceptedAt: now() })),
      notifications: [notice, ...db.notifications],
    },
    person,
  };
}

export function updateOrg(db: Db, me: Person, patch: { name?: string; domainLock?: boolean }): Db {
  check(me, "org.manage", {});
  if (patch.name !== undefined) fail(requiredError("Company name", patch.name));
  return { ...db, org: { ...db.org, ...(patch.name !== undefined && { name: patch.name.trim() }), ...(patch.domainLock !== undefined && { domainLock: patch.domainLock }) } };
}
