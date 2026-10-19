// Accounts: sign-up, sign-in, sessions, invite links, password resets and confirming emails. Server only — passwords
// and tokens never reach a browser; it gets an httpOnly session cookie and its own view of the company.
import { and, eq, gt, isNull, ne, sql } from "drizzle-orm";
import { AccessError, acceptInvite, inviteProblem, signUp, ValidationError } from "../domain/commands/index.ts";
import { can } from "../domain/permissions.ts";
import type { Panel, Person } from "../domain/types.ts";
import { MAX_PASSWORD, MIN_PASSWORD, hashPassword, newId, newToken, sha256, verifyPassword } from "./auth/secrets.ts";
import { loadCompany, saveCompany, type Loaded } from "./company/store.ts";
import { instant } from "./company/rows.ts";
import { database, inScope, type Tx } from "./db/client.ts";
import * as s from "./db/schema.ts";
import { deliverEmail, resetEmail, sendEmail, verifyEmail, type Sent } from "./email.ts";
import { journal } from "./journal.ts";

const DAY_MS = 86_400_000;
const SESSION_MS = 30 * DAY_MS; // sliding: renewed when fewer than 15 days are left
const RENEW_MS = 15 * DAY_MS;

export interface SignedIn { token: string; userId: string; orgId: string; orgSlug: string; personId: string; panel: Panel }
export type SignInResult = { kind: "signed-in"; session: SignedIn } | { kind: "choose"; companies: { slug: string; name: string }[] };
/** A valid session, as the API sees it: which login, which company. */
export interface SessionRow { sessionId: string; userId: string; orgId: string }

export const passwordError = (pw: unknown) =>
  typeof pw !== "string" || pw.length < MIN_PASSWORD ? `Use at least ${MIN_PASSWORD} characters`
    : pw.length > MAX_PASSWORD ? "That password is too long" : null;
const pgCode = (e: unknown) => ((e as { cause?: { code?: string } }).cause ?? (e as { code?: string }))?.code;
const findUser = async (email: string) =>
  (await database().select().from(s.users).where(eq(s.users.email, email.trim().toLowerCase())))[0] ?? null;

/** One email, one company: a login already in a company can't start, join or be invited to another. */
export const ONE_COMPANY = "already belongs to a company on 1Fold — one email, one company";

const inACompany = async (userId: string) => !!(await companyOf(userId));

/** The company this login is in (the first, for logins from before one-company-each) — whose Resend its emails use. */
const companyOf = async (userId: string): Promise<string | undefined> =>
  (await inScope({ userId }, (tx) => tx.select({ orgId: s.members.orgId }).from(s.members).where(eq(s.members.userId, userId)).limit(1)))[0]?.orgId;

/** Whether this email's login is in a company already (logins from before the rule may be in more than one). */
export async function emailInACompany(email: string): Promise<boolean> {
  const user = await findUser(email);
  return !!user && inACompany(user.id);
}

export async function slugTaken(slug: string): Promise<boolean> {
  const { rows } = await database().execute(sql`select onefold_slug_taken(${slug}) as taken`);
  return (rows[0] as { taken: boolean }).taken;
}

async function openSession(tx: Tx, userId: string, orgId: string) {
  const token = newToken();
  await tx.insert(s.sessions).values({ id: sha256(token), userId, orgId, expiresAt: new Date(Date.now() + SESSION_MS).toISOString() });
  return token;
}

/** The signed-in person in a loaded company — refused if they've been turned off or have no panel. */
export function personFor(loaded: Loaded, userId: string): Person {
  const id = [...loaded.userIds].find(([, u]) => u === userId)?.[0];
  const me = loaded.db.people.find((p) => p.id === id);
  if (!me || !me.active || !me.panel) throw new AccessError();
  return me;
}

/** The signed-in person's member id in their company — refused if they're turned off or can't sign in. */
export async function activeMemberId(who: { userId: string; orgId: string }): Promise<string> {
  const [m] = await inScope({ orgId: who.orgId }, (tx) => tx.select({ id: s.members.id, active: s.members.active, panel: s.members.panel })
    .from(s.members).where(and(eq(s.members.orgId, who.orgId), eq(s.members.userId, who.userId))));
  if (!m || !m.active || !m.panel) throw new AccessError();
  return m.id;
}

// ---------- sign-up ----------

