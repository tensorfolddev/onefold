import { test } from "node:test";
import assert from "node:assert/strict";
import { demoDb } from "../data/demo.ts";
import * as T from "./templates.ts";

const db = demoDb();
const ctx: T.ExportContext = {
  tickets: db.tickets,
  statusName: (id) => Object.values(db.statusesByProduct).flat().find((s) => s.id === id)?.name ?? "",
  isDone: (t) => Object.values(db.statusesByProduct).flat().find((s) => s.id === t.statusId)?.category === "done",
  personName: (id) => db.people.find((p) => p.id === id)?.name,
};

test("every template has unique snake_case ids, and its first section is the required summary text", () => {
  for (const [type, defs] of Object.entries(T.TEMPLATES)) {
    assert.equal(new Set(defs.map((d) => d.id)).size, defs.length, type);
    for (const d of defs) assert.match(d.id, /^[a-z]+(_[a-z]+)*$/, `${type}.${d.id}`);
    assert.deepEqual([defs[0].kind, defs[0].required], ["text", true], type);
  }
});

test("export: JSON and Markdown carry every section with a linkable ref", () => {
  const t = db.tickets.find((x) => x.key === "AP-12")!;
  const j = T.ticketToJson(t, ctx);
  assert.equal(j.template, "task@1");
  assert.deepEqual(j.sections.map((s) => s.id), T.TEMPLATES.task.map((d) => d.id));
  assert.equal(j.sections.find((s) => s.id === "acceptance_criteria")!.ref, "AP-12#acceptance_criteria");
  const md = T.ticketToMarkdown(t, ctx);
  assert.match(md, /^# AP-12 · Login page/);
  assert.match(md, /## Acceptance criteria \{#acceptance_criteria\}\n\n- \[[ x]\] /);
  assert.match(md, /## Dependencies \{#dependencies\}\n\n- \[[ x]\] AP-13 — Auth API/);
  assert.match(md, /epic: AP-3/);
});

test("completeness counts filled sections and lists missing required ones", () => {
  const blank = { ...db.tickets.find((x) => x.key === "AP-26")!, sections: {} };
  const c = T.completeness(blank, db.tickets);
  assert.deepEqual(c.missing.map((d) => d.id), ["goal", "acceptance_criteria"]);
  const epic = T.completeness(db.tickets.find((x) => x.key === "AP-3")!, db.tickets);
  assert.ok(epic.filled >= 4 && epic.missing.length === 0);
});
