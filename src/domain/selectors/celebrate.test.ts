// What deserves a celebration after a change: tickets that just reached Done, and epics whose every ticket is now
// finished. Only the moment it happens — never again for something already done.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fixClock } from "../clock.ts";
import { SEED_TODAY } from "../seed.ts";
import { demoDb } from "../../data/demo.ts";
import { moveTicket, updateTicket } from "../commands/tickets.ts";
import { cheer, finished } from "./celebrate.ts";

fixClock(`${SEED_TODAY}T10:00:00`);
const db0 = demoDb();
const admin = db0.people.find((p) => p.id === "u-tayyab")!;
const DONE = "ap-shipped", WONT_DO = "ap-wontdo", DEV = "ap-dev";
// Epic AP-3's tickets: AP-14 and AP-15 are done; the rest are open.
const OPEN_IN_EPIC = ["AP-12", "AP-13", "AP-20", "AP-21", "AP-22", "AP-33"];
const moveAll = (db: typeof db0, keys: string[], to: string) => keys.reduce((d, k) => moveTicket(d, admin, k, to), db);

test("a ticket that just reached Done is celebrated — once, not when it was already done or leaves Done", () => {
  const done = moveTicket(db0, admin, "AP-12", DONE);
  assert.deepEqual(finished(db0, done).tickets.map((t) => t.key), ["AP-12"]);
  assert.deepEqual(finished(db0, done).epics, []); // its epic still has open tickets
  assert.deepEqual(finished(done, done).tickets, []);
  assert.deepEqual(finished(done, moveTicket(done, admin, "AP-12", DEV)).tickets, []); // reopened: nothing to cheer
  assert.deepEqual(finished(db0, updateTicket(db0, admin, "AP-12", { title: "Renamed" })).tickets, []);
});

test("an epic is celebrated when its last open ticket finishes — cancelled ones don't hold it back", () => {
  const almost = moveAll(db0, OPEN_IN_EPIC.slice(0, -1), DONE);
  const last = OPEN_IN_EPIC.at(-1)!;
  const complete = moveTicket(almost, admin, last, DONE);
  assert.deepEqual(finished(almost, complete).epics.map((e) => [e.epic.key, e.count]), [["AP-3", 8]]);
  assert.deepEqual(finished(complete, complete).epics, []);

  // Won't do on the last one finishes the epic too, as long as something in it was done.
  assert.deepEqual(finished(almost, moveTicket(almost, admin, last, WONT_DO)).epics.map((e) => e.epic.key), ["AP-3"]);
  assert.deepEqual(finished(almost, moveTicket(almost, admin, last, WONT_DO)).tickets, []);
});

test("the cheer: one ticket, several, or a whole epic", () => {
  const one = moveTicket(db0, admin, "AP-12", DONE);
  assert.match(cheer(finished(db0, one))!.message, /^🎉 AP-12 is done/);
  assert.equal(cheer(finished(db0, one))!.big, false);
  const two = moveAll(db0, ["AP-12", "AP-13"], DONE);
  assert.match(cheer(finished(db0, two))!.message, /^🎉 2 tickets done/);
  const almost = moveAll(db0, OPEN_IN_EPIC.slice(0, -1), DONE);
  const epic = cheer(finished(almost, moveTicket(almost, admin, OPEN_IN_EPIC.at(-1)!, DONE)))!;
  assert.equal(epic.big, true);
  assert.match(epic.message, /^🏆 Epic complete: .+ — all 8 tickets finished/);
  assert.equal(cheer(finished(db0, db0)), null);
});
