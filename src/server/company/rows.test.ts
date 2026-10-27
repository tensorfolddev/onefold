import { test } from "node:test";
import assert from "node:assert/strict";
import { demoDb } from "../../data/demo.ts";
import { fromRows, instant, orgRow, POSITIONED, stableJson, TABLES, toRows, type Row, type TableName } from "./rows.ts";

const withPositions = (tables: Record<TableName, Row[]>) =>
  Object.fromEntries(TABLES.map((t) => [t, tables[t].map((row, i) => (POSITIONED.has(t) ? { ...row, position: i + 1 } : row))])) as Record<TableName, Row[]>;

test("a company survives the trip to rows and back: same rows, same data", () => {
  const db = demoDb();
  const rows = toRows(db);
  const emails = new Map(db.people.map((p) => [p.id, p.email]));
  const back = fromRows(orgRow(db), withPositions(rows), emails);
  // Positioned lists must come back in the same order; logs come back in time order, so compare those as sets.
  const comparable = (t: TableName, list: Row[]) => (POSITIONED.has(t) ? list : [...list].sort((a, b) => a.id.localeCompare(b.id)));
  for (const t of TABLES) assert.equal(stableJson(comparable(t, toRows(back)[t])), stableJson(comparable(t, rows[t])), t);
  assert.deepEqual(orgRow(back), orgRow(db));
  assert.deepEqual(back.people.map((p) => [p.id, p.email, p.initials]), db.people.map((p) => [p.id, p.email, p.initials]));
  assert.deepEqual(back.tickets.map((t) => t.key), db.tickets.map((t) => t.key)); // board order kept
  assert.deepEqual(back.statusesByProduct.AP.map((s) => s.id), db.statusesByProduct.AP.map((s) => s.id));
  assert.equal(back.tickets.find((t) => t.key === "AP-12")!.sections?.summary !== undefined, db.tickets.find((t) => t.key === "AP-12")!.sections?.summary !== undefined);
});

test("every table is covered and child lists become rows of their own", () => {
  const rows = toRows(demoDb());
  assert.ok(rows.tickets.length > 10 && rows.boardLists.length > 10 && rows.productMembers.length > 0, "the fixture fills these tables");
  assert.ok(rows.productMembers.every((r) => r.id === `${r.productId}:${r.memberId}`));
  assert.ok(rows.tickets.every((r) => !("dependsOn" in r) && !("attachments" in r)));
});

test("times are stored as one unambiguous UTC spelling", () => {
  assert.equal(instant("2026-10-15T09:41:07"), "2026-10-15T09:41:07Z");
  assert.equal(instant("2026-10-15T09:41:07.123Z"), "2026-10-15T09:41:07Z");
  assert.equal(instant("2026-10-15 04:41:07+00"), "2026-10-15T04:41:07Z"); // how Postgres returns timestamptz
  assert.equal(instant("2026-10-15T09:41:07+05:00"), "2026-10-15T04:41:07Z");
  assert.ok(toRows(demoDb()).activity.every((a) => /Z$/.test(a.at as string)));
});

test("rows compare equal whatever order jsonb puts object keys in", () => {
  assert.equal(stableJson({ b: 1, a: { d: [1, { y: 2, x: 1 }], c: null } }), stableJson({ a: { c: null, d: [1, { x: 1, y: 2 }] }, b: 1 }));
  assert.equal(stableJson({ a: undefined, b: 1 }), stableJson({ b: 1 }));
});

