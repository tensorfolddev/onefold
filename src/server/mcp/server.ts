// The MCP server (design §9): Claude — or any MCP client — reads and works on tickets as a person, with their personal
// API token and their permissions. Every change goes through the same commands as the website, lands in the audit
// log as source "mcp", and shows up live in open browsers. Streamable HTTP, stateless (each request stands alone),
// answers as JSON:
//   claude mcp add --transport http onefold https://1fold.tensorfold.ai/api/mcp --header "Authorization: Bearer 1fold_…"
// The tools are a public contract (design §12.8): never rename or remove one or make an input required — only add.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import type { Db } from "../../data/db.ts";
import { PANEL_SLUG } from "../../data/session.ts";
import {
  AccessError, addComment, addDependency, createTicket, moveTicket, setSection, updateTicket, ValidationError, type TicketPatch,
} from "../../domain/commands/index.ts";
import { DEFINITION_OF_DONE, sectionDef, ticketToJson } from "../../domain/templates.ts";
import type { Panel, SectionValue, Ticket } from "../../domain/types.ts";
import type { SessionRow } from "../accounts.ts";
import { limit, MINUTE } from "../auth/rateLimit.ts";
import { applyComposed, viewFor } from "../changes.ts";
import { tokenSession } from "./tokens.ts";

const MAX_BODY_BYTES = 512 * 1024;
const MAX_LIST = 200;
const REQUESTS_PER_MINUTE = 120; // per person, however many tokens they have
const ATTEMPTS_PER_MINUTE = 300; // per address, before anyone is known (wrong tokens included)

// ---------- answers ----------

type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };
const answer = (value: unknown): ToolResult => ({ content: [{ type: "text", text: JSON.stringify(value, null, 2) }] });
const refusal = (message: string): ToolResult => ({ content: [{ type: "text", text: message }], isError: true });

/** Runs a tool: refusals become a message the model can act on — never a stack trace. */
async function attempt(fn: () => Promise<unknown>): Promise<ToolResult> {
  try {
    return answer(await fn());
  } catch (e) {
    if (e instanceof ValidationError) return refusal(e.message);
    if (e instanceof AccessError) return refusal(`Not allowed: ${e.message}`);
    console.error("[mcp] a tool failed", e);
    return refusal("Something went wrong on 1Fold's side — please try again");
  }
}

// ---------- finding things by what a person (or a model) would call them ----------

interface Ctx { db: Db; meId: string; panel: Panel; appUrl: string }
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const ticketUrl = (c: Ctx, key: string) => `${c.appUrl}/${PANEL_SLUG[c.panel]}/t/${key}`;

function findProduct(c: Ctx, key: string) {
  const product = c.db.products.find((p) => same(p.key, key) || same(p.name, key));
  if (!product) throw new ValidationError(`No product "${key}". Yours: ${c.db.products.map((p) => `${p.key} (${p.name})`).join(", ") || "none"}`);
  return product;
}

function findTicket(c: Ctx, key: string): Ticket {
  const ticket = c.db.tickets.find((t) => same(t.key, key));
  if (!ticket) throw new ValidationError(`No ticket ${key} that you can see`);
  return ticket;
}

function findStatus(c: Ctx, productKey: string, name: string): string {
  const statuses = (c.db.statusesByProduct[productKey] ?? []).filter((s) => s.system !== "epic");
  const status = statuses.find((s) => s.id === name || same(s.name, name));
  if (!status) throw new ValidationError(`No list "${name}" in ${productKey}. Lists: ${statuses.map((s) => s.name).join(", ")}`);
  return status.id;
}

/** "me", "none" (unassigned), a person's id, name or (when you can see it) email. */
function findPerson(c: Ctx, who: string): string | undefined {
  if (same(who, "me")) return c.meId;
  if (same(who, "none") || !who.trim()) return undefined;
  const matches = c.db.people.filter((p) => p.active && (p.id === who || same(p.name, who) || (p.email && same(p.email, who))));
  if (matches.length === 1) return matches[0].id;
  const names = c.db.people.filter((p) => p.active).map((p) => p.name).join(", ");
  throw new ValidationError(matches.length ? `"${who}" matches more than one person — use their email` : `No one called "${who}". People: ${names}`);
}

