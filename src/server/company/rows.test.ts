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
