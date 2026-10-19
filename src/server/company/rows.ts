// A company's data (the domain Db) ⇄ database rows, table by table. Pure: no database here, so it's tested on its own.
// Lists are flattened in order; the order becomes `position` when saving (positions.ts). Child lists (product
// members, board lists, dependencies, attachments) get their own rows. Logins and emails come from the users table.
import { DB_VERSION, normalize, type Db } from "../../data/db.ts";
import { initialsOf } from "../../domain/commands/shared.ts";
import type {
  Activity, Attachment, Comment, Decision, Doc, Invite, Milestone, Notification, Person, Product, ProductIcon, PullRequest,
  Requirement, StageRequest, Status, Team, Ticket, TicketSections,
} from "../../domain/types.ts";

export type Row = Record<string, unknown> & { orgId: string; id: string };

/** Every company table except orgs, in a readable order (foreign keys are deferred, so order doesn't matter). */
export const TABLES = [
  "members", "invites", "teams", "jobTitles", "productGroups", "products", "productMembers", "boardLists",
  "requirements", "decisions", "milestones", "docs", "stageRequests", "tickets", "ticketDependencies", "attachments",
  "comments", "activity", "notifications", "docGroups",
] as const;
export type TableName = (typeof TABLES)[number];
/** Lists whose order matters and is kept in `position`. The rest (logs) are ordered by time. */
export const POSITIONED: ReadonlySet<TableName> = new Set([
  "members", "invites", "teams", "jobTitles", "productGroups", "products", "productMembers", "boardLists",
  "requirements", "decisions", "milestones", "docs", "tickets", "ticketDependencies", "attachments", "docGroups",
]);

/** One instant, one spelling: "2026-10-15T04:41:07Z". Accepts a zoneless time (read as UTC) or any offset. */
export function instant(s: string): string {
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(s)) return `${s.slice(0, 19)}Z`;
  const t = Date.parse(s.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00"));
  if (Number.isNaN(t)) throw new Error(`Not a timestamp: ${s}`);
  return `${new Date(t).toISOString().slice(0, 19)}Z`;
}
export const instantOrNull = (s: string | undefined | null) => (s ? instant(s) : null);

const opt = <T>(v: T | undefined | null) => (v === undefined || v === "" ? null : v);

