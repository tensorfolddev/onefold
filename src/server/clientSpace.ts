// Client Space on the server: sign-in links for client people (they have no password), their own view of their
// projects and the few things they can do, the team inviting them, and the emails that tell them something needs
// them. A client's session opens only these; every team route refuses it (http.ts requireSession).
import { and, eq, isNull, sql } from "drizzle-orm";
import type { Db } from "../data/db.ts";
import { clientCanSee, clientCanSeeAsk, clientViewFor, type ClientView } from "../domain/clientView.ts";
import { clientActions, sendClientFile, type ClientActionName } from "../domain/commands/clientActions.ts";
import { addClientPerson, addThreadFile, checkMayLinkClient } from "../domain/commands/clients.ts";
import { AccessError, ValidationError } from "../domain/commands/index.ts";
import { can } from "../domain/permissions.ts";
import type { ClientPerson, ClientRole, Person } from "../domain/types.ts";
import { emailVerified, findUser, issueLink, liveLink, openSession, personFor, type SessionRow } from "./accounts.ts";
import { newId } from "./auth/secrets.ts";
import { clientCode, clientCodeOwner, clientCodeUrl, isClientCode } from "./clientLinks.ts";
import { mustLoad } from "./changes.ts";
import { saveCompany, type Loaded } from "./company/store.ts";
import { opensInBrowser, storedBytes, storeFile } from "./files.ts";
import { database, inScope, type Tx } from "./db/client.ts";
import * as s from "./db/schema.ts";
import { clientInviteEmail, clientLinkEmail, clientNudgeEmail, deliverEmail, emailOn, sendEmail } from "./email.ts";
import { journal } from "./journal.ts";

