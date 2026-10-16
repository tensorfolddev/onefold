// A held-up ticket: one still waiting on an unfinished dependency, or sitting in a stuck list (e.g. Blocked).
// The board shows these straining (src/styles/tickets.css .is-held).
import { test } from "node:test";
import assert from "node:assert/strict";
import { fixClock } from "../clock.ts";
import { SEED_TODAY } from "../seed.ts";
import { demoDb } from "../../data/demo.ts";
import { addDependency } from "../commands/template.ts";
import { moveTicket } from "../commands/tickets.ts";
import { heldUp, openBlockers } from "./blocked.ts";

fixClock(`${SEED_TODAY}T10:00:00`);
const db0 = demoDb();
const admin = db0.people.find((p) => p.id === "u-tayyab")!;
const t = (db: typeof db0, key: string) => db.tickets.find((x) => x.key === key)!;
const free = db0.tickets.find((x) => x.productKey === "AP" && x.type !== "epic" && !x.dependsOn?.length && x.statusId === "ap-dev")!.key;

test("waiting on an unfinished ticket holds it up; once that's done, it's free", () => {
  const db = addDependency(db0, admin, free, "AP-22"); // AP-22 is still to do
  assert.deepEqual(openBlockers(db, t(db, free)).map((x) => x.key), ["AP-22"]);
  assert.equal(heldUp(db, t(db, free)), true);
  const unblocked = moveTicket(db, admin, "AP-22", "ap-shipped");
  assert.deepEqual(openBlockers(unblocked, t(unblocked, free)), []);
  assert.equal(heldUp(unblocked, t(unblocked, free)), false);
  assert.equal(heldUp(db, t(moveTicket(db, admin, free, "ap-wontdo"), free)), false); // finished itself: nothing to strain about
});

test("waiting on an epic holds it up until every ticket in the epic is finished", () => {
  const db = addDependency(db0, admin, free, "AP-3");
  assert.deepEqual(openBlockers(db, t(db, free)).map((x) => x.key), ["AP-3"]);
});

test("a ticket in a stuck list (Blocked) is held up even with no dependencies", () => {
  assert.equal(db0.statusesByProduct.AP.find((s) => s.id === "ap-blocked")!.tone, "stuck");
  assert.equal(heldUp(db0, t(db0, free)), false);
  const stuck = moveTicket(db0, admin, free, "ap-blocked");
  assert.equal(heldUp(stuck, t(stuck, free)), true);
  assert.deepEqual(openBlockers(stuck, t(stuck, free)), []);
});