/** Every table's rows, in list order (no positions yet). Members carry no userId — the caller adds it. */
export function toRows(db: Db): Record<TableName, Row[]> {
  const orgId = db.org.id;
  const r = <T extends object>(id: string, fields: T): Row => ({ orgId, id, ...fields });
  const productKeys = db.products.map((p) => p.key);
  return {
    members: db.people.map((p) => r(p.id, {
      name: p.name, color: p.color, role: p.role, team: p.team, capacityH: p.capacityH, panel: opt(p.panel), active: p.active,
    })),
    invites: db.invites.map((i) => r(i.id, {
      tokenHash: i.tokenHash, email: i.email, panel: i.panel, role: i.role, invitedBy: i.invitedBy,
      createdAt: instant(i.createdAt), acceptedAt: instantOrNull(i.acceptedAt), revokedAt: instantOrNull(i.revokedAt),
    })),
    teams: db.teams.map((t) => r(t.id, { name: t.name, leadId: opt(t.leadId) })),
    jobTitles: db.jobTitles.map((title) => r(title, {})),
    productGroups: db.productGroups.map((g) => r(g.id, { name: g.name })),
    docGroups: db.docGroups.map((g) => r(g.id, { productId: opt(g.productKey), name: g.name })),
    products: db.products.map((p) => r(p.key, {
      name: p.name, type: p.type, client: opt(p.client), stage: p.stage, health: p.health, pmId: p.pmId,
      projectManagerId: p.projectManagerId, color: p.color, description: p.description, waitingApproval: opt(p.waitingApproval),
      icon: opt(p.icon), priorities: p.priorities && Object.keys(p.priorities).length ? p.priorities : null, groupId: opt(p.groupId), createdAt: p.createdAt,
      archivedAt: instantOrNull(p.archivedAt), archivedBy: opt(p.archivedBy),
    })),
    productMembers: db.products.flatMap((p) => p.memberIds.map((m) => r(`${p.key}:${m}`, { productId: p.key, memberId: m }))),
    boardLists: productKeys.flatMap((key) => (db.statusesByProduct[key] ?? []).map((s) => r(s.id, {
      productId: key, name: s.name, category: s.category, tone: s.tone, system: opt(s.system),
    }))),
    requirements: db.requirements.map((q) => r(q.id, { productId: q.productKey, code: q.code, title: q.title })),
    decisions: db.decisions.map((d) => r(d.id, {
      productId: d.productKey, title: d.title, why: d.why, byId: d.byId, date: d.date, status: opt(d.status), context: opt(d.context),
      alternatives: opt(d.alternatives), consequences: opt(d.consequences), ticketKeys: d.ticketKeys?.length ? d.ticketKeys : null,
      docIds: d.docIds?.length ? d.docIds : null, supersededBy: opt(d.supersededBy), updatedAt: instantOrNull(d.updatedAt),
      labelName: opt(d.label?.name), labelColor: opt(d.label?.color), color: opt(d.color), body: d.body ?? null,
    })),
    milestones: db.milestones.map((m) => r(m.id, { productId: m.productKey, name: m.name, due: m.due, pct: m.pct, lateDays: m.lateDays })),
    docs: db.docs.map((d) => r(d.id, {
      productId: opt(d.productKey), parentId: opt(d.parentId), groupId: opt(d.groupId), kind: d.kind, title: d.title, icon: opt(d.icon), cover: opt(d.cover),
      template: opt(d.template), updated: d.updated, authorId: d.authorId, createdAt: instantOrNull(d.createdAt),
      updatedAt: instantOrNull(d.updatedAt), updatedBy: opt(d.updatedBy), rev: d.rev ?? null,
      archivedAt: instantOrNull(d.archivedAt), archivedBy: opt(d.archivedBy),
    })),
    stageRequests: db.stageRequests.map((s) => r(s.id, { productId: s.productKey, stage: s.stage, requestedBy: s.requestedBy, at: instant(s.at) })),
    tickets: db.tickets.map((t) => r(t.key, {
      productId: t.productKey, title: t.title, type: t.type, statusId: t.statusId, assigneeId: opt(t.assigneeIds?.[0]), assigneeIds: t.assigneeIds?.length ? t.assigneeIds : null,
      priority: t.priority, estimateH: t.estimateH, due: opt(t.due), requirementId: opt(t.requirementId), sprint: opt(t.sprint),
      pr: opt(t.pr), createdBy: opt(t.createdBy), color: opt(t.color), epicId: opt(t.epicKey),
      archivedAt: instantOrNull(t.archivedAt), archivedBy: opt(t.archivedBy),
      sections: t.sections && Object.keys(t.sections).length ? t.sections : null,
    })),
    ticketDependencies: db.tickets.flatMap((t) => (t.dependsOn ?? []).map((d) => r(`${t.key}:${d}`, { ticketId: t.key, dependsOnId: d }))),
    attachments: db.tickets.flatMap((t) => (t.attachments ?? []).map((a) => r(a.id, {
      ticketId: t.key, name: a.name, type: a.type, size: a.size, width: a.width, height: a.height, addedBy: a.addedBy,
      addedAt: instant(a.addedAt),
    }))),
    comments: db.comments.map((c) => r(c.id, { ticketId: c.ticketKey, authorId: c.authorId, at: instant(c.at), body: c.body })),
    activity: db.activity.map((a) => r(a.id, {
      ticketId: a.ticketKey, at: instant(a.at), actorId: a.actorId, field: a.field, fromValue: opt(a.from), toValue: a.to,
    })),
    notifications: db.notifications.map((n) => r(n.id, {
      personId: n.personId, kind: n.kind, actorId: n.actorId, text: n.text, target: n.target, at: instant(n.at), read: n.read,
    })),
  };
}

export interface OrgRow { id: string; slug: string; name: string; emailDomain: string; domainLock: boolean; createdAt: string; createdBy: string }
export const orgRow = (db: Db): OrgRow => {
  const { id, slug, name, emailDomain, domainLock, createdAt, createdBy } = db.org;
  return { id, slug, name, emailDomain, domainLock, createdAt, createdBy };
};

