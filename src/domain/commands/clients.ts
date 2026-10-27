// Client Space, the team's side: switching it on (admins), the client people on a project and their roles, what the
// team needs from them (requests), the chats they share — a project's own, and one per requirement and request — and
// sending a requirement to confirm. Whoever manages the project speaks to the client (`client.manage`); anyone on it
// writes internal notes, which the client never sees.
import type { Db } from "../../data/db.ts";
import { now } from "../clock.ts";
import { clientCanSee } from "../clientView.ts";
import { can } from "../permissions.ts";
import { statusOfRequirement } from "../selectors/requirements.ts";
import type { Ask, AskKind, ClientEvent, ClientMessage, ClientMessageData, ClientPhases, ClientRole, Notification, Person, PhaseLook, PriorityDef, Product, Requirement, ThreadFile } from "../types.ts";
import { isOnProduct } from "../permissions.ts";
import { ASK_STATES, DEFAULT_PRIORITIES, lookOf, priorityLook, REQUIREMENT_STATUSES } from "../selectors/clientLook.ts";
import { deleteLine, messageIn, pinLine, readLine, starLine } from "./chat.ts";
import { check, EMAIL_RE, fail, id as newId, initialsOf, newIdError, productOf, replace, requiredError, ValidationError } from "./shared.ts";

export const CLIENT_ROLES: ClientRole[] = ["sponsor", "owner", "tester"];
export const ASK_KINDS: AskKind[] = ["question", "access", "file", "other"];
const CLIENT_COLORS = ["var(--color-berry)", "var(--color-teal)", "var(--color-dark-orange)", "var(--color-navy)", "var(--color-purple)", "var(--color-river)"];
const MAX_TITLE = 200;
const MAX_TEXT = 4000;

/** Talking to the client: requests, chats, reminders, the weekly update — anyone on the project but a viewer. */
const manages = (db: Db, me: Person, productKey: string) => {
  const product = productOf(db, productKey);
  check(me, "client.manage", { product });
  return product;
};
/** Who the client's people are, and their roles: whoever manages the project. */
const managesPeople = (db: Db, me: Person, productKey: string) => {
  const product = productOf(db, productKey);
  check(me, "client.people", { product });
  return product;
};
const roleOf = (v: unknown): ClientRole => {
  if (typeof v !== "string" || !CLIENT_ROLES.includes(v as ClientRole)) throw new ValidationError("Pick Sponsor, Product owner or Tester");
  return v as ClientRole;
};
const withClients = (db: Db, key: string, clients: Product["clients"]): Db =>
  ({ ...db, products: replace(db.products, (p) => p.key === key, (p) => ({ ...p, clients })) });
export const textOf = (label: string, v: unknown, max = MAX_TEXT) => {
  const text = typeof v === "string" ? v.trim() : "";
  fail(requiredError(label, text));
  fail(text.length > max ? `${label} is too long` : null);
  return text;
};
const spaceOn = (db: Db) => fail(db.org.clientSpace ? null : "Turn Client Space on first (Settings → Clients)");

/** A line in a chat. Events and files get an id here; what a person types arrives with the id the browser gave it. */
export function chatLine(productKey: string, subject: string, authorId: string, line: Partial<ClientMessage>): ClientMessage {
  return { id: newId(), productKey, subject, authorId, at: now(), body: "", ...line };
}
export const withLines = (db: Db, ...lines: ClientMessage[]): Db => ({ ...db, clientMessages: [...db.clientMessages, ...lines] });
export const eventLine = (productKey: string, subject: string, authorId: string, event: ClientEvent, rev?: number) =>
  chatLine(productKey, subject, authorId, { kind: "event", event, ...(rev && { rev }) });

/** Admins: Client Space on or off for the whole company. */
export function setClientSettings(db: Db, me: Person, patch: { clientSpace?: boolean }): Db {
  check(me, "org.manage", {});
  return patch.clientSpace === undefined ? db : { ...db, org: { ...db.org, clientSpace: !!patch.clientSpace } };
}