export async function signUpCompany(input: { name: string; email: string; password: string; company: string; slug: string }): Promise<SignedIn> {
  const email = input.email.trim().toLowerCase();
  const problem = passwordError(input.password);
  if (problem) throw new ValidationError(problem);
  const existing = await findUser(email);
  if (existing && await inACompany(existing.id)) throw new ValidationError(`This email ${ONE_COMPANY}. Sign in instead, or use another email.`);
  if (existing && !(await verifyPassword(input.password, existing.passwordHash))) {
    throw new ValidationError("This email already has a 1Fold login — use its password to add another company");
  }
  const taken = await slugTaken(input.slug);
  const { db, founder } = signUp({ name: input.name, email, company: input.company, slug: input.slug }, () => taken);
  const userId = existing?.id ?? newId("usr");
  const passwordHash = existing ? null : await hashPassword(input.password);
  try {
    return await inScope({ orgId: db.org.id, lock: true }, async (tx) => {
      if (passwordHash) await tx.insert(s.users).values({ id: userId, email, passwordHash });
      const version = await saveCompany(tx, null, db, { [founder.id]: userId });
      await journal(tx, { orgId: db.org.id, userId, actorId: founder.id, source: "web" }, [{ command: "signUp", args: { company: db.org.name, slug: db.org.slug } }], version);
      return { token: await openSession(tx, userId, db.org.id), userId, orgId: db.org.id, orgSlug: db.org.slug, personId: founder.id, panel: "admin" as const };
    });
  } catch (e) {
    if (pgCode(e) === "23505") throw new ValidationError("That address or email was just taken — try again");
    throw e;
  }
}

// ---------- sign-in / sessions ----------

export async function signIn(emailInput: string, password: string, slug?: string): Promise<SignInResult> {
  const user = await findUser(emailInput);
  const ok = await verifyPassword(password, user?.passwordHash ?? null); // same cost whether or not the email exists
  if (!user || !ok) throw new ValidationError("Wrong email or password");
  const memberships = await inScope({ userId: user.id }, (tx) => tx
    .select({ orgId: s.orgs.id, slug: s.orgs.slug, name: s.orgs.name, personId: s.members.id, panel: s.members.panel, active: s.members.active })
    .from(s.members).innerJoin(s.orgs, eq(s.orgs.id, s.members.orgId)).where(eq(s.members.userId, user.id)));
  const usable = memberships.filter((m) => m.active && m.panel);
  if (!usable.length) throw new ValidationError(memberships.length ? "Your account is turned off — ask your admin" : "Wrong email or password");
  const chosen = slug ? usable.filter((m) => m.slug === slug) : usable;
  if (slug && !chosen.length) throw new ValidationError("You're not in that company");
  if (chosen.length > 1) return { kind: "choose", companies: usable.map((m) => ({ slug: m.slug, name: m.name })) };
  const m = chosen[0];
  const token = await inScope({ orgId: m.orgId }, (tx) => openSession(tx, user.id, m.orgId));
  return { kind: "signed-in", session: { token, userId: user.id, orgId: m.orgId, orgSlug: m.slug, personId: m.personId, panel: m.panel as Panel } };
}

/** The session behind a cookie's token, or null (unknown, revoked or expired). Renews it when it's halfway through. */
export async function readSession(token: string | undefined): Promise<SessionRow | null> {
  if (!token || token.length > 100) return null;
  const id = sha256(token);
  const [row] = await database().select().from(s.sessions)
    .where(and(eq(s.sessions.id, id), isNull(s.sessions.revokedAt), gt(s.sessions.expiresAt, sql`now()`)));
  if (!row) return null;
  if (Date.parse(instant(row.expiresAt)) - Date.now() < SESSION_MS - RENEW_MS) {
    await database().update(s.sessions).set({ expiresAt: new Date(Date.now() + SESSION_MS).toISOString() }).where(eq(s.sessions.id, id));
  }
  return { sessionId: id, userId: row.userId, orgId: row.orgId };
}

export async function endSession(token: string | undefined) {
  if (!token) return;
  await database().update(s.sessions).set({ revokedAt: sql`now()` }).where(eq(s.sessions.id, sha256(token)));
}

// ---------- invite links ----------

export interface InviteView {
  problem: string | null; orgName?: string; inviterName?: string; email?: string; panel?: Panel; role?: string;
  /** The invited email already has a 1Fold login (another company): they confirm with that password. */
  hasLogin?: boolean;
}

const inviteOrg = (hash: string) => inScope({ inviteTokenHash: hash }, async (tx) =>
  (await tx.select({ orgId: s.invites.orgId }).from(s.invites).where(eq(s.invites.tokenHash, hash)))[0]?.orgId ?? null);