const MINUTE_MS = 60_000;
export const CLIENT_LINK_MINUTES = 30; // asked for on the sign-in page
const LINK_GONE = "This link has expired or was already used — ask for a new one.";
const CODE_GONE = "This link doesn't open anything any more — ask the team for your new one.";
const NO_PASSWORD = "!"; // a client's login: no password can ever match it
const baseUrl = () => (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

// ---------- signing in: emailed links ----------

/** The companies where this login is an active client, with Client Space on. */
async function clientCompanies(userId: string) {
  return inScope({ userId }, (tx) => tx
    .select({ orgId: s.orgs.id, slug: s.orgs.slug, name: s.orgs.name, memberId: s.members.id })
    .from(s.members).innerJoin(s.orgs, eq(s.orgs.id, s.members.orgId))
    .where(and(eq(s.members.userId, userId), eq(s.members.panel, "client"), eq(s.members.active, true), eq(s.orgs.clientSpace, true))));
}

/** Emails a sign-in link for each company this login is a client of (the platform's email: nobody's locked out). */
export async function sendClientLinks(userId: string, email: string, appUrl: string): Promise<boolean> {
  const companies = await clientCompanies(userId);
  for (const c of companies) {
    const token = await issueLink(userId, "client", CLIENT_LINK_MINUTES * MINUTE_MS, c.orgId);
    await sendEmail(clientLinkEmail({ to: email, orgName: c.name, link: `${appUrl}/c/link/${token}`, minutes: CLIENT_LINK_MINUTES }));
  }
  return companies.length > 0;
}

/** "Email me a link": sent if the address is a client's. The caller answers the same either way. */
export async function requestClientLink(emailInput: string, appUrl: string): Promise<void> {
  const user = await findUser(emailInput);
  if (user) await sendClientLinks(user.id, user.email, appUrl);
}

/** A client's own link (clientLinks.ts): the login and company it opens, if they're still a client there. */
async function codeCompany(code: string) {
  const owner = await clientCodeOwner(code);
  if (!owner) return undefined;
  const [member] = await inScope({ orgId: owner.orgId }, (tx) => tx.select({ userId: s.members.userId }).from(s.members)
    .where(and(eq(s.members.orgId, owner.orgId), eq(s.members.id, owner.memberId))));
  const company = member?.userId ? (await clientCompanies(member.userId)).find((c) => c.orgId === owner.orgId) : undefined;
  return company && { ...company, userId: member.userId! };
}

/** What the link page shows before "Continue": the company it opens, or why it can't (checking never uses it up). */
export async function clientLinkCheck(token: string): Promise<{ problem: string | null; company?: string }> {
  if (isClientCode(token)) {
    const company = await codeCompany(token);
    return company ? { problem: null, company: company.name } : { problem: CODE_GONE };
  }
  if (!token || token.length > 100) return { problem: LINK_GONE };
  const [link] = await database().select({ orgId: s.emailTokens.orgId }).from(s.emailTokens)
    .where(and(liveLink(token, "client"), isNull(s.emailTokens.usedAt)));
  if (!link?.orgId) return { problem: LINK_GONE };
  const orgId = link.orgId;
  const [org] = await inScope({ orgId }, (tx) => tx.select({ name: s.orgs.name }).from(s.orgs).where(eq(s.orgs.id, orgId)));
  return org ? { problem: null, company: org.name } : { problem: LINK_GONE };
}

/**
 * "Continue" on a link page: the link is used up (it works once) and a client session opens. Only a POST does this, so
 * an email scanner opening the link can't spend it. The email counts as confirmed: the link reached that inbox.
 */
export async function signInWithClientLink(token: string) {
  if (isClientCode(token)) { // their own link: it stays theirs — nothing is used up
    const company = await codeCompany(token);
    if (!company) throw new ValidationError(CODE_GONE);
    const sessionToken = await inScope({ orgId: company.orgId }, (tx) => openSession(tx, company.userId, company.orgId, "client"));
    return { token: sessionToken, orgSlug: company.slug, personId: company.memberId, panel: "client" as const };
  }
  if (!token || token.length > 100) throw new ValidationError(LINK_GONE);
  const [used] = await database().update(s.emailTokens).set({ usedAt: sql`now()` })
    .where(and(liveLink(token, "client"), isNull(s.emailTokens.usedAt))).returning({ userId: s.emailTokens.userId, orgId: s.emailTokens.orgId });
  if (!used?.orgId) throw new ValidationError(LINK_GONE);
  const orgId = used.orgId;
  const company = (await clientCompanies(used.userId)).find((c) => c.orgId === orgId);
  if (!company) throw new ValidationError("This client space isn't open to you any more — ask the team for a new link");
  await database().update(s.users).set({ emailVerifiedAt: sql`coalesce(${s.users.emailVerifiedAt}, now())` }).where(eq(s.users.id, used.userId));
  const sessionToken = await inScope({ orgId }, (tx) => openSession(tx, used.userId, orgId, "client"));
  return { token: sessionToken, orgSlug: company.slug, personId: company.memberId, panel: "client" as const };
}

// ---------- a client's view and actions ----------

/** The signed-in client in a loaded company — refused if they're off, or Client Space is. */
function clientFor(loaded: Loaded, userId: string): ClientPerson {
  const id = [...loaded.userIds].find(([, u]) => u === userId)?.[0];
  const me = loaded.db.clientPeople.find((c) => c.id === id);
  if (!me || !me.active || !loaded.db.org.clientSpace) throw new AccessError();
  return me;
}

export async function clientView(who: SessionRow): Promise<ClientView & { version: number }> {
  return inScope({ orgId: who.orgId, userId: who.userId }, async (tx) => {
    const loaded = await mustLoad(tx, who);
    const view = clientViewFor(loaded.db, clientFor(loaded, who.userId).id);
    if (!view) throw new AccessError();
    return { ...view, version: loaded.version };
  });
}

/** Runs one client action (clientActions — nothing else) as the signed-in client. */
export async function runClientAction(who: SessionRow, name: unknown, args: unknown): Promise<{ version: number }> {
  if (typeof name !== "string" || !Object.hasOwn(clientActions, name) || !Array.isArray(args)) throw new ValidationError("That isn't something you can do here");
  return inScope({ orgId: who.orgId, userId: who.userId, lock: true }, async (tx) => {
    const loaded = await mustLoad(tx, who);
    const me = clientFor(loaded, who.userId);
    const run = clientActions[name as ClientActionName] as unknown as (db: Db, me: ClientPerson, ...a: unknown[]) => Db;
    let db: Db;
    try {
      db = run(loaded.db, me, ...args);
    } catch (e) {
      if (e instanceof AccessError || e instanceof ValidationError) throw e;
      throw new ValidationError("That couldn't be done — refresh and try again"); // malformed arguments
    }
    const version = await saveCompany(tx, loaded, db);
    await journal(tx, { orgId: who.orgId, userId: who.userId, actorId: me.id, source: "client" }, [{ command: name, args }], version);
    return { version };
  });
}

// ---------- the team: inviting clients, new links, seeing what they see ----------

export interface ClientInviteInput { name: string; email: string; company: string; role: ClientRole }
export interface ClientLink { personId: string; link: string; emailed: boolean; version: number }

/**
 * A client person on a project: their login (no password) and member row are made, and their own link (it lasts until
 * an admin makes a new one) is emailed — and returned, to send another way (WhatsApp) when the company's email isn't set up.
 */
export async function inviteClient(who: SessionRow, productKey: string, input: ClientInviteInput, appUrl: string): Promise<ClientLink> {
  const email = String(input?.email ?? "").trim().toLowerCase();
  if ((await emailOn()) && !(await emailVerified(who.userId))) throw new ValidationError("Confirm your email first — open the link we emailed you");
  const user = await findUser(email);
  const made = await inScope({ orgId: who.orgId, userId: who.userId, lock: true }, async (tx) => {
    const loaded = await mustLoad(tx, who);
    const me = personFor(loaded, who.userId);
    const teammate = !!user && [...loaded.userIds].some(([pid, u]) => u === user.id && loaded.db.people.some((p) => p.id === pid));
    if (teammate) throw new ValidationError("That's a teammate's email — a client needs their own");
    const already = loaded.db.clientPeople.find((c) => c.email.toLowerCase() === email);
    if (already) checkMayLinkClient(loaded.db, me, already.id); // the link we return signs in as them, everywhere
    const next = addClientPerson(loaded.db, me, { id: newId("cl"), name: input?.name, email, company: input?.company }, productKey, input?.role);
    const person = next.clientPeople.find((c) => c.email === email)!;
    let userId = loaded.userIds.get(person.id) ?? user?.id;
    if (!userId) {
      userId = newId("usr");
      await tx.insert(s.users).values({ id: userId, email, passwordHash: NO_PASSWORD });
    }
    const version = await saveCompany(tx, loaded, next, { [person.id]: userId });
    await journal(tx, { orgId: who.orgId, userId: who.userId, actorId: me.id, source: "web" },
      [{ command: "addClientPerson", args: { productKey, email, role: input?.role } }], version);
    return { version, userId, person, meId: me.id, inviter: me.name, orgName: next.org.name, project: next.products.find((p) => p.key === productKey)!.name };
  });
  // After the commit: the login exists for the link to point at, and a failed email still leaves the link to copy.
  const link = clientCodeUrl(appUrl, await clientCode(who.orgId, made.person.id, made.meId));
  const emailed = await sendEmail(clientInviteEmail({ to: email, orgName: made.orgName, inviterName: made.inviter, project: made.project, link }), { orgId: who.orgId });
  return { personId: made.person.id, link, emailed, version: made.version };
}

/** The projects of this client's the viewer manages — refused if none (admins may still act on any client). */
function managesClient(db: Db, me: Person, clientId: string) {
  if (!db.clientPeople.some((c) => c.id === clientId)) throw new ValidationError("That client isn't here");
  const theirs = db.products.filter((p) => p.clients?.some((c) => c.personId === clientId) && can(me, "client.people", { product: p }));
  if (me.panel !== "admin" && !theirs.length) throw new AccessError();
  return theirs;
}

/**
 * A client's own link, to copy and send them — or, `fresh` (admins: Settings → Clients), a new one: the old stops working
 * and the new one is emailed to them.
 */
export async function newClientLink(who: SessionRow, clientId: string, appUrl: string, fresh = false): Promise<ClientLink> {
  const found = await inScope({ orgId: who.orgId, userId: who.userId }, async (tx) => {
    const loaded = await mustLoad(tx, who);
    const me = personFor(loaded, who.userId);
    managesClient(loaded.db, me, clientId);
    checkMayLinkClient(loaded.db, me, clientId);
    const person = loaded.db.clientPeople.find((c) => c.id === clientId)!;
    if (!person.active) throw new ValidationError(`${person.name} is switched off — switch them on first`);
    if (fresh && !can(me, "org.manage")) throw new AccessError(); // a new link is an admin's: Settings → Clients
    return { meId: me.id, person, orgName: loaded.db.org.name, version: loaded.version };
  });
  const link = clientCodeUrl(appUrl, await clientCode(who.orgId, clientId, found.meId, fresh));
  const emailed = fresh && await sendEmail(clientLinkEmail({ to: found.person.email, orgName: found.orgName, link }), { orgId: who.orgId });
  return { personId: clientId, link, emailed, version: found.version };
}

/** "View as client": exactly what they see — limited to the projects the viewer manages. */
export async function previewClient(who: SessionRow, clientId: string): Promise<ClientView | null> {
  return inScope({ orgId: who.orgId, userId: who.userId }, async (tx) => {
    const loaded = await mustLoad(tx, who);
    const mine = new Set(managesClient(loaded.db, personFor(loaded, who.userId), clientId).map((p) => p.key));
    const view = clientViewFor(loaded.db, clientId);
    return view && { ...view, projects: view.projects.filter((p) => mine.has(p.key)) };
  });
}

// ---------- files in the chats ----------

const FAKE_FILE = { id: "check", name: "check", type: "", size: 0 };

/** Refuses a team upload into a chat before any bytes are read (the same rules as the change itself). */
export async function checkThreadUpload(who: SessionRow, subject: string, note: boolean): Promise<void> {
  await inScope({ orgId: who.orgId, userId: who.userId }, async (tx) => {
    const loaded = await mustLoad(tx, who);
    addThreadFile(loaded.db, personFor(loaded, who.userId), subject, FAKE_FILE, { note });
  });
}

/** A teammate's file in a chat: stored, then a line in the chat (a note when `note`). */
export async function uploadThreadFile(who: SessionRow, subject: string, input: { name: string; note: boolean; body?: string }, bytes: Buffer) {
  return storeFile(who.orgId, input.name, bytes, (file) => inScope({ orgId: who.orgId, userId: who.userId, lock: true }, async (tx) => {
    const loaded = await mustLoad(tx, who);
    const me = personFor(loaded, who.userId);
    const db = addThreadFile(loaded.db, me, subject, file, { note: input.note, body: input.body });
    const version = await saveCompany(tx, loaded, db);
    await journal(tx, { orgId: who.orgId, userId: who.userId, actorId: me.id, source: "web" }, [{ command: "addThreadFile", args: { subject, name: file.name, note: input.note } }], version);
    return { version, file, before: loaded.db, after: db };
  })).then(async (r) => {
    await emailClients(who.orgId, r.before, r.after).catch((e) => console.error("[client] email", e));
    return { version: r.version, file: r.file };
  });
}

export const CLIENT_DAILY_BYTES = 200 * 1024 * 1024; // what one client may upload in a day

/** What this client uploaded in the last day, in bytes. */
async function uploadedToday(tx: Tx, orgId: string, clientId: string): Promise<number> {
  const { rows } = await tx.execute(sql`select coalesce(sum((data->'file'->>'size')::bigint), 0)::bigint as n from client_messages
    where org_id = ${orgId} and author_id = ${clientId} and data ? 'file' and at > now() - interval '1 day'`);
  return Number((rows[0] as { n: string | number }).n);
}
const overQuota = () => new ValidationError("That's a lot of files for one day — send the rest tomorrow, or share a link");

/** Refuses a client's upload before any bytes are read (and once they've sent their day's worth). */
export async function checkClientUpload(who: SessionRow, subject: string): Promise<void> {
  await inScope({ orgId: who.orgId, userId: who.userId }, async (tx) => {
    const loaded = await mustLoad(tx, who);
    const me = clientFor(loaded, who.userId);
    sendClientFile(loaded.db, me, subject, FAKE_FILE);
    if (await uploadedToday(tx, who.orgId, me.id) >= CLIENT_DAILY_BYTES) throw overQuota();
  });
}

/** A client's file in a chat they can see — in an open request's chat, it answers it. */
export async function uploadClientFile(who: SessionRow, subject: string, input: { name: string; body?: string }, bytes: Buffer) {
  return storeFile(who.orgId, input.name, bytes, (file) => inScope({ orgId: who.orgId, userId: who.userId, lock: true }, async (tx) => {
    const loaded = await mustLoad(tx, who);
    const me = clientFor(loaded, who.userId);
    if (await uploadedToday(tx, who.orgId, me.id) + file.size > CLIENT_DAILY_BYTES) throw overQuota();
    const db = sendClientFile(loaded.db, me, subject, file, input.body);
    const version = await saveCompany(tx, loaded, db);
    await journal(tx, { orgId: who.orgId, userId: who.userId, actorId: me.id, source: "client" }, [{ command: "sendClientFile", args: { subject, name: file.name } }], version);
    return { version, file };
  }));
}

/** A file in a chat this client can see (never one in an internal note), or null. */
export async function readClientFile(who: SessionRow, id: string) {
  const file = await inScope({ orgId: who.orgId, userId: who.userId }, async (tx) => {
    const loaded = await mustLoad(tx, who);
    const view = clientViewFor(loaded.db, clientFor(loaded, who.userId).id);
    return view?.projects.flatMap((p) => p.messages).find((m) => m.data?.file?.id === id)?.data?.file ?? null;
  });
  if (!file) return null;
  const bytes = await storedBytes(who.orgId, file.id);
  return bytes && { bytes, type: file.type, name: file.name, download: !opensInBrowser(file.type) };
}

// ---------- telling clients: something needs them ----------

export interface Nudge { to: string; orgName: string; project: string; productKey: string; subject: string; what: string }

/** What a team change tells clients: a request, a requirement to confirm, a reminder, a reply, a file, an update. */
export function clientNudges(before: Db, after: Db): Nudge[] {
  if (!after.org.clientSpace) return [];
  const out: Nudge[] = [];
  const tell = (productKey: string, subject: string, what: string, who: (pc: { personId: string; role: ClientRole }) => boolean) => {
    const product = after.products.find((p) => p.key === productKey && !p.archivedAt);
    for (const pc of product?.clients ?? []) {
      const c = after.clientPeople.find((x) => x.id === pc.personId);
      if (c?.active && who(pc)) out.push({ to: c.email, orgName: after.org.name, project: product!.name, productKey, subject, what });
    }
  };
  const old = new Set(before.clientMessages.map((m) => m.id));
  for (const m of after.clientMessages) {
    if (old.has(m.id) || m.kind === "note") continue;
    const author = after.people.find((p) => p.id === m.authorId)?.name;
    if (!author) continue; // a client wrote it: it's in the team's inbox
    const [kind, id] = m.subject.split(":");
    const ask = kind === "ask" ? after.asks.find((a) => a.id === id) : undefined;
    const req = kind === "req" ? after.requirements.find((r) => r.id === id) : undefined;
    if (req && !clientCanSee(req)) continue; // a team draft's chat
    const about = ask ? `${ask.code} · ${ask.title}` : req ? `${req.code} · ${req.title}` : "the project chat";
    const sees = (pc: { personId: string; role: ClientRole }) => !ask || clientCanSeeAsk(ask, pc.personId, pc.role);
    const forAsk = (pc: { personId: string; role: ClientRole }) => !ask?.assigneeId || pc.personId === ask.assigneeId;
    if (m.kind === "event") {
      if (m.event === "asked" && ask) tell(m.productKey, m.subject, `${author} needs something from you: “${ask.title}”`, forAsk);
      if (m.event === "sent" && req) tell(m.productKey, m.subject, `${req.code} · ${req.title} is ready for you to confirm`, (pc) => pc.role !== "tester");
      if (m.event === "reminded") tell(m.productKey, m.subject, `Reminder: ${about} is waiting for you`, ask ? forAsk : (pc) => pc.role !== "tester");
      continue;
    }
    if (m.kind === "update") tell(m.productKey, m.subject, `${author} posted this week's update`, () => true);
    else tell(m.productKey, m.subject, `${author} wrote in ${about}`, sees);
  }
  return out;
}

/** After a team change commits: one email per client (the first thing it tells them), through the company's email. */
export async function emailClients(orgId: string, before: Db, after: Db): Promise<void> {
  const seen = new Set<string>();
  for (const n of clientNudges(before, after)) {
    if (seen.has(n.to)) continue;
    seen.add(n.to);
    await deliverEmail(clientNudgeEmail({ ...n, link: `${baseUrl()}/c/p/${n.productKey}?t=${encodeURIComponent(n.subject)}` }), { orgId });
  }
}
