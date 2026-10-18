// MCP tools for docs (design: docs/specs/2026-10-18-docs-design.md §10). Read and write pages as the token's person,
// with their permissions: anyone who can see a space writes in it; only admins archive and restore. No delete tool —
// deleting for good happens only in Settings → Archived, by an admin typing the doc's name.
// The tools are a public contract: never rename or remove one or make an input required — only add.
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Db } from "../../data/db.ts";
import { PANEL_SLUG } from "../../data/session.ts";
import { archiveDocs, moveDoc, restoreDocs, updateDoc, ValidationError } from "../../domain/commands/index.ts";
import { DOC_TEMPLATES } from "../../domain/docTemplates.ts";
import type { Doc, Panel, Person, Product } from "../../domain/types.ts";
import type { SessionRow } from "../accounts.ts";
import { createDoc, DocConflict, readDoc, saveBody, searchDocs } from "../docs.ts";

interface DocCtx { db: Db; me: Person; meId: string; panel: Panel; appUrl: string }
type Change = (db: Db, me: Person) => { db: Db; steps: { name: string; args: unknown[] }[] };

export interface DocToolDeps {
  who: SessionRow;
  context: () => Promise<DocCtx>;
  changeCompany: (run: (c: DocCtx) => Change, then: (after: DocCtx) => unknown) => Promise<unknown>;
  attempt: (fn: () => Promise<unknown>) => Promise<{ content: { type: "text"; text: string }[]; isError?: boolean }>;
  findProduct: (c: DocCtx, key: string) => Product;
}