const statusName = (c: Ctx, t: Ticket) => c.db.statusesByProduct[t.productKey]?.find((s) => s.id === t.statusId)?.name ?? "";
const personName = (c: Ctx, id?: string) => c.db.people.find((p) => p.id === id)?.name;

function summary(c: Ctx, t: Ticket) {
  return {
    key: t.key, title: t.title, type: t.type, status: t.type === "epic" ? undefined : statusName(c, t),
    assignee: personName(c, t.assigneeIds?.[0]) ?? null, assignees: (t.assigneeIds ?? []).map((id) => personName(c, id)).filter(Boolean),
    priority: t.priority, due: t.due ?? null, epic: t.epicKey ?? null, url: ticketUrl(c, t.key),
  };
}

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "a date like 2026-10-31")
  .refine((d) => { const t = Date.parse(`${d}T00:00:00Z`); return !Number.isNaN(t) && new Date(t).toISOString().startsWith(d); }, "a real date, like 2026-10-31");
const TYPES = z.enum(["task", "bug", "epic"]);
const PRIORITIES = z.enum(["critical", "high", "medium", "low"]);
const ASSIGNEES = z.array(z.string().max(200)).max(20).optional().describe("Everyone on it — names or emails, \"me\" for you; [] for nobody. Replaces whoever was on it");

/** The ticket fields a tool may set, in the words a model uses, turned into a TicketPatch. */
function patchOf(c: Ctx, productKey: string, a: { type?: Ticket["type"]; status?: string; assignee?: string; assignees?: string[]; priority?: Ticket["priority"]; due?: string; estimate_hours?: number; epic?: string; title?: string }): TicketPatch {
  const patch: TicketPatch = {};
  if (a.title !== undefined) patch.title = a.title;
  if (a.type !== undefined) patch.type = a.type;
  if (a.status !== undefined) patch.statusId = findStatus(c, productKey, a.status);
  if (a.assignee !== undefined) { const id = findPerson(c, a.assignee); patch.assigneeIds = id ? [id] : []; } // just this one
  if (a.assignees !== undefined) patch.assigneeIds = a.assignees.map((who) => findPerson(c, who)).filter((id): id is string => !!id);
  if (a.priority !== undefined) patch.priority = a.priority;
  if (a.due !== undefined) patch.due = a.due || undefined;
  if (a.estimate_hours !== undefined) patch.estimateH = a.estimate_hours;
  if (a.epic !== undefined) patch.epicKey = a.epic ? findTicket(c, a.epic).key : undefined;
  return patch;
}

/** A section's new value from what the model sent: text, lines, checklist lines, or the definition-of-done lines ticked. */
function sectionValue(t: Ticket, sectionId: string, value: string | (string | { text: string; done?: boolean })[]): SectionValue {
  const def = sectionDef(t.type, sectionId);
  if (!def) throw new ValidationError(`${t.key} has no section "${sectionId}" — get_ticket lists them`);
  const lines = typeof value === "string" ? value.split("\n").filter((l) => l.trim()) : value;
  if (def.kind === "text") return typeof value === "string" ? value : lines.map((l) => (typeof l === "string" ? l : l.text)).join("\n");
  if (def.kind === "done") {
    const ticked = lines.map((l) => (typeof l === "string" ? l : l.done === false ? "" : l.text)).filter(Boolean);
    return DEFINITION_OF_DONE.map((d) => ({ ...d, done: ticked.some((x) => same(x, d.id) || same(x, d.text)) }));
  }
  return lines.map((l, i) => {
    const item = typeof l === "string" ? { text: l } : l;
    return { id: `mcp-${Date.now().toString(36)}-${i}`, text: item.text, ...(def.kind === "checklist" ? { done: !!item.done } : {}) };
  });
}

// ---------- the tools ----------

