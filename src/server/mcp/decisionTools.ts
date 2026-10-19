// MCP tools for decision records: anyone who sees a project reads its decisions; those who may record decisions
// (admins, the project's managers) record and update them. No delete tool — a decision that no longer holds is
// rejected or superseded, so the log keeps why things changed.
// The tools are a public contract: never rename or remove one or make an input required — only add.
import { randomUUID } from "node:crypto";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { PANEL_SLUG } from "../../data/session.ts";
import { addDecision, updateDecision, ValidationError, type DecisionInput } from "../../domain/commands/index.ts";
import type { Decision, DecisionStatus } from "../../domain/types.ts";
import type { DocToolDeps } from "./docTools.ts";

type Ctx = Awaited<ReturnType<DocToolDeps["context"]>>;
type Patch = Parameters<typeof updateDecision>[3];

const READ = { readOnlyHint: true, openWorldHint: false } as const;
const WRITE = { readOnlyHint: false, destructiveHint: false, openWorldHint: false } as const;
const STATUS = z.enum(["proposed", "accepted", "rejected", "superseded"] satisfies DecisionStatus[]);
const DECISION_LINK = /[?&]d=([A-Za-z0-9-]{8,})/;
const DOC_LINK = /\/(?:d|docs)\/([A-Za-z0-9-]{8,})/;
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const PARTS = {
  context: z.string().max(8000).optional().describe("What called for a decision: the problem, the constraints"),
  alternatives: z.string().max(8000).optional().describe("What else was considered, and why not"),
  consequences: z.string().max(8000).optional().describe("What it means: trade-offs, risks, follow-ups"),
  tickets: z.array(z.string()).max(50).optional().describe("Ticket keys it drives, e.g. [\"CH-12\"]"),
  docs: z.array(z.string()).max(50).optional().describe("Docs behind it: id, link or exact title"),
};

