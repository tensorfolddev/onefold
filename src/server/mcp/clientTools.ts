// MCP tools for the Client Space: a project's requirements (R1, R2…) and its requests to the client (Q1, Q2…), as the
// token's person — the domain commands decide who may write (anyone on the project but a viewer).
// Never the chats: no tool reads db.clientMessages or chat reads, and a request answers with its own fields only — not
// its invite (access requests can carry login details) and not what the client answered (that's a chat line). The
// product owner's rule: chats, and whatever sensitive things they hold, never go to a model. Nor client emails.
// The tools are a public contract: never rename or remove one or make an input required — only add.
import { randomUUID } from "node:crypto";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { PANEL_SLUG } from "../../data/session.ts";
import {
  addRequirement, createAsk, sendRequirementToClient, setAskState, updateAsk, updateRequirement, ValidationError,
} from "../../domain/commands/index.ts";
import type { AskInput } from "../../domain/commands/clients.ts";
import type { RequirementInput, RequirementPatch } from "../../domain/commands/requirements.ts";
import { askPhase, lookOf, prioritiesOf, priorityLook, reqPhase, shortName } from "../../domain/selectors/clientLook.ts";
import { statusOfRequirement } from "../../domain/selectors/requirements.ts";
import type { Ask, AskKind, AskState, Product, Requirement, RequirementStatus, SectionItem } from "../../domain/types.ts";
import type { DocToolDeps } from "./docTools.ts";

/** A calendar day — here, not in server.ts (which registers these tools), so the two don't import each other. */
export const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "a date like 2026-10-31")
  .refine((d) => { const t = Date.parse(`${d}T00:00:00Z`); return !Number.isNaN(t) && new Date(t).toISOString().startsWith(d); }, "a real date, like 2026-10-31");

type Ctx = Awaited<ReturnType<DocToolDeps["context"]>>;

const READ = { readOnlyHint: true, openWorldHint: false } as const;
const WRITE = { readOnlyHint: false, destructiveHint: false, openWorldHint: false } as const;
const STATUS = z.enum(["draft", "proposed", "to_confirm", "changes_requested", "confirmed", "dropped"] satisfies RequirementStatus[]);
const KIND = z.enum(["question", "access", "file", "other"] satisfies AskKind[]);
const STATE = z.enum(["open", "answered", "done", "cancelled"] satisfies AskState[]);
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const REQUIREMENT_REF = z.string().describe("Its key, e.g. CH-R3 — or just R3 when only one project you see has an R3");
const REQUEST_REF = z.string().describe("Its key, e.g. CH-Q2 — or just Q2 when only one project you see has a Q2");
const PRIORITY = z.string().max(40).describe("A priority id or name from the project's own list (list_requirements shows it; Must / Should / Nice by default)");
const CRITERIA = z.array(z.union([z.string().min(1).max(2000), z.object({ text: z.string().min(1).max(2000), done: z.boolean().optional() })])).max(50)
  .describe("Acceptance criteria, as lines (strings, or {text, done}); replaces the whole list. done ticks one as met");

