// What a client person can do (Client Space), and nothing else: confirm a requirement or ask for changes, suggest one,
// answer a request or mark it done, and write in the chats they can see. A registry of its own — the team's commands
// are never reachable from a client, and these are never reachable from the team's browser. Each one leaves a line in
// its chat and tells the project's managers (and a request's creator) in their 1Fold inbox.
import type { Db } from "../../data/db.ts";
import { now } from "../clock.ts";
import { clientCanSee, clientCanSeeAsk } from "../clientView.ts";
import { nextRequirementCode, statusOfRequirement } from "../selectors/requirements.ts";
import type { ClientMessage, ClientPerson, ClientRole, Notification, Product, ThreadFile } from "../types.ts";
import { AccessError, fail, id as newId, newIdError, replace, ValidationError } from "./shared.ts";
import { deleteLine, messageIn, pinLine, readLine, starLine } from "./chat.ts";
import { chatLine, chatMentions, eventLine, replyData, subjectProduct, textOf, withLines } from "./clients.ts";

const DECIDES: ClientRole[] = ["sponsor", "owner"]; // confirm, ask for changes, suggest

/** The project, if this client may act on it (Client Space on, they're active and on it, in one of `roles`). */
function onProject(db: Db, me: ClientPerson, productKey: string, roles?: ClientRole[]): { product: Product; role: ClientRole } {
  const product = db.products.find((p) => p.key === productKey && !p.archivedAt);
  const role = product?.clients?.find((c) => c.personId === me.id)?.role;
  if (!db.org.clientSpace || !me.active || !product || !role) throw new AccessError();
  if (roles && !roles.includes(role)) throw new AccessError();
  return { product, role };
}

/** The project's managers, and anyone else named, told what the client did (the inbox puts their name first). */
function tell(db: Db, me: ClientPerson, product: Product, text: string, subject: string, also: string[] = []): Notification[] {
  const to = [...new Set([product.pmId, product.projectManagerId, ...also])].filter((pid) => db.people.some((p) => p.id === pid && p.active));
  const at = now();
  const target = `/products/${product.key}/requirements?t=${encodeURIComponent(subject)}`;
  return to.map((personId) => ({ id: newId(), personId, kind: "client" as const, actorId: me.id, text, target, at, read: false }));
}
const told = (db: Db, notes: Notification[]): Db => ({ ...db, notifications: [...notes, ...db.notifications] });

const requirementFor = (db: Db, requirementId: string) => {
  const r = db.requirements.find((x) => x.id === requirementId);
  if (!r || !clientCanSee(r)) throw new ValidationError("That requirement isn't here");
  return r;
};

/** Confirmed: by whom, when, and the words as they read — kept even if they change later. */
export function confirmRequirement(db: Db, me: ClientPerson, requirementId: string): Db {
  const r = requirementFor(db, requirementId);
  const { product } = onProject(db, me, r.productKey, DECIDES);
  fail(statusOfRequirement(r) === "to_confirm" || statusOfRequirement(r) === "changes_requested" ? null : `${r.code} isn't waiting for you`);
  const at = now();
  const rev = r.rev ?? 1;
  const next = { ...r, status: "confirmed" as const, updatedAt: at, confirmed: { rev, title: r.title, description: r.description ?? "", criteria: r.criteria ?? [], by: me.id, at } };
  const subject = `req:${r.id}`;
  return told(withLines({ ...db, requirements: replace(db.requirements, (x) => x.id === r.id, () => next) }, eventLine(r.productKey, subject, me.id, "confirmed", rev)),
    tell(db, me, product, `confirmed ${r.code} · ${r.title}`, subject));
}

