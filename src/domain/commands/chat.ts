// What happens to a chat line after it's sent, as on WhatsApp: deleted for everyone (by who wrote it) or just for
// yourself, starred (only you see your stars), pinned to the top of the chat for everyone (three at most — a fourth
// unpins the oldest), and read (the ticks, and unread counts on any device). Shared by the team's commands and the
// client's actions: each checks who may reach the chat first, then calls these. Lines from 1Fold itself ("sent this
// to confirm") stay as they are.
import type { Db } from "../../data/db.ts";
import type { ChatRead, ClientMessage } from "../types.ts";
import { fail, replace, ValidationError } from "./shared.ts";

export const MAX_PINS = 3;

export function messageIn(db: Db, messageId: unknown): ClientMessage {
  const m = typeof messageId === "string" ? db.clientMessages.find((x) => x.id === messageId) : undefined;
  if (!m) throw new ValidationError("That message isn't here");
  return m;
}
const save = (db: Db, m: ClientMessage): Db => ({ ...db, clientMessages: replace(db.clientMessages, (x) => x.id === m.id, () => m) });
const unpinned = (m: ClientMessage): ClientMessage => {
  const next = { ...m };
  delete next.pinnedAt;
  delete next.pinnedBy;
  return next;
};

/** Deleted for everyone ("This message was deleted"), or — `everyone` false — gone for `actorId` only. */
export function deleteLine(db: Db, actorId: string, m: ClientMessage, everyone: boolean, at: string): Db {
  fail(m.kind === "event" ? "This line can't be deleted" : null);
  if (!everyone) {
    fail(m.hiddenFor?.includes(actorId) ? "It's gone for you already" : null);
    return save(db, { ...m, hiddenFor: [...(m.hiddenFor ?? []), actorId] });
  }
  fail(m.authorId === actorId ? null : "Only whoever wrote it can delete it for everyone");
  fail(m.deletedAt ? "It's deleted already" : null);
  return save(db, { ...unpinned(m), deletedAt: at });
}

/** A star only `actorId` sees — to find it again. */
export function starLine(db: Db, actorId: string, m: ClientMessage, on: boolean): Db {
  if (!!m.starredBy?.includes(actorId) === !!on) return db;
  const starredBy = on ? [...(m.starredBy ?? []), actorId] : (m.starredBy ?? []).filter((p) => p !== actorId);
  const next: ClientMessage = { ...m, starredBy };
  if (!starredBy.length) delete next.starredBy;
  return save(db, next);
}

/** Pinned to the top of its chat for everyone in it; a fourth pin unpins the oldest. */
export function pinLine(db: Db, actorId: string, m: ClientMessage, on: boolean, at: string): Db {
  fail(m.kind === "event" || m.deletedAt ? "This line can't be pinned" : null);
  if (!!m.pinnedAt === !!on) return db;
  if (!on) return save(db, unpinned(m));
  const pinned = db.clientMessages.filter((x) => x.subject === m.subject && x.pinnedAt).sort((a, b) => a.pinnedAt!.localeCompare(b.pinnedAt!));
  const next = pinned.length >= MAX_PINS ? save(db, unpinned(pinned[0])) : db;
  return save(next, { ...m, pinnedAt: at, pinnedBy: actorId });
}

/** `actorId` has read `subject` up to `at` (its latest line). Never moves back. */
export function readLine(db: Db, actorId: string, subject: string, at: string): Db {
  fail(Number.isNaN(Date.parse(at)) ? "That isn't a time" : null);
  const cur = db.chatReads.find((r) => r.personId === actorId && r.subject === subject);
  if (cur && Date.parse(cur.at) >= Date.parse(at)) return db;
  const read: ChatRead = { personId: actorId, subject, at };
  return { ...db, chatReads: cur ? replace(db.chatReads, (r) => r === cur, () => read) : [...db.chatReads, read] };
}

/** Whether `personId` sees this line at all: not once they deleted it for themselves. */
export const seesLine = (m: ClientMessage, personId: string) => !m.hiddenFor?.includes(personId);
/** A line as `personId` sees it: a deleted one keeps only that it was (no words, no file); only their own star; and
 *  nobody's list of who deleted it for themselves. */
export function lineAsSeenBy(m: ClientMessage, personId: string): ClientMessage {
  const out: ClientMessage = { ...m };
  delete out.hiddenFor;
  if (m.starredBy?.includes(personId)) out.starredBy = [personId];
  else delete out.starredBy;
  if (m.deletedAt) { out.body = ""; delete out.data; }
  return out;
}

/** The product a chat belongs to ("chat:AP", a requirement's, a request's), or undefined. */
export function chatProduct(db: Db, subject: string): string | undefined {
  const [kind, id] = subject.split(":");
  if (kind === "chat") return id;
  if (kind === "req") return db.requirements.find((r) => r.id === id)?.productKey;
  if (kind === "ask") return db.asks.find((a) => a.id === id)?.productKey;
  return undefined;
}