export function registerClientTools(server: McpServer, { context, changeCompany, attempt, findProduct }: DocToolDeps) {
  const url = (c: Ctx, productKey: string, subject: string) =>
    `${c.appUrl}/${PANEL_SLUG[c.panel]}/products/${productKey}/requirements?t=${encodeURIComponent(subject)}`;
  /** A teammate's or a client person's name — never their email. */
  const nameOf = (c: Ctx, id?: string) => (id && (c.db.people.find((p) => p.id === id) ?? c.db.clientPeople.find((p) => p.id === id))?.name) || null;
  const ticketStatus = (c: Ctx, productKey: string, statusId: string) => c.db.statusesByProduct[productKey]?.find((s) => s.id === statusId)?.name ?? "";

  /** A requirement or request by key (CH-R3), bare code (R3, when it's the only one) or id, among those this person sees. */
  function findCoded<T extends { id: string; productKey: string; code: string }>(list: T[], ref: string, what: string, lister: string): T {
    const key = /^(.+)-([a-z]\d+)$/i.exec(ref.trim());
    const found = list.filter((x) => x.id === ref.trim() || (key ? same(x.productKey, key[1]) && same(x.code, key[2]) : same(x.code, ref)));
    if (found.length === 1) return found[0];
    if (found.length > 1) throw new ValidationError(`Several projects have a ${what} ${ref}: ${found.map((x) => `${x.productKey}-${x.code}`).join(", ")}. Use one of those.`);
    throw new ValidationError(`No ${what} ${ref} that you can see. Try ${lister}.`);
  }
  const findRequirement = (c: Ctx, ref: string) => findCoded(c.db.requirements, ref, "requirement", "list_requirements");
  const findRequest = (c: Ctx, ref: string) => findCoded(c.db.asks, ref, "request", "list_requests");

  /** "Must have", "must" or "Must" → its id; "" or "none" → null (no priority). */
  const lookFor = (c: Ctx, productKey: string) => lookOf(c.db.products.find((p) => p.key === productKey));
  function priorityId(c: Ctx, productKey: string, v: string): string | null {
    if (!v.trim() || same(v, "none")) return null;
    const list = prioritiesOf(lookFor(c, productKey));
    const p = list.find((x) => same(x.id, v) || same(x.name, v) || same(shortName(x.name), v));
    if (!p) throw new ValidationError(`No priority "${v}". This project's: ${list.map((x) => `${x.id} (${x.name})`).join(", ")}`);
    return p.id;
  }
  /** Lines to criteria. A line that's already there keeps its id, so ticking one isn't a change to what was confirmed. */
  function criteriaOf(lines: z.infer<typeof CRITERIA>, cur: SectionItem[] = []): SectionItem[] {
    const used = new Set<string>();
    return lines.map((l, i) => {
      const item = typeof l === "string" ? { text: l } : l;
      const kept = cur.find((x) => !used.has(x.id) && same(x.text, item.text));
      if (kept) used.add(kept.id);
      return { id: kept?.id ?? `mcp-${Date.now().toString(36)}-${i}`, text: item.text, done: item.done ?? !!kept?.done };
    });
  }
  /** A client person on this project, by name; "" or "none" → nobody in particular. */
  function clientOn(c: Ctx, p: Product, who: string): string | null {
    if (!who.trim() || same(who, "none")) return null;
    const theirs = (p.clients ?? []).flatMap((x) => c.db.clientPeople.filter((cp) => cp.id === x.personId));
    const found = theirs.filter((cp) => same(cp.name, who));
    if (found.length === 1) return found[0].id;
    throw new ValidationError(found.length ? `More than one client on ${p.key} is called "${who}"`
      : `No client called "${who}" on ${p.key}. Its clients: ${theirs.map((x) => x.name).join(", ") || "none yet"}`);
  }

  const requirement = (c: Ctx, r: Requirement) => {
    const look = lookFor(c, r.productKey);
    const status = statusOfRequirement(r);
    const v = r.confirmed;
    return {
      key: `${r.productKey}-${r.code}`, code: r.code, product: r.productKey, title: r.title,
      status, status_name: reqPhase(look, status, "team").label,
      priority: r.priority ?? null, priority_name: priorityLook(look, r.priority)?.name ?? null,
      description: r.description ?? "", criteria: (r.criteria ?? []).map((x) => ({ text: x.text, done: !!x.done })),
      rev: r.rev ?? 1,
      confirmed: v ? { rev: v.rev, title: v.title, description: v.description, criteria: v.criteria.map((x) => x.text), by: nameOf(c, v.by), at: v.at, changed_since: v.rev !== (r.rev ?? 1) } : null,
      dropped_reason: r.droppedReason ?? null,
      tickets: c.db.tickets.filter((t) => t.requirementId === r.id && !t.archivedAt).map((t) => ({ key: t.key, title: t.title, status: ticketStatus(c, t.productKey, t.statusId) })),
      updated_at: r.updatedAt ?? null,
      url: url(c, r.productKey, `req:${r.id}`),
    };
  };
  // Field by field on purpose: never ask.invite, never the answer (a chat line), never a client's email.
  const request = (c: Ctx, a: Ask) => ({
    key: `${a.productKey}-${a.code}`, code: a.code, product: a.productKey, kind: a.kind, title: a.title, details: a.details ?? "",
    state: a.state, state_name: askPhase(lookFor(c, a.productKey), a.state, "team").label, due: a.due ?? null,
    assignee: nameOf(c, a.assigneeId), created_by: nameOf(c, a.createdBy), created_at: a.createdAt,
    url: url(c, a.productKey, `ask:${a.id}`),
  });
  const byNumber = (x: { code: string }, y: { code: string }) => Number(x.code.slice(1)) - Number(y.code.slice(1));

  // ---------- requirements ----------

  server.registerTool("list_requirements", {
    title: "List requirements",
    description: "A project's requirements (R1, R2…) in order: title, status, priority, description, acceptance criteria, the tickets that build it, and the version the client confirmed. Also this project's priority list — the ids create_requirement and update_requirement take. Chats are never included.",
    inputSchema: { product: z.string().describe("Product key or name, e.g. CH"), status: STATUS.optional() },
    annotations: READ,
  }, (a) => attempt(async () => {
    const c = await context();
    const key = findProduct(c, a.product).key;
    return {
      priorities: prioritiesOf(lookFor(c, key)).map((p) => ({ id: p.id, name: p.name })),
      requirements: c.db.requirements.filter((r) => r.productKey === key && !r.archivedAt && (!a.status || statusOfRequirement(r) === a.status))
        .sort(byNumber).map((r) => requirement(c, r)),
    };
  }));

  server.registerTool("get_requirement", {
    title: "Get a requirement",
    description: "One requirement by key (CH-R3) or code (R3): its words, status, priority, acceptance criteria, linked tickets and the confirmed version. Chats are never included.",
    inputSchema: { requirement: REQUIREMENT_REF },
    annotations: READ,
  }, (a) => attempt(async () => {
    const c = await context();
    return requirement(c, findRequirement(c, a.requirement));
  }));

  server.registerTool("create_requirement", {
    title: "Create a requirement",
    description: "A new requirement on a project, as a team draft the client doesn't see until it's sent to them (send_requirement_to_client). priority is one of the project's own — list_requirements shows them, and a wrong one is refused with the list. Anyone on the project but a viewer.",
    inputSchema: {
      product: z.string().describe("Product key or name, e.g. CH"),
      title: z.string().min(1).max(200),
      description: z.string().max(20_000).optional().describe("Markdown"),
      priority: PRIORITY.optional(),
      criteria: CRITERIA.optional(),
    },
    annotations: { ...WRITE, idempotentHint: false },
  }, (a) => attempt(async () => {
    const c = await context();
    const key = findProduct(c, a.product).key;
    const priority = a.priority === undefined ? null : priorityId(c, key, a.priority);
    const input: RequirementInput = {
      title: a.title, ...(a.description !== undefined && { description: a.description }),
      ...(priority && { priority }), ...(a.criteria && { criteria: criteriaOf(a.criteria) }),
    };
    const id = randomUUID();
    return changeCompany(() => (db, me) => ({ db: addRequirement(db, me, key, input, id), steps: [{ name: "addRequirement", args: [key, input, id] }] }),
      (after) => requirement(after, findRequirement(after, id)));
  }));

  server.registerTool("update_requirement", {
    title: "Update a requirement",
    description: "Change a requirement's title, description, priority or acceptance criteria; leave out what stays. Changing its words makes a confirmed one a draft again (the confirmed version is kept); priority and ticking criteria don't. priority \"none\" clears it. Anyone on the project but a viewer.",
    inputSchema: {
      requirement: REQUIREMENT_REF,
      title: z.string().min(1).max(200).optional(),
      description: z.string().max(20_000).optional().describe("Markdown; \"\" clears it"),
      priority: PRIORITY.optional(),
      criteria: CRITERIA.optional(),
    },
    annotations: { ...WRITE, idempotentHint: true },
  }, (a) => attempt(async () => {
    const c = await context();
    const r = findRequirement(c, a.requirement);
    const patch: RequirementPatch = {
      ...(a.title !== undefined && { title: a.title }), ...(a.description !== undefined && { description: a.description }),
      ...(a.priority !== undefined && { priority: priorityId(c, r.productKey, a.priority) }),
      ...(a.criteria && { criteria: criteriaOf(a.criteria, r.criteria) }),
    };
    return changeCompany(() => (db, me) => ({ db: updateRequirement(db, me, r.id, patch), steps: [{ name: "updateRequirement", args: [r.id, patch] }] }),
      (after) => requirement(after, findRequirement(after, r.id)));
  }));

  server.registerTool("send_requirement_to_client", {
    title: "Send a requirement to the client",
    description: "Send a draft requirement (or one the client asked to change) to the client to confirm: their Client Space shows it with Confirm. Needs Client Space on and the project's Sponsor or Product owner added. Anyone on the project but a viewer.",
    inputSchema: { requirement: REQUIREMENT_REF },
    annotations: { ...WRITE, idempotentHint: false },
  }, (a) => attempt(async () => {
    const c = await context();
    const r = findRequirement(c, a.requirement);
    return changeCompany(() => (db, me) => ({ db: sendRequirementToClient(db, me, r.id), steps: [{ name: "sendRequirementToClient", args: [r.id] }] }),
      (after) => requirement(after, findRequirement(after, r.id)));
  }));

  // ---------- requests: what the team needs from the client ----------

  server.registerTool("list_requests", {
    title: "List requests to the client",
    description: "What the team has asked a project's client for (Q1, Q2…): kind, title, details, state, due date, who on the client side it's for. Only the request itself — never its chat or the client's answer, which can hold logins and other secrets.",
    inputSchema: { product: z.string().describe("Product key or name, e.g. CH"), state: STATE.optional() },
    annotations: READ,
  }, (a) => attempt(async () => {
    const c = await context();
    const key = findProduct(c, a.product).key;
    return c.db.asks.filter((x) => x.productKey === key && (!a.state || x.state === a.state)).sort(byNumber).map((x) => request(c, x));
  }));

  server.registerTool("create_request", {
    title: "Ask the client for something",
    description: "A new request to a project's client: access, a file, an answer to a question, or something else. It opens its own chat with them, where they answer in the app. Needs Client Space on. Anyone on the project but a viewer.",
    inputSchema: {
      product: z.string().describe("Product key or name, e.g. CH"),
      kind: KIND,
      title: z.string().min(1).max(200).describe("What you need, e.g. \"Access to your Stripe account\""),
      details: z.string().max(4000).optional(),
      due: DATE.optional(),
      assignee: z.string().max(200).optional().describe("The client person it's for, by name; leave out for anyone on their side"),
    },
    annotations: { ...WRITE, idempotentHint: false },
  }, (a) => attempt(async () => {
    const c = await context();
    const p = findProduct(c, a.product);
    const assigneeId = a.assignee === undefined ? null : clientOn(c, p, a.assignee);
    const input: AskInput = { kind: a.kind, title: a.title, ...(a.details !== undefined && { details: a.details }), ...(a.due && { due: a.due }), ...(assigneeId && { assigneeId }) };
    const id = randomUUID();
    return changeCompany(() => (db, me) => ({ db: createAsk(db, me, p.key, input, id), steps: [{ name: "createAsk", args: [p.key, input, id] }] }),
      (after) => request(after, findRequest(after, id)));
  }));

  server.registerTool("update_request", {
    title: "Update or close a request",
    description: "Change a request to the client, or its state: done closes it (say, once they've answered), cancelled calls it off, open opens it again. Leave out what stays; an empty due date clears it, assignee \"none\" makes it for anyone on their side. Anyone on the project but a viewer.",
    inputSchema: {
      request: REQUEST_REF,
      title: z.string().min(1).max(200).optional(),
      details: z.string().max(4000).optional(),
      kind: KIND.optional(),
      due: z.union([DATE, z.literal("")]).optional(),
      assignee: z.string().max(200).optional().describe("The client person it's for, by name; \"none\" for anyone on their side"),
      state: z.enum(["done", "cancelled", "open"]).optional(),
    },
    annotations: { ...WRITE, idempotentHint: true },
  }, ({ request: ref, state, ...fields }) => attempt(async () => {
    const c = await context();
    const ask = findRequest(c, ref);
    const p = c.db.products.find((x) => x.key === ask.productKey)!;
    const patch: Partial<AskInput> = {
      ...(fields.title !== undefined && { title: fields.title }), ...(fields.details !== undefined && { details: fields.details }),
      ...(fields.kind && { kind: fields.kind }), ...(fields.due !== undefined && { due: fields.due || null }),
      ...(fields.assignee !== undefined && { assigneeId: clientOn(c, p, fields.assignee) }),
    };
    const steps = [
      ...(Object.keys(patch).length ? [{ name: "updateAsk", args: [ask.id, patch] }] : []),
      ...(state ? [{ name: "setAskState", args: [ask.id, state] }] : []),
    ];
    if (!steps.length) return request(c, ask);
    return changeCompany(() => (db, me) => {
      const edited = Object.keys(patch).length ? updateAsk(db, me, ask.id, patch) : db;
      return { db: state ? setAskState(edited, me, ask.id, state) : edited, steps };
    }, (after) => request(after, findRequest(after, ask.id)));
  }));
}
