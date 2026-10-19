// Project settings: a list's colour comes from the shared palette; priorities can be renamed and recoloured per project.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fixClock } from "../clock.ts";
import { SEED_TODAY } from "../seed.ts";
import { demoDb } from "../../data/demo.ts";
import { AccessError } from "./shared.ts";
import { addStatus, updateStatus } from "./lists.ts";
import { setPriority } from "./products.ts";

fixClock(`${SEED_TODAY}T10:00:00`);
const db0 = demoDb();
const admin = db0.people.find((p) => p.id === "u-tayyab")!;
const sara = db0.people.find((p) => p.id === "u-sara")!; // a developer on AP, not on NV

test("a list takes any colour of the palette — the new ones too — and nothing else", () => {
  const db = addStatus(db0, admin, "AP", { name: "On hold", tone: "pink" });
  const held = db.statusesByProduct.AP.at(-1)!;
  assert.equal(held.tone, "pink");
  assert.equal(updateStatus(db, admin, "AP", held.id, { tone: "teal" }).statusesByProduct.AP.at(-1)!.tone, "teal");
  assert.throws(() => updateStatus(db, admin, "AP", held.id, { tone: "rainbow" as never }), /colour/);
  assert.throws(() => addStatus(db0, admin, "AP", { name: "X", tone: "rainbow" as never }), /colour/);
});

test("priorities: rename and recolour each level for a project; back to the default; checked", () => {
  let db = setPriority(db0, admin, "AP", "critical", { name: " Urgent ", color: "#FF0055" });
  assert.deepEqual(db.products.find((p) => p.key === "AP")!.priorities, { critical: { name: "Urgent", color: "#ff0055" } });
  db = setPriority(db, admin, "AP", "low", { name: "Someday" });
  assert.deepEqual(db.products.find((p) => p.key === "AP")!.priorities?.low, { name: "Someday" });
  assert.throws(() => setPriority(db, admin, "AP", "high", { name: "urgent" }), /already/); // names stay distinct
  assert.throws(() => setPriority(db, admin, "AP", "high", { color: "red" }), /colour/);
  assert.throws(() => setPriority(db, admin, "AP", "nope" as never, { name: "x" }), /priority/);
  assert.equal(setPriority(db, sara, "AP", "high", { name: "Hot" }).products.find((p) => p.key === "AP")!.priorities?.high?.name, "Hot"); // whoever shapes the board
  assert.throws(() => setPriority(db, sara, "NV", "high", { name: "Hot" }), AccessError); // …of their own projects only
  db = setPriority(db, admin, "AP", "critical", null);
  assert.deepEqual(db.products.find((p) => p.key === "AP")!.priorities, { low: { name: "Someday" } });
});

test("a new list is named by the caller, so the browser and the server agree on its id", () => {
  const db = addStatus(db0, admin, "AP", { name: "Staging" }, "ap-qa000001");
  assert.equal(db.statusesByProduct.AP.at(-1)!.id, "ap-qa000001");
  assert.throws(() => addStatus(db, admin, "AP", { name: "Staging 2" }, "ap-qa000001"), /already/);
  assert.throws(() => addStatus(db, admin, "AP", { name: "Staging 3" }, "x/../y"), /Invalid/);
});
