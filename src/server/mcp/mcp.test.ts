// The MCP server over real HTTP requests on a real Postgres: tokens (once, revocable), who may call it, the tools,
// and that every tool runs with the token owner's permissions — never another company's data.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { acceptInvitation, readSession, setPassword, signUpCompany, type SessionRow } from "../accounts.ts";
import { applySteps, createInvites, viewFor } from "../changes.ts";
import { freshDatabase } from "../testing/db.ts";
import { handleMcp } from "./server.ts";
import { createApiToken, listApiTokens, revokeApiToken } from "./tokens.ts";

let pg: Awaited<ReturnType<typeof freshDatabase>>;
before(async () => { pg = await freshDatabase(); });
after(async () => { await pg.drop(); });

const APP = "https://1fold.test";
const PASSWORD = "Correct-Horse-42";

async function rpc(token: string | null, method: string, params: unknown = {}, headers: Record<string, string> = {}) {
  const res = await handleMcp(new Request(`${APP}/api/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json", Accept: "application/json, text/event-stream",
      ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  }), APP);
  return { status: res.status, body: await res.json() as { result?: { content: { text: string }[]; isError?: boolean; tools?: { name: string }[]; serverInfo?: { name: string } }; error?: { message: string } } };
}
/** Calls a tool: its JSON answer, or the refusal's text. */
async function tool(token: string, name: string, args: Record<string, unknown> = {}) {
  const { body } = await rpc(token, "tools/call", { name, arguments: args });
  const text = body.result!.content[0].text;
  return body.result!.isError ? { refused: text } : { data: JSON.parse(text) };
}

let admin: SessionRow;
let dev: SessionRow;
let ayla = "";
let sam = "";
let adminToken = "";
let devToken = "";

test("tokens: shown once, listed without the secret, refused once revoked", async () => {
  const founder = await signUpCompany({ name: "Ayla Khan", email: "ayla@acme.example", password: PASSWORD, company: "Acme", slug: "acme-mcp" });
  admin = (await readSession(founder.token))!;
  ayla = founder.personId;
  const { invites } = await createInvites(admin, [{ email: "sam@acme.example", panel: "developer" }], APP);
  const joined = await acceptInvitation(invites[0].link.split("/invite/")[1], { name: "Sam Dev", password: PASSWORD });
  dev = (await readSession(joined.token))!;
  sam = joined.personId;

  const made = await createApiToken(admin, "  Claude Code   on my laptop ");
  assert.match(made.token, /^1fold_[\w-]{43}$/);
  assert.equal(made.name, "Claude Code on my laptop");
  adminToken = made.token;
  const listed = await listApiTokens(admin);
  assert.deepEqual(listed.map((t) => [t.name, t.hint]), [["Claude Code on my laptop", made.token.slice(-4)]]);
  assert.ok(!JSON.stringify(listed).includes(made.token));

  const throwaway = await createApiToken(admin, "old");
  assert.equal((await rpc(throwaway.token, "tools/list")).status, 200);
  await revokeApiToken(admin, throwaway.id);
  assert.equal((await rpc(throwaway.token, "tools/list")).status, 401);
  await assert.rejects(revokeApiToken(dev, made.id)); // not theirs
  devToken = (await createApiToken(dev, "Sam's Claude")).token;
});

test("only a token gets in, and never from another website", async () => {
  assert.equal((await rpc(null, "tools/list")).status, 401);
  assert.equal((await rpc("1fold_not-a-real-token", "tools/list")).status, 401);
  assert.equal((await rpc(adminToken, "tools/list", {}, { Origin: "https://evil.example" })).status, 403);
  const init = await rpc(adminToken, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } });
  assert.equal(init.body.result!.serverInfo!.name, "1fold");
  const names = (await rpc(adminToken, "tools/list")).body.result!.tools!.map((t) => t.name).sort();
  assert.deepEqual(names, [
    "add_comment", "add_dependency", "add_member", "archive_doc", "archive_product", "archive_ticket", "create_doc", "create_group",
    "create_ticket", "delete_group", "get_doc", "get_ticket", "list_doc_versions", "list_docs", "list_groups", "list_members", "list_products",
    "list_tickets", "move_doc", "move_product", "move_ticket", "remove_member", "rename_group", "restore_doc", "restore_doc_version",
    "restore_product", "restore_ticket",
    "search_docs", "set_section", "update_doc", "update_ticket",
  ]);
  assert.ok(!names.some((n) => /(delete|remove)_(ticket|product|doc)/.test(n))); // no ticket, product or doc is ever deleted over MCP
});

test("the tools work on tickets as the token's owner, and every change is audited as MCP", async () => {
  await applySteps(admin, [{ name: "createProduct", args: [{ key: "CH", name: "Checkout", type: "internal", pmId: ayla, projectManagerId: ayla }] }]);
  const products = await tool(adminToken, "list_products");
  assert.deepEqual(products.data.map((p: { key: string; lists: string[] }) => [p.key, p.lists]), [["CH", ["Backlog", "To Do", "In Progress", "Review", "Done"]]]);

  const made = await tool(adminToken, "create_ticket", { product: "checkout", title: "Build the cart", assignee: "me", priority: "high", due: "2026-10-31", status: "To Do" });
  assert.deepEqual([made.data.key, made.data.status, made.data.assignee, made.data.priority, made.data.due, made.data.url],
    ["CH-1", "To Do", "Ayla Khan", "high", "2026-10-31", `${APP}/admin/t/CH-1`]);
  await tool(adminToken, "create_ticket", { product: "CH", title: "Design the cart" });

  assert.equal((await tool(adminToken, "move_ticket", { key: "ch-1", status: "in progress" })).data.status, "In Progress");
  assert.equal((await tool(adminToken, "update_ticket", { key: "CH-1", due: "", estimate_hours: 5 })).data.due, null);
  await tool(adminToken, "add_comment", { key: "CH-1", text: "Started on the totals." });
  await tool(adminToken, "set_section", { key: "CH-1", section: "acceptance_criteria", value: ["Totals add up", { text: "Coupons apply", done: true }] });
  await tool(adminToken, "set_section", { key: "CH-1", section: "goal", value: "Let people pay." });
  await tool(adminToken, "set_section", { key: "CH-1", section: "definition_of_done", value: ["reviewed"] });
  await tool(adminToken, "add_dependency", { key: "CH-1", depends_on: "CH-2" });
  assert.match((await tool(adminToken, "add_dependency", { key: "CH-2", depends_on: "CH-1" })).refused!, /loop/);

  const ticket = (await tool(adminToken, "get_ticket", { key: "CH-1" })).data;
  const section = (id: string) => ticket.sections.find((x: { id: string }) => x.id === id).value;
  assert.equal(section("goal"), "Let people pay.");
  assert.deepEqual(section("acceptance_criteria"), [{ text: "Totals add up", done: false }, { text: "Coupons apply", done: true }]);
  assert.equal(section("definition_of_done").filter((d: { done: boolean }) => d.done).length, 1);
  assert.deepEqual(section("dependencies").map((d: { key: string }) => d.key), ["CH-2"]);
  assert.deepEqual(ticket.updates.map((u: { by: string; text: string }) => [u.by, u.text]), [["Ayla Khan", "Started on the totals."]]);

  const listed = await tool(adminToken, "list_tickets", { product: "CH", assignee: "me" });
  assert.deepEqual(listed.data.tickets.map((t: { key: string }) => t.key), ["CH-1"]);
  assert.match((await tool(adminToken, "move_ticket", { key: "CH-1", status: "Nowhere" })).refused!, /No list "Nowhere" in CH/);
  assert.match((await tool(adminToken, "update_ticket", { key: "CH-1", due: "2026-02-30" })).refused!, /real date/);

  const audited = await pg.asOwner<{ command: string }>(`select command from audit_log where source = 'mcp' order by id`);
  assert.deepEqual(audited.map((r) => r.command), [
    "createTicket", "updateTicket", "createTicket", "moveTicket", "updateTicket", "addComment", "setSection", "setSection", "setSection", "addDependency",
  ]);
  assert.equal((await viewFor(admin)).db.tickets.find((t) => t.key === "CH-1")!.estimateH, 5); // the website sees it too

  const epic = await tool(adminToken, "create_ticket", { product: "CH", title: "Payments", type: "epic" });
  assert.deepEqual([epic.data.key, epic.data.type], ["CH-3", "epic"]); // made in the Epic list
  assert.match((await tool(adminToken, "create_ticket", { product: "CH", title: "X", type: "epic", status: "To Do" })).refused!, /Epic list/);
});

test("only POST, never an oversized body, even without a length", async () => {
  const get = await handleMcp(new Request(`${APP}/api/mcp`, { headers: { Authorization: `Bearer ${adminToken}`, Accept: "text/event-stream" } }), APP);
  assert.equal(get.status, 405);
  const huge = new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(`{"x":"${"a".repeat(600 * 1024)}"}`)); c.close(); } });
  const res = await handleMcp(new Request(`${APP}/api/mcp`, {
    method: "POST", body: huge, duplex: "half",
    headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
  } as RequestInit), APP);
  assert.equal(res.status, 413);
});

test("a developer's token reaches only their products; another company's reaches nothing of this one", async () => {
  assert.deepEqual((await tool(devToken, "list_products")).data, []);
  assert.match((await tool(devToken, "get_ticket", { key: "CH-1" })).refused!, /No ticket CH-1/);
  assert.match((await tool(devToken, "create_ticket", { product: "CH", title: "Sneaky" })).refused!, /No product "CH"/);
  await applySteps(admin, [{ name: "setMember", args: ["CH", sam, true] }]);
  assert.equal((await tool(devToken, "create_ticket", { product: "CH", title: "My own" })).data.key, "CH-4");
  const both = (await tool(adminToken, "update_ticket", { key: "CH-4", assignees: ["me", "Sam Dev"] })).data;
  assert.deepEqual([both.assignee, both.assignees], ["Ayla Khan", ["Ayla Khan", "Sam Dev"]]); // any number of people
  assert.ok((await tool(devToken, "list_tickets", { assignee: "me" })).data.tickets.some((t: { key: string }) => t.key === "CH-4"));
  // Archive: off the lists, read-only, gone for the developer; restored, it's back. Developers can't archive.
  assert.match((await tool(devToken, "archive_ticket", { key: "CH-4" })).refused!, /Not allowed/);
  assert.equal((await tool(adminToken, "archive_ticket", { key: "CH-4" })).data.archived, true);
  assert.ok(!(await tool(adminToken, "list_tickets", { product: "CH" })).data.tickets.some((t: { key: string }) => t.key === "CH-4"));
  assert.ok((await tool(adminToken, "list_tickets", { product: "CH", include_archived: true })).data.tickets.some((t: { key: string }) => t.key === "CH-4"));
  assert.match((await tool(adminToken, "update_ticket", { key: "CH-4", title: "x" })).refused!, /CH-4 is archived — restore it first/);
  assert.match((await tool(devToken, "get_ticket", { key: "CH-4" })).refused!, /No ticket CH-4/);
  assert.equal((await tool(adminToken, "restore_ticket", { key: "CH-4" })).data.archived, undefined);
  assert.equal((await tool(devToken, "get_ticket", { key: "CH-4" })).data.key, "CH-4");

  const other = await signUpCompany({ name: "Eve", email: "eve@other.example", password: PASSWORD, company: "Other", slug: "other-mcp" });
  const eveToken = (await createApiToken((await readSession(other.token))!, "Eve's")).token;
  assert.deepEqual((await tool(eveToken, "list_products")).data, []);
  assert.match((await tool(eveToken, "get_ticket", { key: "CH-1" })).refused!, /No ticket CH-1/);
  assert.equal((await tool(eveToken, "list_tickets", {})).data.total, 0);
});

test("projects over MCP: admins and managers archive, restore, group and staff them; developers can't; nothing deletes one", async () => {
  const { invites } = await createInvites(admin, [{ email: "mo@acme.example", panel: "manager" }], APP);
  const mo = await acceptInvitation(invites[0].link.split("/invite/")[1], { name: "Mo Manager", password: PASSWORD });
  await applySteps(admin, [{ name: "setMember", args: ["CH", mo.personId, true] }]);
  const moToken = (await createApiToken((await readSession(mo.token))!, "Mo's Claude")).token;
  assert.ok(!(await rpc(moToken, "tools/list")).body.result!.tools!.some((t) => /delete_product|remove_product/.test(t.name)));

  // Archive: read-only, out of lists, and gone for the developer.
  assert.match((await tool(devToken, "archive_product", { product: "CH" })).refused!, /Only admins and managers/);
  assert.deepEqual((await tool(moToken, "archive_product", { product: "Checkout" })).data, { key: "CH", name: "Checkout", group: null, archived: true });
  assert.deepEqual((await tool(moToken, "list_products")).data, []);
  assert.equal((await tool(moToken, "list_products", { include_archived: true })).data[0].archived, true);
  assert.equal((await tool(adminToken, "list_tickets", {})).data.total, 0);
  assert.ok((await tool(adminToken, "list_tickets", { product: "CH" })).data.total > 0); // named: still readable
  assert.match((await tool(adminToken, "create_ticket", { product: "CH", title: "x" })).refused!, /Checkout is archived — restore it first/);
  assert.deepEqual((await tool(devToken, "list_products", { include_archived: true })).data, []);
  assert.match((await tool(devToken, "get_ticket", { key: "CH-4" })).refused!, /No ticket CH-4/);
  assert.match((await tool(devToken, "restore_product", { product: "CH" })).refused!, /Only admins and managers/);
  assert.equal((await tool(moToken, "restore_product", { product: "CH" })).data.archived, false);
  assert.equal((await tool(devToken, "list_products")).data[0].key, "CH"); // back for everyone

  // Groups: make one, move the product in, rename it, delete it — the product stays, ungrouped.
  assert.match((await tool(devToken, "create_group", { name: "Mine" })).refused!, /Only admins and managers/);
  const made = (await tool(moToken, "create_group", { name: "Clients" })).data;
  assert.equal((await tool(moToken, "move_product", { product: "CH", group: "clients" })).data.group, "Clients");
  assert.deepEqual((await tool(adminToken, "list_groups")).data.groups, [{ id: made.id, name: "Clients", products: ["CH"] }]);
  await tool(moToken, "rename_group", { group: "Clients", name: "Client work" });
  assert.deepEqual((await tool(moToken, "delete_group", { group: made.id })).data, { deleted: "Client work", now_ungrouped: ["CH"] });
  assert.equal((await tool(adminToken, "list_products")).data[0].group, null);

  // Members: a manager lists, removes and adds back a developer; a developer can't even list them.
  const members = async () => (await tool(moToken, "list_members", { product: "CH" })).data.members.map((m: { name: string }) => m.name);
  assert.ok((await members()).includes("Sam Dev"));
  await tool(moToken, "remove_member", { product: "CH", person: "Sam Dev" });
  assert.ok(!(await members()).includes("Sam Dev"));
  assert.deepEqual((await tool(devToken, "list_products")).data, []); // off the product: out of Sam's view
  await tool(moToken, "add_member", { product: "CH", person: "Sam Dev" });
  assert.ok((await members()).includes("Sam Dev"));
  assert.match((await tool(devToken, "list_members", {})).refused!, /Only admins and managers/);
  assert.ok((await tool(adminToken, "list_members", {})).data.some((p: { name: string; products: string[] }) => p.name === "Sam Dev" && p.products.includes("CH")));
});

test("docs over MCP: anyone on a space reads and writes, edits never overwrite a newer save, only admins archive", async () => {
  type Meta = { id: string; title: string; space: string; parent: string | null; archived: boolean; rev: number; markdown: string; url: string };
  const made: Meta = (await tool(devToken, "create_doc", { title: "Checkout notes", space: "CH", template: "meeting" })).data;
  assert.deepEqual([made.space, made.rev], ["Checkout", 1]);
  assert.match(made.markdown, /^## Attendees/);
  assert.match(made.url, /\/dev\/d\//);
  const appended: Meta = (await tool(devToken, "update_doc", { doc: made.id, append: "## Extra\n\nMore detail.", base_rev: made.rev })).data;
  assert.match(appended.markdown, /## Extra\n\nMore detail\.$/);
  assert.equal(appended.rev, 2);
  assert.match((await tool(adminToken, "update_doc", { doc: made.id, markdown: "stale", base_rev: 1 })).refused!, /Changed since base_rev 1 \(now rev 2\)/);
  assert.equal((await tool(adminToken, "get_doc", { doc: "checkout notes" })).data.id, made.id);
  assert.ok((await tool(adminToken, "search_docs", { query: "extra det" })).data.some((h: { id: string }) => h.id === made.id));
  const child: Meta = (await tool(adminToken, "create_doc", { title: "Payment flow", space: "CH", parent: made.id })).data;
  assert.equal(child.parent, made.id);
  assert.match((await tool(devToken, "archive_doc", { doc: made.id })).refused!, /Not allowed/);
  assert.equal((await tool(adminToken, "archive_doc", { doc: made.id })).data.archived, true);
  assert.match((await tool(devToken, "get_doc", { doc: child.id })).refused!, /No doc/); // archived with its parent
  assert.equal((await tool(adminToken, "restore_doc", { doc: made.id })).data.archived, false);
  assert.equal((await tool(devToken, "get_doc", { doc: child.id })).data.title, "Payment flow");
  await applySteps(admin, [{ name: "createProduct", args: [{ key: "XY", name: "Secret", type: "internal", pmId: ayla, projectManagerId: ayla }] }]);
  const secret: Meta = (await tool(adminToken, "create_doc", { title: "Secret plan", space: "XY" })).data;
  assert.match((await tool(devToken, "get_doc", { doc: secret.id })).refused!, /No doc/);
  assert.ok((await tool(devToken, "list_docs", {})).data.every((d: Meta) => d.id !== secret.id));
  assert.equal((await tool(devToken, "create_doc", { title: "Handbook" })).data.space, "company");
});

test("a token stops working when its owner is turned off, or their password changes", async () => {
  await applySteps(admin, [{ name: "updatePerson", args: [sam, { active: false }] }]);
  assert.equal((await rpc(devToken, "tools/list")).status, 401);
  await applySteps(admin, [{ name: "updatePerson", args: [sam, { active: true }] }]);
  assert.equal((await rpc(devToken, "tools/list")).status, 200);

  await setPassword(admin, ayla, "Another-Horse-77"); // e.g. after a stolen password: the tokens it made must die too
  assert.equal((await rpc(adminToken, "tools/list")).status, 401);
  assert.deepEqual(await listApiTokens(admin), []);
});