export async function lookupInvite(token: string): Promise<InviteView> {
  const hash = sha256(token);
  const orgId = await inviteOrg(hash);
  if (!orgId) return { problem: "This invite link isn't valid." };
  const view = await inScope({ orgId }, async (tx) => {
    const { db } = (await loadCompany(tx, orgId))!;
    const inv = db.invites.find((i) => i.tokenHash === hash)!;
    return {
      problem: inviteProblem(db, hash), orgName: db.org.name, inviterName: db.people.find((p) => p.id === inv.invitedBy)?.name,
      email: inv.email, panel: inv.panel, role: inv.role,
    };
  });
  const user = await findUser(view.email);
  if (user && !view.problem && await inACompany(user.id)) {
    return { ...view, problem: `${view.email} ${ONE_COMPANY}. Ask for an invite to another email.` };
  }
  return { ...view, hasLogin: !!user };
}

export async function acceptInvitation(token: string, input: { name: string; password: string }): Promise<SignedIn> {
  const hash = sha256(token);
  const orgId = await inviteOrg(hash);
  if (!orgId) throw new ValidationError("This invite link isn't valid.");
  return inScope({ orgId, lock: true }, async (tx) => {
    const loaded = (await loadCompany(tx, orgId))!;
    const { db, person } = acceptInvite(loaded.db, hash, { name: input.name });
    const user = await findUser(person.email);
    if (user && await inACompany(user.id)) throw new ValidationError(`This email ${ONE_COMPANY}. Ask for an invite to another email.`);
    let userId: string;
    if (user) {
      if (!(await verifyPassword(input.password, user.passwordHash))) throw new ValidationError("This email already has a 1Fold login — use its password");
      userId = user.id;
    } else {
      const problem = passwordError(input.password);
      if (problem) throw new ValidationError(problem);
      userId = newId("usr");
      await tx.insert(s.users).values({ id: userId, email: person.email, passwordHash: await hashPassword(input.password) });
    }
    const version = await saveCompany(tx, loaded, db, { [person.id]: userId });
    await journal(tx, { orgId, userId, actorId: person.id, source: "web" }, [{ command: "acceptInvite", args: { email: person.email } }], version);
    return { token: await openSession(tx, userId, orgId), userId, orgId, orgSlug: db.org.slug, personId: person.id, panel: person.panel! };
  });
}

// ---------- passwords ----------

/**
 * Sets a new password: your own, or (admins) a teammate's. A login shared with other companies can only be changed by
 * its owner — one company's admin must never take over someone's access to another. Other sessions are signed out,
 * and the login's API tokens stop working.
 */
export async function setPassword(who: SessionRow, personId: string, password: string) {
  const problem = passwordError(password);
  if (problem) throw new ValidationError(problem);
  const passwordHash = await hashPassword(password);
  await inScope({ orgId: who.orgId, lock: true }, async (tx) => {
    const loaded = (await loadCompany(tx, who.orgId))!;
    const me = personFor(loaded, who.userId);
    const userId = loaded.userIds.get(personId);
    if (!userId) throw new ValidationError("Person not found");
    if (userId !== who.userId) {
      if (!can(me, "people.manage", {})) throw new AccessError();
      await tx.execute(sql`select set_config('app.user_id', ${userId}, true)`);
      const [{ n }] = (await tx.execute(sql`select count(*)::int as n from members where user_id = ${userId}`)).rows as { n: number }[];
      if (n > 1) throw new ValidationError("This person also uses 1Fold with another company — they can change their own password");
    }
    await tx.update(s.users).set({ passwordHash }).where(eq(s.users.id, userId));
    await tx.update(s.sessions).set({ revokedAt: sql`now()` })
      .where(and(eq(s.sessions.userId, userId), isNull(s.sessions.revokedAt), ne(s.sessions.id, who.sessionId)));
    await tx.update(s.apiTokens).set({ revokedAt: sql`now()` }).where(and(eq(s.apiTokens.userId, userId), isNull(s.apiTokens.revokedAt)));
    await journal(tx, { orgId: who.orgId, userId: who.userId, actorId: me.id, source: "web" }, [{ command: "setPassword", args: { personId } }], loaded.version);
  });
}

// ---------- emailed links: reset a password, confirm an email ----------

type LinkPurpose = "reset" | "verify";
export const RESET_MINUTES = 60;
const VERIFY_MS = 7 * DAY_MS;
const LINK_GONE = "This link has expired or was already used — ask for a new one.";