const COLOR_RE = /^(#[0-9a-f]{6}|var\(--color-[a-z_-]+\))$/i;
const MAX_PRIORITIES = 8;
const lookName = (label: string, v: unknown) => {
  const name = typeof v === "string" ? v.trim() : "";
  fail(name.length > 30 ? `${label}: keep it to 30 characters` : null);
  return name;
};
function phasesOf<K extends string>(given: unknown, keys: readonly K[]): Partial<Record<K, PhaseLook>> | undefined {
  if (!given || typeof given !== "object") return undefined;
  const out: Partial<Record<K, PhaseLook>> = {};
  for (const k of keys) {
    const v = (given as Record<string, PhaseLook | undefined>)[k];
    if (!v) continue;
    const name = lookName("A phase's name", v.name);
    const color = typeof v.color === "string" && COLOR_RE.test(v.color) ? v.color : undefined;
    fail(v.color && !color ? "Pick a colour from the list" : null);
    if (name || color) out[k] = { ...(name && { name }), ...(color && { color }) };
  }
  return Object.keys(out).length ? out : undefined;
}

/**
 * A project's own words and colours in its Client tab (the project's Settings): the phases of requirements and requests,
 * and the requirement priorities — whoever may change its board lists and ticket priorities. null puts the defaults
 * back. A priority still on one of its requirements can't be removed.
 */
export function setClientLook(db: Db, me: Person, productKey: string, patch: { phases?: ClientPhases | null; priorities?: PriorityDef[] | null }): Db {
  const product = productOf(db, productKey);
  check(me, "statuses.edit", { product });
  const next: Product = { ...product };
  if (patch.phases !== undefined) {
    const req = phasesOf(patch.phases?.req, REQUIREMENT_STATUSES);
    const ask = phasesOf(patch.phases?.ask, ASK_STATES);
    if (req || ask) next.clientPhases = { ...(req && { req }), ...(ask && { ask }) };
    else delete next.clientPhases;
  }
  if (patch.priorities !== undefined) {
    const given = Array.isArray(patch.priorities) ? patch.priorities : [];
    fail(given.length > MAX_PRIORITIES ? `At most ${MAX_PRIORITIES} priorities` : null);
    const list = given.map((p, i): PriorityDef => {
      const name = lookName("A priority's name", p?.name);
      fail(name ? null : "Give every priority a name");
      fail(typeof p?.id === "string" && /^[a-z0-9-]{1,24}$/.test(p.id) ? null : "That priority's id isn't right");
      fail(typeof p.color === "string" && COLOR_RE.test(p.color) ? null : "Pick a colour from the list");
      fail(given.findIndex((x) => x?.id === p.id) === i ? null : "Two priorities have the same id");
      return { id: p.id, name, color: p.color };
    });
    const kept = list.length ? list : DEFAULT_PRIORITIES;
    const orphan = db.requirements.find((r) => r.productKey === productKey && r.priority && !kept.some((p) => p.id === r.priority));
    fail(orphan ? `${orphan.code} is still “${priorityLook(lookOf(product), orphan.priority)?.name}” — change it first` : null);
    const same = kept.length === DEFAULT_PRIORITIES.length && kept.every((p, i) => stableEqual(p, DEFAULT_PRIORITIES[i]));
    if (same) delete next.requirementPriorities;
    else next.requirementPriorities = kept;
  }
  return { ...db, products: replace(db.products, (p) => p.key === productKey, () => next) };
}
const stableEqual = (a: PriorityDef, b: PriorityDef) => a.id === b.id && a.name === b.name && a.color === b.color;

/**
 * A client person on a project (server only: their login and sign-in link are made alongside). Someone already a
 * client here just gets the project; a teammate's email can't be a client's; someone switched off stays off unless an
 * admin adds them.
 */
export function addClientPerson(db: Db, me: Person, input: { id: string; name: string; email: string; company: string }, productKey: string, role: ClientRole): Db {
  const product = managesPeople(db, me, productKey);
  spaceOn(db);
  const email = String(input.email ?? "").trim().toLowerCase();
  fail(EMAIL_RE.test(email) ? null : "Enter a valid email address");
  fail(db.people.some((p) => p.email.toLowerCase() === email) ? "That's a teammate's email — a client needs their own" : null);
  const r = roleOf(role);
  const existing = db.clientPeople.find((c) => c.email.toLowerCase() === email);
  let next = db;
  let personId: string;
  if (existing) {
    personId = existing.id;
    fail(existing.active || can(me, "people.manage", {}) ? null : `${existing.name} is switched off — an admin can switch them back on (Settings → Clients)`);
    if (!existing.active) next = { ...next, clientPeople: replace(next.clientPeople, (c) => c.id === existing.id, (c) => ({ ...c, active: true })) };
  } else {
    fail(newIdError(input.id, db.clientPeople.some((c) => c.id === input.id) || db.people.some((p) => p.id === input.id)));
    const name = textOf("Name", input.name, 80);
    const company = typeof input.company === "string" ? input.company.trim().slice(0, 80) : "";
    personId = input.id;
    next = {
      ...next,
      clientPeople: [...next.clientPeople, {
        id: personId, name, initials: initialsOf(name), color: CLIENT_COLORS[next.clientPeople.length % CLIENT_COLORS.length],
        email, company: company || product.client || "", active: true,
      }],
    };
  }
  const others = (product.clients ?? []).filter((c) => c.personId !== personId);
  return withClients(next, productKey, [...others, { personId, role: r }]);
}

/**
 * Whether `me` may hand out a sign-in link for this client — which signs in as them, on every project they're on. So:
 * an admin, or someone who manages every one of those projects.
 */
export function checkMayLinkClient(db: Db, me: Person, clientId: string) {
  if (can(me, "people.manage", {})) return;
  const theirs = db.products.filter((p) => !p.archivedAt && p.clients?.some((c) => c.personId === clientId));
  if (theirs.some((p) => !can(me, "client.people", { product: p }))) {
    throw new ValidationError("They're also a client on a project you don't manage — ask an admin to send their link");
  }
}

/** A client person's role on a project — or, with null, off the project (their other projects stay). */
export function setProductClient(db: Db, me: Person, productKey: string, personId: string, role: ClientRole | null): Db {
  const product = managesPeople(db, me, productKey);
  fail(db.clientPeople.some((c) => c.id === personId) ? null : "That client isn't here");
  const others = (product.clients ?? []).filter((c) => c.personId !== personId);
  if (role === null) return withClients(db, productKey, others.length ? others : undefined);
  return withClients(db, productKey, [...others, { personId, role: roleOf(role) }]);
}

/** Admins switch a client person off (or back on): off, they can't sign in or see anything. */
export function setClientActive(db: Db, me: Person, personId: string, active: boolean): Db {
  check(me, "people.manage", {});
  fail(db.clientPeople.some((c) => c.id === personId) ? null : "That client isn't here");
  return { ...db, clientPeople: replace(db.clientPeople, (c) => c.id === personId, (c) => ({ ...c, active: !!active })) };
}

// ---------- requests: what the team needs from the client ----------

export interface AskInput { title: string; details?: string; kind?: AskKind; invite?: string | null; assigneeId?: string | null; due?: string | null }

/** Q1, Q2… — a project's requests, numbered like its tickets. */
export const nextAskCode = (db: Db, productKey: string) =>
  `Q${Math.max(0, ...db.asks.filter((a) => a.productKey === productKey).map((a) => Number(a.code.slice(1)) || 0)) + 1}`;

function askFields(product: Product, input: Partial<AskInput>, cur?: Ask): Ask {
  const out = { ...(cur ?? {}) } as Ask;
  if (input.title !== undefined || !cur) out.title = textOf("What you need", input.title, MAX_TITLE);
  if (input.details !== undefined) out.details = typeof input.details === "string" ? input.details.trim().slice(0, MAX_TEXT) : "";
  else if (!cur) out.details = "";
  if (input.kind !== undefined || !cur) {
    const kind = input.kind ?? "question";
    fail(ASK_KINDS.includes(kind) ? null : "Pick what kind of thing you need");
    out.kind = kind;
  }
  if (input.invite === null || input.invite === "") delete out.invite;
  else if (input.invite !== undefined) out.invite = String(input.invite).trim().slice(0, 200);
  if (input.assigneeId === null || input.assigneeId === "") delete out.assigneeId;
  else if (input.assigneeId !== undefined) {
    fail((product.clients ?? []).some((c) => c.personId === input.assigneeId) ? null : "They aren't a client on this project");
    out.assigneeId = input.assigneeId;
  }
  if (input.due === null || input.due === "") delete out.due;
  else if (input.due !== undefined) {
    fail(/^\d{4}-\d{2}-\d{2}$/.test(String(input.due)) ? null : "Pick a date");
    out.due = input.due;
  }
  return out;
}

/** A request to the client: its own chat, opening with its card. */
export function createAsk(db: Db, me: Person, productKey: string, input: AskInput, askId: string): Db {
  const product = manages(db, me, productKey);
  spaceOn(db);
  fail(newIdError(askId, db.asks.some((a) => a.id === askId)));
  const ask: Ask = { ...askFields(product, input), id: askId, productKey, code: nextAskCode(db, productKey), state: "open", createdBy: me.id, createdAt: now() };
  return withLines({ ...db, asks: [...db.asks, ask] }, eventLine(productKey, `ask:${askId}`, me.id, "asked"));
}

const askOf = (db: Db, askId: string) => {
  const a = db.asks.find((x) => x.id === askId);
  if (!a) throw new ValidationError("That request isn't here");
  return a;
};
const saveAsk = (db: Db, ask: Ask): Db => ({ ...db, asks: replace(db.asks, (a) => a.id === ask.id, () => ask) });

export function updateAsk(db: Db, me: Person, askId: string, patch: Partial<AskInput>): Db {
  const cur = askOf(db, askId);
  const product = manages(db, me, cur.productKey);
  return saveAsk(db, askFields(product, patch, cur));
}

/** The team closes it (done), calls it off (cancelled), or opens it again. */
export function setAskState(db: Db, me: Person, askId: string, state: "done" | "cancelled" | "open"): Db {
  const cur = askOf(db, askId);
  manages(db, me, cur.productKey);
  fail(["done", "cancelled", "open"].includes(state) ? null : "That isn't a state a request can be in");
  fail(cur.state === state ? "It's like that already" : null);
  const next: Ask = { ...cur, state };
  if (state === "open") delete next.closedAt;
  else next.closedAt = now();
  const event = state === "open" ? "reopened" : state;
  return withLines(saveAsk(db, next), eventLine(cur.productKey, `ask:${askId}`, me.id, event));
}

// ---------- chats ----------

/** "chat:<key>", "req:<id>" or "ask:<id>": the product it belongs to, or a refusal. */
export function subjectProduct(db: Db, subject: unknown): string {
  const [kind, id] = typeof subject === "string" ? subject.split(":") : [];
  if (kind === "chat") {
    if (!db.products.some((p) => p.key === id)) throw new ValidationError("That chat isn't here");
    return id;
  }
  const found = kind === "req" ? db.requirements.find((r) => r.id === id) : kind === "ask" ? db.asks.find((a) => a.id === id) : undefined;
  if (!found) throw new ValidationError("That chat isn't here");
  return found.productKey;
}

/** A chat the client can't see (a team draft's): whatever the team writes there stays a note, even once it's shared. */
const teamOnly = (db: Db, subject: string) => {
  const [kind, id] = subject.split(":");
  const r = kind === "req" ? db.requirements.find((x) => x.id === id) : undefined;
  return !!r && !clientCanSee(r);
};

/** A reply quotes a message in the same chat. */
export function replyData(db: Db, subject: string, replyTo: unknown): ClientMessageData | undefined {
  if (replyTo === undefined || replyTo === null || replyTo === "") return undefined;
  fail(db.clientMessages.some((m) => m.id === replyTo && m.subject === subject) ? null : "That message isn't in this chat");
  return { replyTo: String(replyTo) };
}

/**
 * The team writes in a chat. To the client: whoever manages the project (one voice). A note (`note: true`): anyone on
 * the project — the client never sees it.
 */
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** What a chat is called in a notice: "the Northwind chat", "R3", "Q1". */
const chatLabel = (db: Db, subject: string) => {
  const [kind, id] = subject.split(":");
  if (kind === "req") return db.requirements.find((r) => r.id === id)?.code ?? "a requirement";
  if (kind === "ask") return db.asks.find((a) => a.id === id)?.code ?? "a request";
  const p = db.products.find((x) => x.key === id);
  return `the ${p?.client || p?.name || id} chat`;
};
/**
 * The teammates a chat line @mentions — by full name, @Team (its people on the project) or @everyone (the team on the
 * project); @@ makes it urgent. Told in their inbox, never the author. Shared by the team's lines and the client's.
 */
export function chatMentions(db: Db, authorId: string, product: Product, subject: string, body: string): Notification[] {
  const onIt = db.people.filter((p) => p.id !== authorId && p.active && !!p.panel && isOnProduct(p.id, product));
  const marks = (name: string) => [...body.matchAll(new RegExp(`(?:^|[^@\\w])(@@?)${escapeRe(name)}(?![\\w])`, "giu"))].map((m) => m[1]);
  const told = new Map<string, boolean>(); // person → urgent
  const tell = (ids: string[], found: string[]) => { if (found.length) for (const pid of ids) told.set(pid, told.get(pid) || found.includes("@@")); };
  tell(onIt.map((p) => p.id), marks("everyone"));
  for (const t of db.teams) tell(onIt.filter((p) => p.team === t.id).map((p) => p.id), marks(t.name));
  for (const p of onIt) tell([p.id], marks(p.name));
  const at = now();
  const target = `/products/${product.key}/requirements?t=${encodeURIComponent(subject)}`;
  return [...told].map(([personId, urgent]) => ({
    id: newId(), personId, kind: "mention" as const, actorId: authorId, text: `mentioned you in ${chatLabel(db, subject)}`, target, at, read: false, ...(urgent && { urgent: true }),
  }));
}
const withNotices = (db: Db, notices: Notification[]): Db => (notices.length ? { ...db, notifications: [...notices, ...db.notifications] } : db);

export function postThreadMessage(db: Db, me: Person, subject: string, body: string, messageId: string, opts: { note?: boolean; replyTo?: string | null } = {}): Db {
  const productKey = subjectProduct(db, subject);
  const product = productOf(db, productKey);
  const note = !!opts?.note || teamOnly(db, subject);
  if (note) check(me, "product.view", { product });
  else { check(me, "client.manage", { product }); spaceOn(db); }
  fail(newIdError(messageId, db.clientMessages.some((m) => m.id === messageId)));
  const data = replyData(db, subject, opts?.replyTo);
  const line = { ...chatLine(productKey, subject, me.id, { body: textOf("A message", body), ...(note && { kind: "note" as const }), ...(data && { data }) }), id: messageId };
  return withNotices(withLines(db, line), chatMentions(db, me.id, product, subject, line.body));
}

/** A file in a chat (server only: the bytes are stored first, by the upload). */
export function addThreadFile(db: Db, me: Person, subject: string, file: ThreadFile, opts: { note?: boolean; body?: string } = {}): Db {
  const productKey = subjectProduct(db, subject);
  const product = productOf(db, productKey);
  const note = !!opts.note || teamOnly(db, subject);
  check(me, note ? "product.view" : "client.manage", { product });
  if (!note) spaceOn(db);
  const caption = typeof opts.body === "string" ? opts.body.trim().slice(0, MAX_TEXT) : "";
  return withLines(db, chatLine(productKey, subject, me.id, { kind: note ? "note" : "file", body: caption, data: { file } }));
}

/** A nudge for something waiting on the client — emailed to them, and a line in the chat. */
export function remindClient(db: Db, me: Person, subject: string): Db {
  const productKey = subjectProduct(db, subject);
  manages(db, me, productKey);
  spaceOn(db);
  const [kind, id] = subject.split(":");
  const waiting = kind === "req" ? statusOfRequirement(db.requirements.find((r) => r.id === id)!) === "to_confirm"
    : kind === "ask" && db.asks.find((a) => a.id === id)!.state === "open";
  fail(waiting ? null : "Nothing here is waiting on the client");
  return withLines(db, eventLine(productKey, subject, me.id, "reminded"));
}

/** The weekly update: how it's going, what's next, what's needed from them — in the project's chat. */
export function postUpdate(db: Db, me: Person, productKey: string, input: { week: string; next?: string; needs?: string }, messageId: string): Db {
  const product = manages(db, me, productKey);
  spaceOn(db);
  fail(newIdError(messageId, db.clientMessages.some((m) => m.id === messageId)));
  const line = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, MAX_UPDATE) : "");
  const update = { health: product.health, stage: product.stage, week: textOf("This week", input?.week, MAX_UPDATE), next: line(input?.next), needs: line(input?.needs) };
  return withLines(db, { ...chatLine(productKey, `chat:${productKey}`, me.id, { kind: "update", data: { update } }), id: messageId });
}
export const MAX_UPDATE = 2000; // each part of the weekly update

