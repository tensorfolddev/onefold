// The Client tab as one shape for both sides: a project, its people, and its chats — the project's own, one per
// requirement, one per request — each with its messages, its card and whose move it is. teamRoom builds it from the
// team's data; clientRoom from what a client receives (domain/clientView.ts). One screen renders either.
import type { Db } from "../../data/db.ts";
import { clientCanSee, type ClientView } from "../clientView.ts";
import type {
  AskKind, AskState, ChatRead, ClientEvent, ClientMessageData, ClientMessageKind, ClientRole, Health, Person, ProductClient, ProductIcon,
  RequirementPriority, RequirementStatus, SectionItem, Stage, Tone,
} from "../types.ts";
import { isOnProduct } from "../permissions.ts";
import { lookOf, type ClientLook } from "./clientLook.ts";
import { requirementProgress, statusOfRequirement } from "./requirements.ts";

export type Side = "team" | "client";
export type ThreadKind = "chat" | "req" | "ask";
export interface RoomPerson { id: string; name: string; initials: string; color: string; photo?: string; title?: string; side: Side; role?: ClientRole; company?: string }
export interface RoomMessage {
  id: string; authorId: string; at: string; kind: ClientMessageKind; body: string; event?: ClientEvent; rev?: number; data?: ClientMessageData; via?: "whatsapp" | "email";
  deletedAt?: string; starred?: boolean; pinnedAt?: string; pinnedBy?: string;
}
export interface RoomTicket { key: string; title: string; status: string; tone: Tone }
export interface RoomRequirement {
  id: string; code: string; title: string; description: string; criteria: SectionItem[]; status: RequirementStatus; rev: number;
  priority?: RequirementPriority; confirmed?: { by: string; at: string; rev: number }; beingUpdated?: boolean;
  progress: { done: number; doing: number; total: number }; proposedBy?: string; droppedReason?: string;
  tickets?: RoomTicket[]; // the team's side only
}
export interface RoomAsk {
  id: string; code: string; title: string; details: string; kind: AskKind; state: AskState; invite?: string; assigneeId?: string; due?: string;
  createdBy: string; createdAt: string;
}
export interface RoomThread {
  subject: string; kind: ThreadKind; key: string; title: string;
  requirement?: RoomRequirement; ask?: RoomAsk;
  messages: RoomMessage[];
  internal: boolean; // the client doesn't see it (a team draft)
  lastAt: string;
}
export interface RoomModel {
  side: Side; meId: string; myRole?: ClientRole; companyName: string;
  project: { key: string; name: string; color: string; icon?: ProductIcon; client?: string; health: Health; stage: Stage };
  clientFacing: boolean; // Client Space is on and it's a client's project: the team talks to them here
  clients: ProductClient[];
  people: Record<string, RoomPerson>;
  threads: RoomThread[];
  /** When people last read each chat: mine (unread counts) and the other side's (the read ticks). */
  reads: ChatRead[];
  /** The project's own phase names, colours and priorities. */
  look: ClientLook;
  /** Who an @ in this room can name: people, teams (the team's side), everyone. */
  mentionables: Mentionable[];
}
export interface Mentionable { name: string; hint: string; id?: string } // id: a person (not a team, not everyone)
const EVERYONE: Mentionable = { name: "everyone", hint: "Everyone on the team" };

/** A line as the room shows it, from either side's data. */
const lineOf = (m: { id: string; authorId: string; at: string; kind?: string; body: string; event?: ClientEvent; rev?: number; data?: ClientMessageData; via?: "whatsapp" | "email"; deletedAt?: string; pinnedAt?: string; pinnedBy?: string }, starred: boolean): RoomMessage => ({
  id: m.id, authorId: m.authorId, at: m.at, kind: (m.kind ?? "text") as ClientMessageKind, body: m.body, ...(m.event && { event: m.event }), ...(m.rev && { rev: m.rev }),
  ...(m.data && { data: m.data }), ...(m.via && { via: m.via }), ...(m.deletedAt && { deletedAt: m.deletedAt }), ...(starred && { starred: true }),
  ...(m.pinnedAt && { pinnedAt: m.pinnedAt, ...(m.pinnedBy && { pinnedBy: m.pinnedBy }) }),
});

const lastOf = (messages: RoomMessage[], fallback: string) => messages.at(-1)?.at ?? fallback;
const sortThreads = (threads: RoomThread[]) => threads.sort((a, b) => (a.kind === "chat" ? -1 : b.kind === "chat" ? 1 : b.lastAt.localeCompare(a.lastAt)));

