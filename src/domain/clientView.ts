// What one client person's browser receives (Client Space): a shape of its own, built field by field — never the
// team's data with bits taken out. Anything not copied in here can't reach a client: no internal notes, comments,
// activity, tickets, assignees, team emails, internal docs, other projects or other clients' requests, and no hours.
import type { Db } from "../data/db.ts";
import { lineAsSeenBy, seesLine } from "./commands/chat.ts";
import { lookOf, type ClientLook } from "./selectors/clientLook.ts";
import { requirementProgress, statusOfRequirement } from "./selectors/requirements.ts";
import type {
  Ask, AskKind, AskState, ChatRead, ClientEvent, ClientMessage, ClientMessageData, ClientRole, Health, ProductClient, ProductIcon, Requirement,
  RequirementPriority, RequirementStatus, SectionItem, Stage,
} from "./types.ts";

export interface ClientPersonView { name: string; initials: string; color: string; photo?: string; team: boolean; title?: string; company?: string }
export interface ClientRequirementView {
  id: string; code: string; title: string; description: string; criteria: SectionItem[];
  status: RequirementStatus;
  rev: number;
  beingUpdated?: boolean; // the team is changing it: what's shown is the version that was confirmed
  priority?: RequirementPriority; // where it came from (source) is the team's note: not shown
  progress: { done: number; doing: number; total: number };
  confirmed?: { by: string; at: string; rev: number };
  proposedBy?: string;
  droppedReason?: string;
  updatedAt?: string;
}
export interface ClientAskView {
  id: string; code: string; title: string; details: string; kind: AskKind; state: AskState; due?: string; invite?: string;
  assigneeId?: string; createdBy: string; createdAt: string; answeredAt?: string;
}
export interface ClientMessageView {
  id: string; subject: string; authorId: string; at: string; body: string;
  kind?: Exclude<ClientMessage["kind"], "note">; event?: ClientEvent; rev?: number; data?: ClientMessageData; via?: ClientMessage["via"];
  deletedAt?: string; starred?: true; pinnedAt?: string; pinnedBy?: string;
}
export interface ClientProjectView {
  key: string; name: string; color: string; icon?: ProductIcon; client?: string; role: ClientRole;
  health: Health; stage: Stage;
  contacts: string[]; // the PM and project manager — person ids in `people`
  clients: ProductClient[]; // who from their side is on it, and as what
  requirements: ClientRequirementView[];
  asks: ClientAskView[];
  messages: ClientMessageView[];
  /** When each chat was last read: by the client themselves (unread counts), and by the team (their read ticks). */
  reads: ChatRead[];
  /** The project's own phase names, colours and priorities. */
  look: ClientLook;
}
export interface ClientView {
  me: { id: string; name: string; email: string; company: string };
  company: { name: string };
  projects: ClientProjectView[];
  people: Record<string, ClientPersonView>;
}

/** Whether a client ever sees this requirement: once shared with them, confirmed, or proposed by them. */
export const clientCanSee = (r: Requirement) => {
  if (r.archivedAt) return false; // archived by the team: off the client's board too
  const s = statusOfRequirement(r);
  if (s === "draft") return !!r.confirmed; // being changed: the confirmed version still shows
  return !!(r.sharedAt || r.confirmed || r.proposedBy);
};
/** A request is for one client person, or anyone on the client side; a Sponsor sees all of the project's. */
export const clientCanSeeAsk = (a: Ask, clientId: string, role: ClientRole) =>
  a.state !== "cancelled" && (!a.assigneeId || a.assigneeId === clientId || role === "sponsor");

/** A description as a client reads it: links into the team's 1Fold (tickets, docs, people, files) become plain words. */
export const clientText = (md: string) => md
  .replace(/\[@{1,2}([^\]\n]*)\]\(mention:[^)\s]*\)/g, "$1")
  .replace(/\[([^\]\n]*)\]\((?:ticket|doc):[^)\s]*\)/g, "$1")
  .replace(/\[([^\]\n]*)\]\(\/api\/files\/[^)\s]*\)/g, "$1");

function requirementView(db: Db, r: Requirement): ClientRequirementView {
  const p = requirementProgress(db, r);
  const status = statusOfRequirement(r);
  const asConfirmed = status === "draft" && !!r.confirmed; // show what was agreed, not the team's work in progress
  const words = asConfirmed ? r.confirmed! : { title: r.title, description: r.description ?? "", criteria: r.criteria ?? [] };
  return {
    id: r.id, code: r.code, title: words.title, description: clientText(words.description),
    criteria: words.criteria.map((c) => ({ id: c.id, text: c.text, done: !!c.done })),
    status: asConfirmed ? "confirmed" : status, rev: asConfirmed ? r.confirmed!.rev : r.rev ?? 1,
    ...(asConfirmed && { beingUpdated: true }),
    ...(r.priority && { priority: r.priority }),
    progress: { done: p.done, doing: p.doing, total: p.total },
    ...(r.confirmed && { confirmed: { by: r.confirmed.by, at: r.confirmed.at, rev: r.confirmed.rev } }),
    ...(r.proposedBy && { proposedBy: r.proposedBy }),
    ...(status === "dropped" && r.droppedReason && { droppedReason: r.droppedReason }),
    ...(r.updatedAt && { updatedAt: r.updatedAt }),
  };
}