const WEEK_MS = 7 * 86_400_000;
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const shortDay = (day: string) => `${MONTH[Number(day.slice(5, 7)) - 1]} ${Number(day.slice(8, 10))}`;
/**
 * The weekly update, drafted from the week's work — requirements the client confirmed and tickets finished in the last
 * seven days, what's being worked on, and what the client still owes — as Markdown lists, for the team to word before
 * it's sent (the client sees exactly what's sent: ticket titles included).
 */
export function weekDraft(db: Db, productKey: string, now: string): { week: string; next: string; needs: string } {
  const since = Date.parse(now) - WEEK_MS;
  const statuses = db.statusesByProduct[productKey] ?? [];
  const tone = (statusId: string) => statuses.find((s) => s.id === statusId)?.tone;
  const tickets = db.tickets.filter((t) => t.productKey === productKey && !t.archivedAt && t.type !== "epic");
  const finished = tickets.filter((t) => tone(t.statusId) === "done"
    && db.activity.some((a) => a.ticketKey === t.key && a.field === "Status" && Date.parse(a.at) >= since));
  const confirmed = db.requirements.filter((r) => r.productKey === productKey && r.confirmed && Date.parse(r.confirmed.at) >= since);
  const doing = tickets.filter((t) => tone(t.statusId) === "working" || tone(t.statusId) === "review");
  const owed = db.asks.filter((a) => a.productKey === productKey && a.state === "open");
  const list = (items: string[], max = 6) => [...items.slice(0, max), ...(items.length > max ? [`and ${items.length - max} more`] : [])].map((x) => `- ${x}`).join("\n");
  return {
    week: list([...confirmed.map((r) => `${r.title} — confirmed`), ...finished.map((t) => t.title)]),
    next: list(doing.map((t) => t.title)),
    needs: list(owed.map((a) => `${a.title}${a.due ? ` — by ${shortDay(a.due)}` : ""}`)),
  };
}