async function issueLink(userId: string, purpose: LinkPurpose, ttlMs: number): Promise<string> {
  const token = newToken();
  await database().insert(s.emailTokens).values({ id: sha256(token), userId, purpose, expiresAt: new Date(Date.now() + ttlMs).toISOString() });
  return token;
}

const liveLink = (token: string, purpose: LinkPurpose) => and(
  eq(s.emailTokens.id, sha256(token)), eq(s.emailTokens.purpose, purpose), gt(s.emailTokens.expiresAt, sql`now()`));

/** "Forgot password": emails a reset link if the address has a login. The caller answers the same either way. */
export async function requestPasswordReset(emailInput: string, appUrl: string): Promise<void> {
  const user = await findUser(emailInput);
  if (!user) return;
  const token = await issueLink(user.id, "reset", RESET_MINUTES * 60_000);
  await sendEmail(resetEmail({ to: user.email, link: `${appUrl}/reset/${token}`, minutes: RESET_MINUTES }), { orgId: await companyOf(user.id) });
}

/** Why a reset link can't be used, or null — so the page can say so before anyone types a new password. */
export async function resetLinkProblem(token: string): Promise<string | null> {
  if (!token || token.length > 100) return LINK_GONE;
  const [row] = await database().select({ id: s.emailTokens.id }).from(s.emailTokens)
    .where(and(liveLink(token, "reset"), isNull(s.emailTokens.usedAt)));
  return row ? null : LINK_GONE;
}

/**
 * Sets a new password from a reset link. The link works once (and every other reset link for that login dies with it);
 * every session of that login is signed out; and the email counts as confirmed — the link reached that inbox.
 */
export async function resetPassword(token: string, password: string): Promise<void> {
  const problem = passwordError(password);
  if (problem) throw new ValidationError(problem);
  if (!token || token.length > 100) throw new ValidationError(LINK_GONE);
  const passwordHash = await hashPassword(password);
  await database().transaction(async (tx) => {
    const [used] = await tx.update(s.emailTokens).set({ usedAt: sql`now()` })
      .where(and(liveLink(token, "reset"), isNull(s.emailTokens.usedAt))).returning({ userId: s.emailTokens.userId });
    if (!used) throw new ValidationError(LINK_GONE);
    await tx.update(s.users).set({ passwordHash, emailVerifiedAt: sql`coalesce(${s.users.emailVerifiedAt}, now())` }).where(eq(s.users.id, used.userId));
    await tx.update(s.sessions).set({ revokedAt: sql`now()` }).where(and(eq(s.sessions.userId, used.userId), isNull(s.sessions.revokedAt)));
    await tx.update(s.apiTokens).set({ revokedAt: sql`now()` }).where(and(eq(s.apiTokens.userId, used.userId), isNull(s.apiTokens.revokedAt)));
    await tx.update(s.emailTokens).set({ usedAt: sql`now()` })
      .where(and(eq(s.emailTokens.userId, used.userId), eq(s.emailTokens.purpose, "reset"), isNull(s.emailTokens.usedAt)));
  });
}

/** Whether this login's email is confirmed. */
export async function emailVerified(userId: string): Promise<boolean> {
  const [row] = await database().select({ at: s.users.emailVerifiedAt }).from(s.users).where(eq(s.users.id, userId));
  return !!row?.at;
}

/** Emails a "confirm your email" link (nothing to do if it's already confirmed) — or says why it couldn't. */
export async function sendVerification(userId: string, appUrl: string): Promise<Sent> {
  const [user] = await database().select().from(s.users).where(eq(s.users.id, userId));
  if (!user || user.emailVerifiedAt) return { ok: true };
  const token = await issueLink(user.id, "verify", VERIFY_MS);
  return deliverEmail(verifyEmail({ to: user.email, link: `${appUrl}/verify/${token}` }), { orgId: await companyOf(user.id) });
}

/** Confirms the email a link was sent to. Opening the link twice is fine (it only ever confirms). */
export async function confirmEmail(token: string): Promise<void> {
  if (!token || token.length > 100) throw new ValidationError(LINK_GONE);
  await database().transaction(async (tx) => {
    const [link] = await tx.update(s.emailTokens).set({ usedAt: sql`coalesce(${s.emailTokens.usedAt}, now())` })
      .where(liveLink(token, "verify")).returning({ userId: s.emailTokens.userId });
    if (!link) throw new ValidationError(LINK_GONE);
    await tx.update(s.users).set({ emailVerifiedAt: sql`coalesce(${s.users.emailVerifiedAt}, now())` }).where(eq(s.users.id, link.userId));
  });
}