/** The team's room for a project, or null if it isn't theirs to open. */
export function teamRoom(db: Db, me: Person, productKey: string): RoomModel | null {
  const product = db.products.find((p) => p.key === productKey);
  if (!product) return null;
  const people: Record<string, RoomPerson> = {};
  for (const p of db.people) people[p.id] = { id: p.id, name: p.name, initials: p.initials, color: p.color, side: "team", title: p.role, ...(p.photo && { photo: p.photo }) };
  const roles = new Map((product.clients ?? []).map((c) => [c.personId, c.role]));
  for (const c of db.clientPeople) {
    people[c.id] = { id: c.id, name: c.name, initials: c.initials, color: c.color, side: "client", ...(c.company && { company: c.company }), ...(roles.get(c.id) && { role: roles.get(c.id) }) };
  }
  const bySubject = new Map<string, RoomMessage[]>();
  for (const m of db.clientMessages) {
    if (m.productKey !== productKey) continue;
    const list = bySubject.get(m.subject) ?? [];
    list.push(lineOf(m, !!m.starredBy?.includes(me.id)));
    bySubject.set(m.subject, list);
  }
  const statusOf = (statusId: string) => Object.values(db.statusesByProduct).flat().find((s) => s.id === statusId);
  const created = product.createdAt;
  const threads: RoomThread[] = [];
  const chat = `chat:${productKey}`;
  threads.push({ subject: chat, kind: "chat", key: "", title: product.name, messages: bySubject.get(chat) ?? [], internal: false, lastAt: lastOf(bySubject.get(chat) ?? [], created) });
  for (const r of db.requirements.filter((x) => x.productKey === productKey && !x.archivedAt)) { // archived: Settings → Archived
    const subject = `req:${r.id}`;
    const messages = bySubject.get(subject) ?? [];
    const p = requirementProgress(db, r);
    const tickets = db.tickets.filter((t) => t.requirementId === r.id && !t.archivedAt).map((t) => {
      const s = statusOf(t.statusId);
      return { key: t.key, title: t.title, status: s?.name ?? "", tone: (s?.tone ?? "backlog") as Tone };
    });
    threads.push({
      subject, kind: "req", key: r.code, title: r.title, messages, internal: !clientCanSee(r), lastAt: lastOf(messages, r.updatedAt ?? r.createdAt ?? created),
      requirement: {
        id: r.id, code: r.code, title: r.title, description: r.description ?? "", criteria: r.criteria ?? [], status: statusOfRequirement(r), rev: r.rev ?? 1,
        ...(r.priority && { priority: r.priority }), ...(r.confirmed && { confirmed: { by: r.confirmed.by, at: r.confirmed.at, rev: r.confirmed.rev } }),
        progress: { done: p.done, doing: p.doing, total: p.total }, ...(r.proposedBy && { proposedBy: r.proposedBy }),
        ...(r.droppedReason && { droppedReason: r.droppedReason }), tickets,
      },
    });
  }
  for (const a of db.asks.filter((x) => x.productKey === productKey)) {
    const subject = `ask:${a.id}`;
    const messages = bySubject.get(subject) ?? [];
    threads.push({ subject, kind: "ask", key: a.code, title: a.title, messages, internal: false, lastAt: lastOf(messages, a.createdAt), ask: { ...a } });
  }
  return {
    side: "team", meId: me.id, companyName: db.org.name,
    project: { key: product.key, name: product.name, color: product.color, health: product.health, stage: product.stage, ...(product.icon && { icon: product.icon }), ...(product.client && { client: product.client }) },
    clientFacing: !!db.org.clientSpace && product.type === "client",
    clients: product.clients ?? [], people, threads: sortThreads(threads),
    reads: db.chatReads.filter((r) => threads.some((t) => t.subject === r.subject)), look: lookOf(product),
    mentionables: teamMentionables(db, product, people),
  };
}

function teamMentionables(db: Db, product: Db["products"][number], people: Record<string, RoomPerson>): Mentionable[] {
  const onIt = db.people.filter((p) => p.active && !!p.panel && isOnProduct(p.id, product));
  const teams = db.teams.filter((t) => onIt.some((p) => p.team === t.id)).map((t) => ({ name: t.name, hint: "Team" }));
  const clients = (product.clients ?? []).map((c) => people[c.personId]).filter(Boolean).map((c) => ({ id: c.id, name: c.name, hint: c.company ?? "Client" }));
  return [EVERYONE, ...onIt.map((p) => ({ id: p.id, name: p.name, hint: p.role })), ...teams, ...clients];
}