// ---------- after a line is sent: delete, star, pin, read (commands/chat.ts) ----------

/** A line in a chat `me` can see: anyone on the project sees its chats, notes included. */
const lineFor = (db: Db, me: Person, messageId: unknown) => {
  const m = messageIn(db, messageId);
  const product = productOf(db, m.productKey);
  check(me, "product.view", { product });
  return { m, product };
};
export function deleteChatMessage(db: Db, me: Person, messageId: string, everyone: boolean): Db {
  return deleteLine(db, me.id, lineFor(db, me, messageId).m, !!everyone, now());
}
export function starChatMessage(db: Db, me: Person, messageId: string, on: boolean): Db {
  return starLine(db, me.id, lineFor(db, me, messageId).m, !!on);
}
/** Pinned for everyone in the chat: a line both sides see is the client's chat too, so it's whoever talks to them. */
export function pinChatMessage(db: Db, me: Person, messageId: string, on: boolean): Db {
  const { m, product } = lineFor(db, me, messageId);
  if (m.kind !== "note") check(me, "client.manage", { product });
  return pinLine(db, me.id, m, !!on, now());
}
export function readChat(db: Db, me: Person, subject: string, at: string): Db {
  check(me, "product.view", { product: productOf(db, subjectProduct(db, subject)) });
  return readLine(db, me.id, subject, typeof at === "string" ? at : "");
}