export function registerDecisionTools(server: McpServer, { context, changeCompany, attempt, findProduct }: DocToolDeps) {
  const url = (c: Ctx, d: Decision) => `${c.appUrl}/${PANEL_SLUG[c.panel]}/products/${d.productKey}/decisions?d=${d.id}`;

  /** A decision by id, link or exact title, among the decisions this person can see. */
  function findDecision(c: Ctx, ref: string): Decision {
    const id = DECISION_LINK.exec(ref)?.[1] ?? ref.trim();
    const byId = c.db.decisions.find((d) => d.id === id);
    if (byId) return byId;
    const byTitle = c.db.decisions.filter((d) => same(d.title, ref));
    if (byTitle.length === 1) return byTitle[0];
    if (byTitle.length > 1) throw new ValidationError(`Several decisions are called "${ref}": ${byTitle.map((d) => `${d.id} (${d.productKey})`).join(", ")}. Use the id.`);
    throw new ValidationError(`No decision "${ref}" that you can see. Try list_decisions.`);
  }
  const ticketKeys = (c: Ctx, keys: string[]) => keys.map((k) => {
    const t = c.db.tickets.find((x) => same(x.key, k));
    if (!t) throw new ValidationError(`No ticket ${k} that you can see`);
    return t.key;
  });
  const docIds = (c: Ctx, refs: string[]) => refs.map((ref) => {
    const id = DOC_LINK.exec(ref)?.[1] ?? ref.trim();
    const live = c.db.docs.filter((d) => !d.archivedAt);
    const found = live.find((d) => d.id === id) ?? live.filter((d) => same(d.title, ref)).at(0);
    if (!found) throw new ValidationError(`No doc "${ref}" that you can see. Try search_docs.`);
    return found.id;
  });
  const record = (c: Ctx, d: Decision) => {
    const byId = (id: string) => c.db.decisions.find((x) => x.id === id);
    const replacedBy = d.supersededBy ? byId(d.supersededBy) : undefined;
    return {
      id: d.id, product: d.productKey, title: d.title, status: d.status ?? "accepted", why: d.why,
      context: d.context ?? null, alternatives: d.alternatives ?? null, consequences: d.consequences ?? null,
      decided_by: c.db.people.find((p) => p.id === d.byId)?.name ?? null, date: d.date, updated_at: d.updatedAt ?? null,
      tickets: d.ticketKeys ?? [],
      docs: (d.docIds ?? []).flatMap((id) => c.db.docs.filter((x) => x.id === id).map((x) => ({ id: x.id, title: x.title }))),
      superseded_by: replacedBy ? { id: replacedBy.id, title: replacedBy.title } : null,
      supersedes: c.db.decisions.filter((x) => x.supersededBy === d.id).map((x) => ({ id: x.id, title: x.title })),
      url: url(c, d),
    };
  };

  server.registerTool("list_decisions", {
    title: "List decisions",
    description: "A project's decision log (or every project you can see), newest first: what was decided, why, its status and links. Filter by status or words.",
    inputSchema: {
      product: z.string().optional().describe("Product key or name, e.g. CH"),
      status: STATUS.optional(),
      text: z.string().optional().describe("Words to find in the title or any part of the record"),
    },
    annotations: READ,
  }, (a) => attempt(async () => {
    const c = await context();
    const key = a.product ? findProduct(c, a.product).key : undefined;
    const words = a.text?.trim().toLowerCase();
    return c.db.decisions
      .filter((d) => (!key || d.productKey === key) && (!a.status || (d.status ?? "accepted") === a.status))
      .filter((d) => !words || [d.title, d.why, d.context, d.alternatives, d.consequences].join(" ").toLowerCase().includes(words))
      .sort((x, y) => y.date.localeCompare(x.date) || y.id.localeCompare(x.id))
      .map((d) => record(c, d));
  }));

  server.registerTool("get_decision", {
    title: "Get a decision",
    description: "One decision record by id, link (…/decisions?d=<id>) or exact title: context, the decision and why, alternatives, consequences, linked tickets and docs, and what superseded it.",
    inputSchema: { decision: z.string().describe("Decision id, link or exact title") },
    annotations: READ,
  }, (a) => attempt(async () => {
    const c = await context();
    return record(c, findDecision(c, a.decision));
  }));

  server.registerTool("record_decision", {
    title: "Record a decision",
    description: "Add a decision to a project's log: what was decided and why, and optionally its context, the alternatives, the consequences and the tickets and docs it relates to. Status is accepted unless you say proposed (still open). Admins and the project's managers only.",
    inputSchema: {
      product: z.string().describe("Product key or name, e.g. CH"),
      title: z.string().min(1).max(140).describe("The decision, e.g. \"Use Postgres full-text search\""),
      why: z.string().min(1).max(8000).describe("What was decided, and why"),
      status: STATUS.optional(),
      ...PARTS,
    },
    annotations: { ...WRITE, idempotentHint: false },
  }, (a) => attempt(async () => {
    const c = await context();
    const key = findProduct(c, a.product).key;
    const input: DecisionInput = {
      title: a.title, why: a.why, ...(a.status && { status: a.status }),
      ...(a.context !== undefined && { context: a.context }), ...(a.alternatives !== undefined && { alternatives: a.alternatives }),
      ...(a.consequences !== undefined && { consequences: a.consequences }),
      ...(a.tickets && { ticketKeys: ticketKeys(c, a.tickets) }), ...(a.docs && { docIds: docIds(c, a.docs) }),
    };
    const id = randomUUID();
    return changeCompany(() => (db, me) => ({ db: addDecision(db, me, key, input, id), steps: [{ name: "addDecision", args: [key, input, id] }] }),
      (after) => record(after, findDecision(after, id)));
  }));

  server.registerTool("update_decision", {
    title: "Update a decision",
    description: "Change a decision record: its title, why, status or any part; tickets and docs replace the linked lists. superseded_by names the later decision that replaces it (status becomes superseded); \"\" clears it. Admins and the project's managers only.",
    inputSchema: {
      decision: z.string().describe("Decision id, link or exact title"),
      title: z.string().min(1).max(140).optional(),
      why: z.string().min(1).max(8000).optional(),
      status: STATUS.optional(),
      ...PARTS,
      superseded_by: z.string().optional().describe("The decision that replaces it: id, link or exact title; \"\" to clear"),
    },
    annotations: { ...WRITE, idempotentHint: true },
  }, (a) => attempt(async () => {
    const c = await context();
    const d = findDecision(c, a.decision);
    const clearing = a.superseded_by === "";
    const patch: Patch = {
      ...(a.title !== undefined && { title: a.title }), ...(a.why !== undefined && { why: a.why }),
      ...(a.context !== undefined && { context: a.context }), ...(a.alternatives !== undefined && { alternatives: a.alternatives }),
      ...(a.consequences !== undefined && { consequences: a.consequences }),
      ...(a.tickets && { ticketKeys: ticketKeys(c, a.tickets) }), ...(a.docs && { docIds: docIds(c, a.docs) }),
      ...(a.superseded_by !== undefined && { supersededBy: clearing ? null : findDecision(c, a.superseded_by).id }),
      // Cleared without a new status: it stands again, as in the app.
      ...(a.status ? { status: a.status } : clearing && d.status === "superseded" && { status: "accepted" as const }),
    };
    return changeCompany(() => (db, me) => ({ db: updateDecision(db, me, d.id, patch), steps: [{ name: "updateDecision", args: [d.id, patch] }] }),
      (after) => record(after, findDecision(after, d.id)));
  }));
}