/** A client's room for one of their projects, from what they receive — or null. */
export function clientRoom(view: ClientView, productKey: string): RoomModel | null {
  const p = view.projects.find((x) => x.key === productKey);
  if (!p) return null;
  const roles = new Map(p.clients.map((c) => [c.personId, c.role]));
  const people: Record<string, RoomPerson> = {};
  for (const [id, v] of Object.entries(view.people)) {
    people[id] = { id, name: v.name, initials: v.initials, color: v.color, side: v.team ? "team" : "client", ...(v.title && { title: v.title }),
      ...(v.photo && { photo: v.photo }), ...(v.company && { company: v.company }), ...(roles.get(id) && { role: roles.get(id) }) };
  }
  const bySubject = new Map<string, RoomMessage[]>();
  for (const m of p.messages) {
    const list = bySubject.get(m.subject) ?? [];
    list.push(lineOf(m, !!m.starred));
    bySubject.set(m.subject, list);
  }
  const chat = `chat:${productKey}`;
  const threads: RoomThread[] = [{ subject: chat, kind: "chat", key: "", title: p.name, messages: bySubject.get(chat) ?? [], internal: false, lastAt: lastOf(bySubject.get(chat) ?? [], "") }];
  for (const r of p.requirements) {
    const subject = `req:${r.id}`;
    const messages = bySubject.get(subject) ?? [];
    threads.push({ subject, kind: "req", key: r.code, title: r.title, messages, internal: false, lastAt: lastOf(messages, r.updatedAt ?? ""), requirement: { ...r } });
  }
  for (const a of p.asks) {
    const subject = `ask:${a.id}`;
    const messages = bySubject.get(subject) ?? [];
    threads.push({ subject, kind: "ask", key: a.code, title: a.title, messages, internal: false, lastAt: lastOf(messages, a.createdAt), ask: { ...a } });
  }
  return {
    side: "client", meId: view.me.id, myRole: p.role, companyName: view.company.name,
    project: { key: p.key, name: p.name, color: p.color, health: p.health, stage: p.stage, ...(p.icon && { icon: p.icon }), ...(p.client && { client: p.client }) },
    clientFacing: true, clients: p.clients, people, threads: sortThreads(threads), reads: p.reads, look: p.look,
    mentionables: [EVERYONE, ...Object.values(people).filter((x) => x.id !== view.me.id).map((x) => ({ id: x.id, name: x.name, hint: x.side === "team" ? x.title ?? view.company.name : x.company ?? "Client" }))],
  };
}

const CLOSED = (t: RoomThread) => t.requirement?.status === "dropped" || t.ask?.state === "done" || t.ask?.state === "cancelled";
const talkOf = (t: RoomThread) => t.messages.filter((m) => m.kind === "text" || m.kind === "file");

/**
 * Whose move it is in a chat, and since when: the client's (something to confirm or answer) or the team's (the client
 * asked, suggested or answered something). Null: nobody's waiting.
 */
export function whoseMove(room: RoomModel, t: RoomThread): { side: Side; since: string } | null {
  if (t.internal || CLOSED(t)) return null;
  const last = talkOf(t).at(-1);
  const status = t.requirement?.status, state = t.ask?.state;
  const latest = t.messages.at(-1)?.at ?? t.lastAt;
  if (last && room.people[last.authorId]?.side === "client" && status !== "confirmed") return { side: "team", since: last.at };
  if (status === "to_confirm" || state === "open") return { side: "client", since: latest };
  if (status === "changes_requested" || status === "proposed" || state === "answered") return { side: "team", since: latest };
  return null;
}

/** What the person looking needs to do something about. */
export function needsMe(room: RoomModel, t: RoomThread): boolean {
  if (room.side === "team") return whoseMove(room, t)?.side === "team";
  if (t.requirement?.status === "to_confirm") return room.myRole !== "tester";
  return t.ask?.state === "open" && (!t.ask.assigneeId || t.ask.assigneeId === room.meId);
}

/** When I last read this chat, if ever. */
export const myReadAt = (room: RoomModel, subject: string) => room.reads.find((r) => r.personId === room.meId && r.subject === subject)?.at;

/** Whether the other side has read this line — someone on it read the chat up to it or later: the blue ticks. */
export function seenByOtherSide(room: RoomModel, subject: string, m: RoomMessage): boolean {
  const mine = room.people[m.authorId]?.side ?? room.side;
  return room.reads.some((r) => r.subject === subject && room.people[r.personId] && room.people[r.personId].side !== mine && Date.parse(r.at) >= Date.parse(m.at));
}