// ---------- sending requirements to the client ----------

const requirementOf = (db: Db, id: string) => {
  const r = db.requirements.find((x) => x.id === id);
  if (!r) throw new ValidationError("Requirement not found");
  return r;
};
const saveRequirement = (db: Db, r: Requirement): Db => ({ ...db, requirements: replace(db.requirements, (x) => x.id === r.id, () => r) });

/** For the client to confirm: their chat shows its card with Confirm. The project needs a Sponsor or Product owner. */
export function sendRequirementToClient(db: Db, me: Person, requirementId: string): Db {
  const cur = requirementOf(db, requirementId);
  const product = productOf(db, cur.productKey);
  check(me, "requirement.edit", { product });
  spaceOn(db);
  fail((product.clients ?? []).some((c) => c.role !== "tester" && db.clientPeople.find((p) => p.id === c.personId)?.active)
    ? null : "Add the client's Sponsor or Product owner first (in the project chat's details)");
  const status = statusOfRequirement(cur);
  fail(status === "draft" || status === "changes_requested" ? null : `${cur.code} isn't a draft`);
  const at = now();
  const next = saveRequirement(db, { ...cur, status: "to_confirm", sharedAt: cur.sharedAt ?? at, updatedAt: at });
  const sent = { title: cur.title, description: cur.description ?? "", criteria: (cur.criteria ?? []).map((c) => c.text) }; // kept in the chat as sent
  return withLines(next, { ...eventLine(cur.productKey, `req:${cur.id}`, me.id, "sent", cur.rev ?? 1), data: { sent } });
}

/** A requirement the client suggested, taken on: a draft the team now writes up (or drops, with why). */
export function acceptProposal(db: Db, me: Person, requirementId: string): Db {
  const cur = requirementOf(db, requirementId);
  check(me, "requirement.edit", { product: productOf(db, cur.productKey) });
  fail(statusOfRequirement(cur) === "proposed" ? null : `${cur.code} wasn't suggested by the client`);
  return withLines(saveRequirement(db, { ...cur, status: "draft", updatedAt: now() }), eventLine(cur.productKey, `req:${cur.id}`, me.id, "taken"));
}