export function mcpServerFor(who: SessionRow, appUrl: string): McpServer {
  const server = new McpServer({ name: "1fold", version: "1.0.0" }, {
    instructions: "1Fold is a product and ticket tracker. Tickets have keys like CH-12, a type (task, bug, epic), a list (status) and template sections. You act as the person whose API token this is, with their permissions.",
  });
  const context = async (): Promise<Ctx> => {
    const view = await viewFor(who);
    return { db: view.db, meId: view.meId, panel: view.panel, appUrl };
  };
  /**
   * Runs a change, then answers with the ticket as it is now. Once the change is saved, the answer is a success even
   * if the ticket can't be read back (say it moved out of your view) — so a model never "retries" a change that worked.
   */
  const change = async (key: (c: Ctx) => string, run: (c: Ctx) => (db: Db, me: Parameters<typeof updateTicket>[1]) => { db: Db; key?: string; steps: { name: string; args: unknown[] }[] }) => {
    const before = await context();
    const result = await applyComposed(who, "mcp", run(before));
    const done = result.key ?? key(before);
    try {
      const after = await context();
      return summary(after, findTicket(after, done));
    } catch {
      return { key: done, saved: true };
    }
  };
  const READ = { readOnlyHint: true, openWorldHint: false } as const;
  const WRITE = { readOnlyHint: false, destructiveHint: false, openWorldHint: false } as const;

  server.registerTool("list_products", {
    title: "List products",
    description: "The products you can see, with their lists (statuses) in board order.",
    inputSchema: {},
    annotations: READ,
  }, () => attempt(async () => {
    const c = await context();
    return c.db.products.map((p) => ({
      key: p.key, name: p.name, type: p.type, stage: p.stage, description: p.description,
      lists: (c.db.statusesByProduct[p.key] ?? []).filter((s) => s.system !== "epic").map((s) => s.name),
    }));
  }));

  server.registerTool("list_tickets", {
    title: "List tickets",
    description: "Tickets you can see, newest first. Filters combine. Done and cancelled tickets are left out unless include_done is true.",
    inputSchema: {
      product: z.string().optional().describe("Product key or name, e.g. CH"),
      status: z.string().optional().describe("List name, e.g. In Progress"),
      assignee: z.string().optional().describe('"me", "none", or a person\'s name or email'),
      type: TYPES.optional(),
      text: z.string().optional().describe("Words to find in the key or title"),
      include_done: z.boolean().optional(),
      limit: z.number().int().min(1).max(MAX_LIST).optional().describe(`At most this many (default 50, up to ${MAX_LIST})`),
    },
    annotations: READ,
  }, (a) => attempt(async () => {
    const c = await context();
    const productKey = a.product ? findProduct(c, a.product).key : undefined;
    const assigneeId = a.assignee !== undefined ? findPerson(c, a.assignee) ?? null : undefined;
    const categoryOf = (t: Ticket) => c.db.statusesByProduct[t.productKey]?.find((s) => s.id === t.statusId)?.category;
    const found = c.db.tickets.filter((t) =>
      (!productKey || t.productKey === productKey)
      && (!a.status || (t.type !== "epic" && same(statusName(c, t), a.status)))
      && (assigneeId === undefined || (assigneeId === null ? !t.assigneeIds?.length : !!t.assigneeIds?.includes(assigneeId)))
      && (!a.type || t.type === a.type)
      && (!a.text || `${t.key} ${t.title}`.toLowerCase().includes(a.text.toLowerCase()))
      && (a.include_done || !["done", "cancelled"].includes(categoryOf(t) ?? "")));
    const number = (t: Ticket) => Number(t.key.split("-").pop());
    const sorted = [...found].sort((x, y) => x.productKey.localeCompare(y.productKey) || number(y) - number(x));
    return { total: found.length, tickets: sorted.slice(0, a.limit ?? 50).map((t) => summary(c, t)) };
  }));

  server.registerTool("get_ticket", {
    title: "Get a ticket",
    description: "One ticket in full: its fields, every template section (id, kind, value) and the latest updates.",
    inputSchema: { key: z.string().describe("Ticket key, e.g. CH-12") },
    annotations: READ,
  }, (a) => attempt(async () => {
    const c = await context();
    const t = findTicket(c, a.key);
    const isDone = (x: Ticket) => c.db.statusesByProduct[x.productKey]?.find((s) => s.id === x.statusId)?.category === "done";
    const json = ticketToJson(t, { tickets: c.db.tickets, statusName: (id) => c.db.statusesByProduct[t.productKey]?.find((s) => s.id === id)?.name ?? "", isDone, personName: (id) => personName(c, id) });
    const updates = c.db.comments.filter((m) => m.ticketKey === t.key).slice(-20).map((m) => ({ by: personName(c, m.authorId) ?? "someone", at: m.at, text: m.body }));
    return { ...json, url: ticketUrl(c, t.key), updates };
  }));

  server.registerTool("create_ticket", {
    title: "Create a ticket",
    description: "A new ticket in a product. Only product and title are needed; the rest can be set now or later.",
    inputSchema: {
      product: z.string().describe("Product key or name"),
      title: z.string().min(1).max(300),
      type: TYPES.optional().describe("task (default), bug or epic (an epic goes in the Epic list)"),
      status: z.string().optional().describe("List name; default Backlog. Not for epics"),
      assignee: z.string().optional().describe('"me", or a person\'s name or email — just that one person'),
      assignees: ASSIGNEES,
      priority: PRIORITIES.optional(),
      due: DATE.optional(),
      estimate_hours: z.number().min(0).max(1000).optional(),
      epic: z.string().optional().describe("The epic's key, to put this ticket under it"),
    },
    annotations: WRITE,
  }, (a) => attempt(() => change(() => "", (c) => {
    const productKey = findProduct(c, a.product).key;
    const epic = a.type === "epic";
    if (epic && a.status !== undefined) throw new ValidationError("Epics live in the Epic list — leave out status");
    // An epic is a ticket made in the product's Epic list; anything else can change type afterwards.
    const patch = patchOf(c, productKey, { type: epic ? undefined : a.type, assignee: a.assignee, assignees: a.assignees, priority: a.priority, due: a.due, estimate_hours: a.estimate_hours, epic: a.epic });
    const statusId = epic ? c.db.statusesByProduct[productKey]?.find((x) => x.system === "epic")?.id
      : a.status === undefined ? undefined : findStatus(c, productKey, a.status);
    return (db, me) => {
      const made = createTicket(db, me, productKey, a.title, statusId ? { statusId } : {});
      const steps = [{ name: "createTicket", args: [productKey, a.title, statusId ? { statusId } : {}] }];
      if (!Object.keys(patch).length) return { db: made.db, key: made.key, steps };
      return { db: updateTicket(made.db, me, made.key, patch), key: made.key, steps: [...steps, { name: "updateTicket", args: [made.key, patch] }] };
    };
  })));

  server.registerTool("update_ticket", {
    title: "Update a ticket",
    description: "Change any of a ticket's fields. Leave out what stays the same; an empty due date or epic clears it.",
    inputSchema: {
      key: z.string(),
      title: z.string().min(1).max(300).optional(),
      type: TYPES.optional(),
      status: z.string().optional().describe("List name"),
      assignee: z.string().optional().describe('"me", "none", or a person\'s name or email — just that one person'),
      assignees: ASSIGNEES,
      priority: PRIORITIES.optional(),
      due: z.union([DATE, z.literal("")]).optional(),
      estimate_hours: z.number().min(0).max(1000).optional(),
      epic: z.string().optional(),
    },
    annotations: { ...WRITE, idempotentHint: true },
  }, ({ key, ...fields }) => attempt(() => change((c) => findTicket(c, key).key, (c) => {
    const t = findTicket(c, key);
    const patch = patchOf(c, t.productKey, fields);
    return (db, me) => ({ db: updateTicket(db, me, t.key, patch), steps: [{ name: "updateTicket", args: [t.key, patch] }] });
  })));

  server.registerTool("move_ticket", {
    title: "Move a ticket",
    description: "Move a ticket to another list on its board (e.g. In Progress, Review, Done).",
    inputSchema: { key: z.string(), status: z.string().describe("List name") },
    annotations: { ...WRITE, idempotentHint: true },
  }, (a) => attempt(() => change((c) => findTicket(c, a.key).key, (c) => {
    const t = findTicket(c, a.key);
    const statusId = findStatus(c, t.productKey, a.status);
    return (db, me) => ({ db: moveTicket(db, me, t.key, statusId), steps: [{ name: "moveTicket", args: [t.key, statusId] }] });
  })));

  server.registerTool("add_comment", {
    title: "Post an update",
    description: "Post an update (comment) on a ticket, as you.",
    inputSchema: { key: z.string(), text: z.string().min(1).max(10_000) },
    annotations: WRITE,
  }, (a) => attempt(() => change((c) => findTicket(c, a.key).key, (c) => {
    const t = findTicket(c, a.key);
    return (db, me) => ({ db: addComment(db, me, t.key, a.text), steps: [{ name: "addComment", args: [t.key, a.text] }] });
  })));

  server.registerTool("set_section", {
    title: "Fill in a template section",
    description: "Replace one section of a ticket's template (get_ticket lists the ids and kinds). Text sections take text; list and checklist sections take lines (strings, or {text, done}); definition_of_done takes the lines that are done.",
    inputSchema: {
      key: z.string(),
      section: z.string().describe("Section id, e.g. acceptance_criteria"),
      value: z.union([z.string().max(20_000), z.array(z.union([z.string().max(2000), z.object({ text: z.string().max(2000), done: z.boolean().optional() })])).max(100)]),
    },
    annotations: { ...WRITE, idempotentHint: true },
  }, (a) => attempt(() => change((c) => findTicket(c, a.key).key, (c) => {
    const t = findTicket(c, a.key);
    const value = sectionValue(t, a.section, a.value);
    return (db, me) => ({ db: setSection(db, me, t.key, a.section, value), steps: [{ name: "setSection", args: [t.key, a.section, value] }] });
  })));

  server.registerTool("add_dependency", {
    title: "Add a dependency",
    description: "Mark a ticket as blocked by another (that one must be finished first). Loops are refused.",
    inputSchema: { key: z.string(), depends_on: z.string().describe("The ticket that must be finished first") },
    annotations: { ...WRITE, idempotentHint: true },
  }, (a) => attempt(() => change((c) => findTicket(c, a.key).key, (c) => {
    const t = findTicket(c, a.key);
    const dep = findTicket(c, a.depends_on).key;
    return (db, me) => ({ db: addDependency(db, me, t.key, dep), steps: [{ name: "addDependency", args: [t.key, dep] }] });
  })));

  return server;
}