/** Not quite: it goes back to the team with what to change, in its chat. */
export function requestRequirementChanges(db: Db, me: ClientPerson, requirementId: string, body: string, messageId: string): Db {
  const r = requirementFor(db, requirementId);
  const { product } = onProject(db, me, r.productKey, DECIDES);
  fail(statusOfRequirement(r) === "to_confirm" ? null : `${r.code} isn't waiting for you`);
  fail(newIdError(messageId, db.clientMessages.some((m) => m.id === messageId)));
  const subject = `req:${r.id}`;
  const text: ClientMessage = { ...chatLine(r.productKey, subject, me.id, { body: textOf("What to change", body) }), id: messageId };
  const next = { ...db, requirements: replace(db.requirements, (x) => x.id === r.id, (x) => ({ ...x, status: "changes_requested" as const, updatedAt: now() })) };
  return told(withLines(next, eventLine(r.productKey, subject, me.id, "changes"), text), tell(db, me, product, `asked for changes to ${r.code} · ${r.title}`, subject));
}

/** Something the client wants: the team reviews it (takes it on as a draft, or drops it with why). */
export function proposeRequirement(db: Db, me: ClientPerson, productKey: string, input: { title: string; details?: string }, requirementId: string): Db {
  const { product } = onProject(db, me, productKey, DECIDES);
  fail(newIdError(requirementId, db.requirements.some((r) => r.id === requirementId)));
  const title = textOf("What you need", input?.title, 200);
  const details = typeof input?.details === "string" ? input.details.trim().slice(0, 4000) : "";
  const at = now();
  const code = nextRequirementCode(db, productKey);
  const subject = `req:${requirementId}`;
  const next = {
    ...db,
    requirements: [...db.requirements, {
      id: requirementId, productKey, code, title, ...(details && { description: details }),
      status: "proposed" as const, rev: 1, proposedBy: me.id, sharedAt: at, createdAt: at, createdBy: me.id, updatedAt: at,
    }],
  };
  return told(withLines(next, eventLine(productKey, subject, me.id, "proposed")), tell(db, me, product, `suggested ${code} · ${title}`, subject));
}

const askFor = (db: Db, me: ClientPerson, askId: string) => {
  const a = db.asks.find((x) => x.id === askId);
  if (!a) throw new ValidationError("That isn't here");
  const { product, role } = onProject(db, me, a.productKey);
  if (!clientCanSeeAsk(a, me.id, role)) throw new ValidationError("That isn't here");
  return { ask: a, product, role };
};

/** The request answered, with what answered it (a message, or a file). */
function answered(db: Db, me: ClientPerson, askId: string, line: ClientMessage): Db {
  const ask = db.asks.find((a) => a.id === askId)!;
  if (ask.state !== "open") return withLines(db, line);
  const next = { ...db, asks: replace(db.asks, (a) => a.id === askId, (a) => ({ ...a, state: "answered" as const, answeredBy: me.id, answeredAt: now() })) };
  return withLines(next, line, eventLine(ask.productKey, `ask:${askId}`, me.id, "answered"));
}

/** An answer: a message in the request's chat, and the request is answered (the team closes it). */
export function answerAsk(db: Db, me: ClientPerson, askId: string, body: string, messageId: string): Db {
  const { ask, product } = askFor(db, me, askId);
  fail(ask.state === "cancelled" || ask.state === "done" ? "That's closed already" : null);
  fail(newIdError(messageId, db.clientMessages.some((m) => m.id === messageId)));
  const subject = `ask:${ask.id}`;
  const text: ClientMessage = { ...chatLine(ask.productKey, subject, me.id, { body: textOf("Your answer", body) }), id: messageId };
  return told(answered(db, me, ask.id, text), tell(db, me, product, `answered ${ask.code} · ${ask.title}`, subject, [ask.createdBy]));
}

/** Done from their side — access granted, file sent — without writing anything. */
export function completeAsk(db: Db, me: ClientPerson, askId: string): Db {
  const { ask, product } = askFor(db, me, askId);
  fail(ask.state === "cancelled" || ask.state === "done" ? "That's closed already" : null);
  const at = now();
  const subject = `ask:${ask.id}`;
  const next = { ...db, asks: replace(db.asks, (a) => a.id === ask.id, (a) => ({ ...a, state: "done" as const, answeredBy: a.answeredBy ?? me.id, answeredAt: a.answeredAt ?? at, closedAt: at })) };
  return told(withLines(next, eventLine(ask.productKey, subject, me.id, "done")), tell(db, me, product, `marked ${ask.code} · ${ask.title} done`, subject, [ask.createdBy]));
}