const READ = { readOnlyHint: true, openWorldHint: false } as const;
const WRITE = { readOnlyHint: false, destructiveHint: false, openWorldHint: false } as const;
const DOC_ID = /\/(?:d|docs)\/([A-Za-z0-9-]{8,})/;
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export function registerDocTools(server: McpServer, { who, context, changeCompany, attempt, findProduct }: DocToolDeps) {
  const url = (c: DocCtx, id: string) => `${c.appUrl}/${PANEL_SLUG[c.panel]}/d/${id}`;
  const spaceKey = (c: DocCtx, space?: string) => (!space || /^(company|company docs)$/i.test(space.trim()) ? "" : findProduct(c, space).key);
  const spaceName = (c: DocCtx, d: Doc) => (d.productKey ? c.db.products.find((p) => p.key === d.productKey)?.name ?? d.productKey : "company");
  const personName = (c: DocCtx, id?: string) => c.db.people.find((p) => p.id === id)?.name;

  /** A doc by id, link or exact title, among the docs this person can see. */
  function findDoc(c: DocCtx, ref: string): Doc {
    const id = DOC_ID.exec(ref)?.[1] ?? ref.trim();
    const byId = c.db.docs.find((d) => d.id === id);
    if (byId) return byId;
    const byTitle = c.db.docs.filter((d) => same(d.title, ref));
    if (byTitle.length === 1) return byTitle[0];
    if (byTitle.length > 1) throw new ValidationError(`Several docs are called "${ref}": ${byTitle.map((d) => `${d.id} (${spaceName(c, d)})`).join(", ")}. Use the id.`);
    throw new ValidationError(`No doc "${ref}" that you can see. Try search_docs or list_docs.`);
  }
  const meta = (c: DocCtx, d: Doc) => ({
    id: d.id, title: d.title, icon: d.icon ?? null, space: spaceName(c, d), parent: d.parentId ?? null,
    updated_at: d.updatedAt ?? d.updated, updated_by: personName(c, d.updatedBy ?? d.authorId) ?? null, archived: !!d.archivedAt, url: url(c, d.id),
  });
  const full = async (id: string) => {
    const [c, open] = await Promise.all([context(), readDoc(who, id)]);
    return { ...meta(c, open.doc), rev: open.rev, markdown: open.body };
  };

  server.registerTool("list_docs", {
    title: "List docs",
    description: "Pages in a docs space — a project (key or name) or \"company\" — or in every space you can see when left out. Each has its parent page (null at the top). Archived pages only with include_archived (admins).",
    inputSchema: { space: z.string().optional().describe("Project key or name, or \"company\""), include_archived: z.boolean().optional() },
    annotations: READ,
  }, (a) => attempt(async () => {
    const c = await context();
    const key = a.space === undefined ? undefined : spaceKey(c, a.space);
    return c.db.docs.filter((d) => (key === undefined || d.productKey === key) && (a.include_archived || !d.archivedAt)).map((d) => meta(c, d));
  }));

  server.registerTool("search_docs", {
    title: "Search docs",
    description: "Full-text search over the titles and text of the docs you can see. Words match as prefixes.",
    inputSchema: { query: z.string().min(1).max(200) },
    annotations: READ,
  }, (a) => attempt(async () => {
    const c = await context();
    return (await searchDocs(who, a.query)).map((h) => ({ id: h.id, title: h.title, space: h.productKey ? h.productKey : "company", snippet: h.snippet.replace(/[«»]/g, ""), url: url(c, h.id) }));
  }));

  server.registerTool("get_doc", {
    title: "Get a doc",
    description: "A doc's details and its full text as Markdown, by id, link or exact title. `rev` is its revision: pass it as base_rev to update_doc so you never overwrite someone's newer edit.",
    inputSchema: { doc: z.string().describe("Doc id, link (…/d/<id>) or exact title") },
    annotations: READ,
  }, (a) => attempt(async () => full(findDoc(await context(), a.doc).id)));

  server.registerTool("create_doc", {
    title: "Create a doc",
    description: `A new page in a space (a project, or "company" when left out), optionally inside another page, from a template and/or with your Markdown. Templates: ${DOC_TEMPLATES.map((t) => t.id).join(", ")}.`,
    inputSchema: {
      title: z.string().min(1).max(200),
      space: z.string().optional().describe("Project key or name, or \"company\" (the default)"),
      parent: z.string().optional().describe("The page to put it inside: id, link or exact title"),
      template: z.enum(DOC_TEMPLATES.map((t) => t.id) as [string, ...string[]]).optional(),
      markdown: z.string().max(1_000_000).optional().describe("The body as Markdown (replaces the template's)"),
    },
    annotations: { ...WRITE, idempotentHint: false },
  }, (a) => attempt(async () => {
    const c = await context();
    const productKey = spaceKey(c, a.space);
    const parentId = a.parent ? findDoc(c, a.parent).id : undefined;
    const { id } = await createDoc(who, { title: a.title, productKey: productKey || undefined, parentId, template: a.template, body: a.markdown }, "mcp");
    return full(id);
  }));

  server.registerTool("update_doc", {
    title: "Update a doc",
    description: "Change a doc's title or icon, replace its text (markdown) or add to the end of it (append). With base_rev (from get_doc), a change is refused if someone saved since — then get_doc again and redo it.",
    inputSchema: {
      doc: z.string().describe("Doc id, link or exact title"),
      title: z.string().min(1).max(200).optional(),
      icon: z.string().max(16).optional().describe("One emoji, or \"\" to remove it"),
      markdown: z.string().max(1_000_000).optional().describe("The whole new text"),
      append: z.string().max(1_000_000).optional().describe("Markdown to add at the end"),
      base_rev: z.number().int().min(0).optional(),
    },
    annotations: { ...WRITE, idempotentHint: false },
  }, (a) => attempt(async () => {
    const c = await context();
    const doc = findDoc(c, a.doc);
    if (a.title !== undefined || a.icon !== undefined) {
      const patch = { ...(a.title !== undefined && { title: a.title }), ...(a.icon !== undefined && { icon: a.icon || null }) };
      await changeCompany(() => (db, me) => ({ db: updateDoc(db, me, doc.id, patch), steps: [{ name: "updateDoc", args: [doc.id, patch] }] }), () => null);
    }
    if (a.markdown !== undefined || a.append !== undefined) {
      const open = await readDoc(who, doc.id);
      const body = a.markdown ?? [open.body.trimEnd(), a.append ?? ""].filter(Boolean).join("\n\n");
      try {
        await saveBody(who, doc.id, { body, baseRev: a.base_rev ?? open.rev });
      } catch (e) {
        if (e instanceof DocConflict) throw new ValidationError(`Changed since base_rev ${a.base_rev} (now rev ${e.latest.rev}) — get_doc again and redo your edit`);
        throw e;
      }
    }
    return full(doc.id);
  }));

  server.registerTool("move_doc", {
    title: "Move a doc",
    description: "Put a page inside another page of the same space (parent), or at the top level (parent: \"\"), optionally before a sibling.",
    inputSchema: {
      doc: z.string().describe("Doc id, link or exact title"),
      parent: z.string().optional().describe("The new parent page, or \"\" for the top level"),
      before: z.string().optional().describe("Put it before this sibling page"),
    },
    annotations: WRITE,
  }, (a) => attempt(async () => {
    const c = await context();
    const doc = findDoc(c, a.doc);
    const to = {
      ...(a.parent !== undefined && { parentId: a.parent === "" ? null : findDoc(c, a.parent).id }),
      ...(a.before && { beforeId: findDoc(c, a.before).id }),
    };
    return changeCompany(() => (db, me) => ({ db: moveDoc(db, me, doc.id, to), steps: [{ name: "moveDoc", args: [doc.id, to] }] }), (after) => meta(after, findDoc(after, doc.id)));
  }));

  server.registerTool("archive_doc", {
    title: "Archive a doc",
    description: "Archive a page with its subpages: hidden from everyone but admins and read-only, until restored. Admins only. (Deleting for good is only in Settings → Archived.)",
    inputSchema: { doc: z.string().describe("Doc id, link or exact title") },
    annotations: { ...WRITE, idempotentHint: true },
  }, (a) => attempt(async () => {
    const c = await context();
    const doc = findDoc(c, a.doc);
    return changeCompany(() => (db, me) => ({ db: archiveDocs(db, me, [doc.id]), steps: [{ name: "archiveDocs", args: [[doc.id]] }] }), (after) => meta(after, findDoc(after, doc.id)));
  }));

  server.registerTool("restore_doc", {
    title: "Restore an archived doc",
    description: "Bring an archived page back with the subpages archived together with it. Admins only.",
    inputSchema: { doc: z.string().describe("Doc id, link or exact title") },
    annotations: WRITE,
  }, (a) => attempt(async () => {
    const c = await context();
    const doc = findDoc(c, a.doc);
    return changeCompany(() => (db, me) => ({ db: restoreDocs(db, me, [doc.id]), steps: [{ name: "restoreDocs", args: [[doc.id]] }] }), (after) => meta(after, findDoc(after, doc.id)));
  }));
}