test("docs keep their space, nesting, icon and archive through rows and back", () => {
  const db = demoDb();
  const extra = [
    { id: "d-co", productKey: "", kind: "Brief" as const, title: "Handbook", icon: "📘", updated: "2026-10-18", authorId: "u-tayyab",
      createdAt: "2026-10-18T09:00:00Z", updatedAt: "2026-10-18T09:05:00Z", updatedBy: "u-sara", rev: 4 },
    { id: "d-kid", productKey: "AP", parentId: "d-co", kind: "Design" as const, title: "Child", template: "design", cover: "dawn",
      updated: "2026-10-18", authorId: "u-sara", archivedAt: "2026-10-18T10:00:00Z", archivedBy: "u-tayyab" },
  ];
  const withDocs = { ...db, docs: [...db.docs, ...extra] };
  const rows = toRows(withDocs);
  assert.equal(rows.docs.find((r) => r.id === "d-co")!.productId, null); // the company's space is stored as NULL
  const back = fromRows(orgRow(withDocs), withPositions(rows), new Map(db.people.map((p) => [p.id, p.email])));
  assert.deepEqual(back.docs.slice(-2), extra);
});

test("a decision keeps its own label and note colour through rows and back", () => {
  const db = demoDb();
  const extra = { id: "dec-x", productKey: "AP", title: "Pause the importer", why: "Waiting on legal", byId: "u-tayyab", date: "2026-10-19",
    label: { name: "Suspended", color: "#a25ddc" }, color: "#ffcb00", body: "## Why\n\nLegal asked us to **pause** it." };
  const withOne = { ...db, decisions: [...db.decisions, extra] };
  const back = fromRows(orgRow(withOne), withPositions(toRows(withOne)), new Map(db.people.map((p) => [p.id, p.email])));
  assert.deepEqual(back.decisions.at(-1), extra);
});

test("a requirement keeps its words, criteria, status and confirmed version through rows and back", () => {
  const db = demoDb();
  const criteria = [{ id: "c1", text: "Card form", done: true }, { id: "c2", text: "Receipt email", done: false }];
  const extra = {
    id: "rq-x", productKey: "AP", code: "R9", title: "Pay by card", description: "Stripe **Checkout**", criteria,
    status: "draft" as const, priority: "must" as const, source: { kind: "email" as const, note: "Ali's email, 16 Oct" }, rev: 3, confirmed: { rev: 2, title: "Pay by card", description: "Stripe", criteria, by: "u-ayesha", at: "2026-10-20T09:00:00Z" },
    proposedBy: "u-client", droppedReason: "Later", createdAt: "2026-10-19T08:00:00Z", createdBy: "u-ayesha", updatedAt: "2026-10-21T10:30:00Z",
  };
  const withOne = { ...db, requirements: [...db.requirements, extra] };
  const back = fromRows(orgRow(withOne), withPositions(toRows(withOne)), new Map(db.people.map((p) => [p.id, p.email])));
  assert.deepEqual(back.requirements.at(-1), extra);
  assert.deepEqual(back.requirements[0], db.requirements[0]); // an old one (code and title only) stays just that
});