/** Which chat this is, if the client can see it — else a refusal. */
function chatFor(db: Db, me: ClientPerson, subject: string) {
  const productKey = subjectProduct(db, subject);
  const { product, role } = onProject(db, me, productKey);
  const [kind, sid] = subject.split(":");
  if (kind === "req") requirementFor(db, sid);
  else if (kind === "ask" && !clientCanSeeAsk(db.asks.find((a) => a.id === sid)!, me.id, role)) throw new ValidationError("That isn't here");
  const label = kind === "chat" ? "the project chat" : kind === "req" ? db.requirements.find((r) => r.id === sid)!.code : db.asks.find((a) => a.id === sid)!.code;
  return { product, productKey, kind, sid, label };
}

/** A message in a chat they can see: the project's, or a requirement's or request's. */
export function postMessage(db: Db, me: ClientPerson, subject: string, body: string, messageId: string, replyTo?: string | null): Db {
  const { product, productKey } = chatFor(db, me, subject);
  fail(newIdError(messageId, db.clientMessages.some((m) => m.id === messageId)));
  const data = replyData(db, subject, replyTo);
  if (data && db.clientMessages.find((m) => m.id === data.replyTo)?.kind === "note") throw new ValidationError("That message isn't in this chat");
  const line: ClientMessage = { ...chatLine(productKey, subject, me.id, { body: textOf("A message", body), ...(data && { data }) }), id: messageId };
  // A chat line isn't news: the team hears a tone. Only someone it @mentions gets a notice.
  const notices = chatMentions(db, me.id, product, subject, line.body);
  return notices.length ? told(withLines(db, line), notices) : withLines(db, line);
}

/**
 * A file they sent (server only: stored first, by the upload). In an open request's chat it answers the request — a
 * logo for "Your logo as an SVG".
 */
export function sendClientFile(db: Db, me: ClientPerson, subject: string, file: ThreadFile, body?: string): Db {
  const { product, productKey, kind, sid } = chatFor(db, me, subject);
  const caption = typeof body === "string" ? body.trim().slice(0, 4000) : "";
  const line = chatLine(productKey, subject, me.id, { kind: "file", body: caption, data: { file } });
  if (kind !== "ask") return withLines(db, line); // a chat line: a tone for the team, not a notification
  const ask = db.asks.find((a) => a.id === sid)!;
  const next = answered(db, me, sid, line);
  return ask.state === "open" ? told(next, tell(db, me, product, `answered ${ask.code} · ${ask.title} with ${file.name}`, subject, [ask.createdBy])) : next;
}

// ---------- after a line is sent: delete, star, pin, read (commands/chat.ts) ----------

/** A line in a chat they can see — never one of the team's notes. */
function lineFor(db: Db, me: ClientPerson, messageId: unknown): ClientMessage {
  const m = messageIn(db, messageId);
  if (m.kind === "note") throw new ValidationError("That message isn't here");
  chatFor(db, me, m.subject);
  return m;
}
export function deleteMessage(db: Db, me: ClientPerson, messageId: string, everyone: boolean): Db {
  return deleteLine(db, me.id, lineFor(db, me, messageId), !!everyone, now());
}
export function starMessage(db: Db, me: ClientPerson, messageId: string, on: boolean): Db {
  return starLine(db, me.id, lineFor(db, me, messageId), !!on);
}
export function pinMessage(db: Db, me: ClientPerson, messageId: string, on: boolean): Db {
  return pinLine(db, me.id, lineFor(db, me, messageId), !!on, now());
}
export function readChat(db: Db, me: ClientPerson, subject: string, at: string): Db {
  chatFor(db, me, subject);
  return readLine(db, me.id, subject, typeof at === "string" ? at : "");
}

export const clientActions = {
  confirmRequirement, requestRequirementChanges, proposeRequirement, answerAsk, completeAsk, postMessage,
  deleteMessage, starMessage, pinMessage, readChat,
};
export type ClientActionName = keyof typeof clientActions;