const str = (v: unknown) => v as string;
const und = <T>(v: unknown) => (v === null || v === undefined ? undefined : (v as T));
/** Rows in their saved order: positioned lists by position, logs by time then id. */
const sorted = (rows: Row[], positioned: boolean) =>
  [...rows].sort((a, b) => positioned
    ? (a.position as number) - (b.position as number)
    : str(a.at ?? "").localeCompare(str(b.at ?? "")) || a.id.localeCompare(b.id));
const byParent = (rows: Row[], key: string) => {
  const out = new Map<string, Row[]>();
  for (const row of rows) out.set(str(row[key]), [...(out.get(str(row[key])) ?? []), row]);
  return out;
};

/** The company's data back from its rows. `emails` maps member id → login email. */
export function fromRows(org: OrgRow, tables: Record<TableName, Row[]>, emails: ReadonlyMap<string, string>): Db {
  const t = Object.fromEntries(TABLES.map((name) => [name, sorted(tables[name] ?? [], POSITIONED.has(name))])) as Record<TableName, Row[]>;
  const membersOf = byParent(t.productMembers, "productId");
  const listsOf = byParent(t.boardLists, "productId");
  const depsOf = byParent(t.ticketDependencies, "ticketId");
  const filesOf = byParent(t.attachments, "ticketId");

  const people: Person[] = t.members.map((m) => ({
    id: m.id, name: str(m.name), initials: initialsOf(str(m.name)), color: str(m.color), role: str(m.role), team: str(m.team),
    capacityH: m.capacityH as number, email: emails.get(m.id) ?? "", panel: und(m.panel), active: m.active as boolean,
  }));
  const products: Product[] = t.products.map((p) => ({
    key: p.id, name: str(p.name), type: p.type as Product["type"], client: und(p.client), stage: p.stage as Product["stage"],
    health: p.health as Product["health"], pmId: str(p.pmId), projectManagerId: str(p.projectManagerId), color: str(p.color),
    description: str(p.description), waitingApproval: und(p.waitingApproval),
    memberIds: (membersOf.get(p.id) ?? []).map((m) => str(m.memberId)), icon: und<ProductIcon>(p.icon), groupId: und(p.groupId),
    createdAt: str(p.createdAt),
    ...(p.priorities ? { priorities: p.priorities as Product["priorities"] } : {}),
    ...(p.archivedAt ? { archivedAt: instant(str(p.archivedAt)), archivedBy: und<string>(p.archivedBy) } : {}),
  }));
  const statusesByProduct: Record<string, Status[]> = Object.fromEntries(products.map((p) => [p.key, (listsOf.get(p.key) ?? []).map((s) => ({
    id: s.id, name: str(s.name), category: s.category as Status["category"], tone: s.tone as Status["tone"], system: und<Status["system"]>(s.system),
  }))]));
  const tickets: Ticket[] = t.tickets.map((k) => ({
    key: k.id, productKey: str(k.productId), title: str(k.title), type: k.type as Ticket["type"], statusId: str(k.statusId),
    assigneeIds: (k.assigneeIds as string[] | null)?.length ? (k.assigneeIds as string[]) : k.assigneeId ? [str(k.assigneeId)] : undefined, priority: k.priority as Ticket["priority"], estimateH: k.estimateH as number, due: und(k.due),
    requirementId: und(k.requirementId), sprint: und(k.sprint), pr: und<PullRequest>(k.pr), createdBy: und(k.createdBy),
    color: und(k.color), epicKey: und(k.epicId), sections: und<TicketSections>(k.sections),
    ...(k.archivedAt ? { archivedAt: instant(str(k.archivedAt)), archivedBy: und<string>(k.archivedBy) } : {}),
    dependsOn: depsOf.has(k.id) ? depsOf.get(k.id)!.map((d) => str(d.dependsOnId)) : undefined,
    attachments: filesOf.has(k.id) ? filesOf.get(k.id)!.map((a): Attachment => ({
      id: a.id, name: str(a.name), type: str(a.type), size: a.size as number, width: a.width as number, height: a.height as number,
      addedBy: str(a.addedBy), addedAt: str(a.addedAt),
    })) : undefined,
  }));

  return normalize({
    version: DB_VERSION,
    org: { ...org },
    invites: t.invites.map((i): Invite => ({
      id: i.id, tokenHash: str(i.tokenHash), email: str(i.email), panel: i.panel as Invite["panel"], role: str(i.role),
      invitedBy: str(i.invitedBy), createdAt: str(i.createdAt), acceptedAt: und(i.acceptedAt), revokedAt: und(i.revokedAt),
    })),
    people,
    teams: t.teams.map((x): Team => ({ id: x.id, name: str(x.name), leadId: str(x.leadId ?? "") })),
    jobTitles: t.jobTitles.map((j) => j.id),
    productGroups: t.productGroups.map((g) => ({ id: g.id, name: str(g.name) })),
    docGroups: (t.docGroups ?? []).map((g) => ({ id: g.id, productKey: und<string>(g.productId) ?? "", name: str(g.name) })),
    products,
    statusesByProduct,
    tickets,
    requirements: t.requirements.map((q): Requirement => ({ id: q.id, productKey: str(q.productId), code: str(q.code), title: str(q.title) })),
    decisions: t.decisions.map((d): Decision => ({
      id: d.id, productKey: str(d.productId), title: str(d.title), why: str(d.why), byId: str(d.byId), date: str(d.date),
      ...(d.status ? { status: d.status as Decision["status"] } : {}),
      ...(d.context ? { context: str(d.context) } : {}),
      ...(d.alternatives ? { alternatives: str(d.alternatives) } : {}),
      ...(d.consequences ? { consequences: str(d.consequences) } : {}),
      ...((d.ticketKeys as string[] | null)?.length ? { ticketKeys: d.ticketKeys as string[] } : {}),
      ...((d.docIds as string[] | null)?.length ? { docIds: d.docIds as string[] } : {}),
      ...(d.supersededBy ? { supersededBy: str(d.supersededBy) } : {}),
      ...(d.updatedAt ? { updatedAt: instant(str(d.updatedAt)) } : {}),
      ...(d.labelName && d.labelColor ? { label: { name: str(d.labelName), color: str(d.labelColor) } } : {}),
      ...(d.color ? { color: str(d.color) } : {}),
      ...(typeof d.body === "string" ? { body: d.body } : {}),
    })),
    milestones: t.milestones.map((m): Milestone => ({
      id: m.id, productKey: str(m.productId), name: str(m.name), due: str(m.due), pct: m.pct as number, lateDays: m.lateDays as number,
    })),
    docs: t.docs.map((d): Doc => ({
      id: d.id, productKey: und<string>(d.productId) ?? "", kind: d.kind as Doc["kind"], title: str(d.title), updated: str(d.updated), authorId: str(d.authorId),
      ...(d.parentId ? { parentId: str(d.parentId) } : {}),
      ...(d.groupId ? { groupId: str(d.groupId) } : {}),
      ...(d.icon ? { icon: str(d.icon) } : {}),
      ...(d.cover ? { cover: str(d.cover) } : {}),
      ...(d.template ? { template: str(d.template) } : {}),
      ...(d.createdAt ? { createdAt: instant(str(d.createdAt)) } : {}),
      ...(d.updatedAt ? { updatedAt: instant(str(d.updatedAt)), updatedBy: und<string>(d.updatedBy), rev: und<number>(d.rev) } : {}),
      ...(d.archivedAt ? { archivedAt: instant(str(d.archivedAt)), archivedBy: und<string>(d.archivedBy) } : {}),
    })),
    activity: t.activity.map((a): Activity => ({
      id: a.id, ticketKey: str(a.ticketId), at: str(a.at), actorId: str(a.actorId), field: a.field as Activity["field"], from: und(a.fromValue), to: str(a.toValue),
    })),
    comments: t.comments.map((c): Comment => ({ id: c.id, ticketKey: str(c.ticketId), authorId: str(c.authorId), at: str(c.at), body: str(c.body) })),
    notifications: t.notifications.map((n): Notification => ({
      id: n.id, personId: str(n.personId), kind: n.kind as Notification["kind"], actorId: str(n.actorId), text: str(n.text),
      target: str(n.target), at: str(n.at), read: n.read as boolean,
    })),
    stageRequests: t.stageRequests.map((s): StageRequest => ({ id: s.id, productKey: str(s.productId), stage: s.stage as StageRequest["stage"], requestedBy: str(s.requestedBy), at: str(s.at) })),
  });
}

/** JSON with object keys sorted at every level — jsonb reorders keys, so rows are compared this way. */
export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().filter((k) => (value as Record<string, unknown>)[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${stableJson((value as Record<string, unknown>)[k])}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}