// ---------- HTTP ----------

const rpcError = (status: number, message: string, headers: Record<string, string> = {}) =>
  Response.json({ jsonrpc: "2.0", error: { code: -32001, message }, id: null }, { status, headers: { "Cache-Control": "no-store", ...headers } });

/** The body, read up to `max` bytes — whether or not the client said how long it is. Null when it's longer. */
async function bodyUpTo(req: Request, max: number): Promise<string | null> {
  const reader = req.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > max) { await reader.cancel(); return null; }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

const clientIp = (req: Request) => req.headers.get("x-forwarded-for")?.split(",").pop()?.trim() || "local";

/** One MCP request (POST /api/mcp). The bearer token says who is asking; everything else is the MCP SDK's. */
export async function handleMcp(req: Request, appUrl: string): Promise<Response> {
  // Stateless: no server-to-client stream to open (GET) and no session to end (DELETE).
  if (req.method !== "POST") return rpcError(405, "Send MCP requests with POST", { Allow: "POST" });
  // A browser page on another site must never reach this (DNS rebinding); MCP clients send no Origin at all.
  const origin = req.headers.get("origin");
  if (origin) {
    let host = "";
    try { host = new URL(origin).host; } catch { /* "null" and other junk: refused below */ }
    if (host !== (req.headers.get("host") ?? new URL(req.url).host)) return rpcError(403, "Requests from other websites aren't allowed");
  }
  try {
    limit(`mcp-ip:${clientIp(req)}`, ATTEMPTS_PER_MINUTE, MINUTE);
  } catch {
    return rpcError(429, "Too many requests — wait a minute");
  }
  const bearer = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  const who = bearer ? await tokenSession(bearer) : null;
  if (!who) {
    return rpcError(401, "Sign in with a 1Fold API token: Authorization: Bearer 1fold_… (make one from your name → Claude & MCP)",
      { "WWW-Authenticate": 'Bearer realm="1Fold"' });
  }
  try {
    limit(`mcp:${who.userId}:${who.orgId}`, REQUESTS_PER_MINUTE, MINUTE);
  } catch {
    return rpcError(429, "Too many requests — wait a minute");
  }
  const body = await bodyUpTo(req, MAX_BODY_BYTES);
  if (body === null) return rpcError(413, "That request is too large");
  const server = mcpServerFor(who, appUrl);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  try {
    return await transport.handleRequest(new Request(req.url, { method: "POST", headers: req.headers, body }));
  } finally {
    void server.close();
  }
}