test("client people, their project roles, requests, every kind of chat line and the Client Space switch survive rows and back", () => {
  const db = demoDb();
  const client = { id: "c-ali", name: "Ali Raza", initials: "AR", color: "var(--color-berry)", email: "ali@2n5.example", company: "2N5 Global", active: true };
  const ask = { id: "ask-1", productKey: "AP", code: "Q1", title: "Staging database access", details: "Read-only is enough", kind: "access" as const, invite: "dev@acme.example",
    assigneeId: "c-ali", due: "2026-10-30", state: "answered" as const, createdBy: "u-ayesha", createdAt: "2026-10-20T09:00:00Z", answeredBy: "c-ali", answeredAt: "2026-10-21T10:00:00Z" };
  const at = "2026-10-21T10:00:00Z";
  const msgs = [
    { id: "m-1", productKey: "AP", subject: "ask:ask-1", authorId: "c-ali", at, body: "Sent the credentials by email." },
    { id: "m-2", productKey: "AP", subject: "ask:ask-1", authorId: "u-sara", at, body: "Check the VPN too", kind: "note" as const, data: { replyTo: "m-1" } },
    { id: "m-3", productKey: "AP", subject: "req:r-1", authorId: "u-ayesha", at, body: "", kind: "event" as const, event: "sent" as const, rev: 2 },
    { id: "m-4", productKey: "AP", subject: "chat:AP", authorId: "u-ayesha", at, body: "", kind: "update" as const,
      data: { update: { health: "good" as const, stage: "BUILD" as const, week: "Payments in testing", next: "Beta", needs: "" } } },
    { id: "m-5", productKey: "AP", subject: "chat:AP", authorId: "c-ali", at, body: "Our logo", kind: "file" as const, via: "whatsapp" as const,
      data: { file: { id: "file-1", name: "logo.svg", type: "image/svg+xml", size: 900 } } },
    { id: "m-6", productKey: "AP", subject: "chat:AP", authorId: "u-ayesha", at, body: "Typo", deletedAt: at, hiddenFor: ["c-ali"], starredBy: ["u-sara"] },
    { id: "m-7", productKey: "AP", subject: "chat:AP", authorId: "u-ayesha", at, body: "Read this first", pinnedAt: at, pinnedBy: "c-ali" },
  ];
  const chatReads = [{ personId: "c-ali", subject: "chat:AP", at }];
  const look = { clientPhases: { req: { to_confirm: { name: "Awaiting approval" } } }, requirementPriorities: [{ id: "critical", name: "Critical", color: "#d83a52" }] };
  const products = db.products.map((p) => (p.key === "AP" ? { ...p, clients: [{ personId: "c-ali", role: "sponsor" as const }], ...look } : p));
  const withClients = { ...db, org: { ...db.org, clientSpace: true }, clientPeople: [client], asks: [ask], clientMessages: msgs, chatReads, products };
  const emails = new Map([...db.people.map((p) => [p.id, p.email] as const), [client.id, client.email] as const]);
  const back = fromRows(orgRow(withClients), withPositions(toRows(withClients)), emails);
  assert.deepEqual(back.clientPeople, [client]);
  assert.equal(back.people.some((p) => p.id === "c-ali"), false); // never in the team
  assert.deepEqual(back.products.find((p) => p.key === "AP")?.clients, [{ personId: "c-ali", role: "sponsor" }]);
  assert.deepEqual(back.asks, [ask]);
  assert.deepEqual(back.clientMessages, msgs);
  assert.deepEqual(back.chatReads, chatReads);
  assert.equal(back.org.clientSpace, true);
  const ap = back.products.find((p) => p.key === "AP")!;
  assert.deepEqual([ap.clientPhases, ap.requirementPriorities], [look.clientPhases, look.requirementPriorities]); // the project's own look
  assert.equal(back.products.find((p) => p.key === "OF")!.clientPhases, undefined);
});

test("a project keeps its own priority names and colours through rows and back", () => {
  const db = demoDb();
  const priorities = { critical: { name: "Urgent", color: "#ff0055" }, low: { name: "Someday" } };
  const withOne = { ...db, products: db.products.map((p) => (p.key === "AP" ? { ...p, priorities } : p)) };
  const back = fromRows(orgRow(withOne), withPositions(toRows(withOne)), new Map(db.people.map((p) => [p.id, p.email])));
  assert.deepEqual(back.products.find((p) => p.key === "AP")!.priorities, priorities);
  assert.equal(back.products.find((p) => p.key !== "AP")!.priorities, undefined);
});

test("an urgent (@@) notification stays urgent through rows and back", () => {
  const db = demoDb();
  const n = { id: "n-urgent", personId: "u-sara", kind: "mention" as const, actorId: "u-tayyab", text: "mentioned you in AP-1 Login", target: "AP-1", at: "2026-10-19T10:00:00Z", read: false, urgent: true };
  const withOne = { ...db, notifications: [n, ...db.notifications] };
  const back = fromRows(orgRow(withOne), withPositions(toRows(withOne)), new Map(db.people.map((p) => [p.id, p.email])));
  assert.deepEqual(back.notifications.find((x) => x.id === "n-urgent"), n);
  assert.equal(back.notifications.find((x) => x.id !== "n-urgent")!.urgent, undefined);
});