function messageView(line: ClientMessage, visible: Set<string>, meId: string): ClientMessageView {
  const m = lineAsSeenBy(line, meId);
  const data = m.data && {
    ...(m.data.replyTo && visible.has(m.data.replyTo) && { replyTo: m.data.replyTo }),
    ...(m.data.file && { file: { id: m.data.file.id, name: m.data.file.name, type: m.data.file.type, size: m.data.file.size } }),
    ...(m.data.update && { update: m.data.update }),
    ...(m.data.sent && { sent: { ...m.data.sent, description: clientText(m.data.sent.description) } }),
  };
  return {
    id: m.id, subject: m.subject, authorId: m.authorId, at: m.at, body: m.body,
    ...(m.kind && m.kind !== "note" && { kind: m.kind }), ...(m.event && { event: m.event }), ...(m.rev && { rev: m.rev }),
    ...(data && Object.keys(data).length && { data }), ...(m.via && { via: m.via }),
    ...(m.deletedAt && { deletedAt: m.deletedAt }), ...(m.starredBy?.length && { starred: true as const }),
    ...(m.pinnedAt && { pinnedAt: m.pinnedAt, ...(m.pinnedBy && { pinnedBy: m.pinnedBy }) }),
  };
}

export function clientViewFor(db: Db, clientId: string): ClientView | null {
  const me = db.clientPeople.find((c) => c.id === clientId);
  if (!me || !me.active || !db.org.clientSpace) return null;
  const people: Record<string, ClientPersonView> = {};
  const addTeam = (id: string) => {
    const p = db.people.find((x) => x.id === id);
    if (p && !people[id]) people[id] = { name: p.name, initials: p.initials, color: p.color, team: true, title: p.role, ...(p.photo && { photo: p.photo }) };
  };
  const addClient = (id: string) => {
    const c = db.clientPeople.find((x) => x.id === id);
    if (c && !people[id]) people[id] = { name: c.name, initials: c.initials, color: c.color, team: false, ...(c.company && { company: c.company }), ...(c.photo && { photo: c.photo }) };
  };
  addClient(me.id);

  const projects: ClientProjectView[] = db.products
    .filter((p) => !p.archivedAt && p.clients?.some((c) => c.personId === me.id))
    .map((p) => {
      const role = p.clients!.find((c) => c.personId === me.id)!.role;
      const requirements = db.requirements.filter((r) => r.productKey === p.key && clientCanSee(r)).map((r) => requirementView(db, r));
      const asks = db.asks.filter((a) => a.productKey === p.key && clientCanSeeAsk(a, me.id, role)).map((a): ClientAskView => ({
        id: a.id, code: a.code, title: a.title, details: a.details, kind: a.kind, state: a.state, createdBy: a.createdBy, createdAt: a.createdAt,
        ...(a.due && { due: a.due }), ...(a.invite && { invite: a.invite }), ...(a.assigneeId && { assigneeId: a.assigneeId }), ...(a.answeredAt && { answeredAt: a.answeredAt }),
      }));
      const subjects = new Set([`chat:${p.key}`, ...requirements.map((r) => `req:${r.id}`), ...asks.map((a) => `ask:${a.id}`)]);
      const shown = db.clientMessages.filter((m) => m.productKey === p.key && m.kind !== "note" && subjects.has(m.subject) && seesLine(m, me.id));
      const visible = new Set(shown.map((m) => m.id));
      const messages = shown.map((m) => messageView(m, visible, me.id));
      const team = new Set(db.people.map((x) => x.id));
      const reads = db.chatReads.filter((r) => subjects.has(r.subject) && (r.personId === me.id || team.has(r.personId)));
      const contacts = [...new Set([p.projectManagerId, p.pmId])].filter((id) => db.people.some((x) => x.id === id));
      contacts.forEach(addTeam);
      p.clients!.forEach((c) => addClient(c.personId));
      for (const m of messages) { addTeam(m.authorId); addClient(m.authorId); }
      for (const a of asks) addTeam(a.createdBy);
      for (const r of requirements) { if (r.confirmed) { addTeam(r.confirmed.by); addClient(r.confirmed.by); } if (r.proposedBy) addClient(r.proposedBy); }
      return {
        key: p.key, name: p.name, color: p.color, role, health: p.health, stage: p.stage, contacts, requirements, asks, messages, reads, look: lookOf(p),
        clients: p.clients!.map((c) => ({ personId: c.personId, role: c.role })),
        ...(p.icon && { icon: p.icon }), ...(p.client && { client: p.client }),
      };
    });
  return { me: { id: me.id, name: me.name, email: me.email, company: me.company }, company: { name: db.org.name }, projects, people };
}
