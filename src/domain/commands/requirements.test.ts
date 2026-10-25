import { test } from "node:test";
import assert from "node:assert/strict";
import { fixClock } from "../clock.ts";
import { SEED_TODAY } from "../seed.ts";
import { demoDb } from "../../data/demo.ts";
import { AccessError, ValidationError } from "./shared.ts";
import {
  addRequirement, deleteRequirement, dropRequirement, markRequirementConfirmed, restoreRequirement, updateRequirement,
} from "./requirements.ts";
import { archiveTickets, updateTicket } from "./tickets.ts";
import { nextRequirementCode, requirementProgress, statusOfRequirement } from "../selectors/requirements.ts";
import type { Db } from "../../data/db.ts";

fixClock(`${SEED_TODAY}T10:00:00`);
const db0 = demoDb();
const who = (id: string) => db0.people.find((p) => p.id === id)!;
const admin = who("u-tayyab"), lead = who("u-ayesha"), sara = who("u-sara");
const req = (db: Db, id: string) => db.requirements.find((r) => r.id === id)!;
const line = (id: string, text: string) => ({ id, text, done: false });

test("a requirement gets the project's next code, its fields trimmed, and starts as a draft", () => {
  assert.equal(nextRequirementCode(db0, "AP"), "R5");
  const db = addRequirement(db0, lead, "AP", { title: "  Users can pay by card ", description: " Stripe ", criteria: [line("c1", "Card form")] }, "rq-1");
  const r = req(db, "rq-1");
  assert.deepEqual([r.code, r.title, r.description, r.criteria?.length], ["R5", "Users can pay by card", "Stripe", 1]);
  assert.equal(statusOfRequirement(r), "draft");
  assert.equal(r.rev, 1);
  assert.equal(r.createdBy, "u-ayesha");
  assert.equal(nextRequirementCode(db, "AP"), "R6");
  assert.equal(nextRequirementCode(db, "OR"), "R1"); // a project with none yet
});

test("adding refuses an empty title, a taken id, and anyone who doesn't manage the project", () => {
  assert.throws(() => addRequirement(db0, lead, "AP", { title: "   " }, "rq-2"), ValidationError);
  assert.throws(() => addRequirement(db0, lead, "AP", { title: "Again" }, "AP-R1"), ValidationError);
  assert.throws(() => addRequirement(db0, sara, "AP", { title: "Mine" }, "rq-3"), AccessError); // a developer reads, doesn't write
  assert.doesNotThrow(() => addRequirement(db0, admin, "AP", { title: "Admin's" }, "rq-4"));
});

test("editing bumps the revision only when the words change", () => {
  let db = addRequirement(db0, lead, "AP", { title: "Export" }, "rq-5");
  db = updateRequirement(db, lead, "rq-5", { title: "Export" });
  assert.equal(req(db, "rq-5").rev, 1);
  db = updateRequirement(db, lead, "rq-5", { title: "Export to CSV", criteria: [line("c1", "Has headers")] });
  assert.equal(req(db, "rq-5").rev, 2);
  assert.throws(() => updateRequirement(db, lead, "rq-5", { title: "" }), ValidationError);
  assert.throws(() => updateRequirement(db, sara, "rq-5", { title: "Hm" }), AccessError);
});

test("marking confirmed keeps the version as it read; changing it afterwards keeps that version and makes it a draft", () => {
  let db = addRequirement(db0, lead, "AP", { title: "Reports", description: "Monthly", criteria: [line("c1", "PDF")] }, "rq-6");
  db = markRequirementConfirmed(db, lead, "rq-6");
  let r = req(db, "rq-6");
  assert.equal(statusOfRequirement(r), "confirmed");
  assert.deepEqual(r.confirmed, { rev: 1, title: "Reports", description: "Monthly", criteria: [line("c1", "PDF")], by: "u-ayesha", at: r.confirmed!.at });
  db = updateRequirement(db, lead, "rq-6", { description: "Monthly and weekly" });
  r = req(db, "rq-6");
  assert.equal(statusOfRequirement(r), "draft");
  assert.equal(r.confirmed?.description, "Monthly"); // what the client agreed to is still there
  assert.equal(r.rev, 2);
});

test("ticking an acceptance criterion as met is saved, but isn't a change to what was confirmed", () => {
  let db = markRequirementConfirmed(addRequirement(db0, lead, "AP", { title: "Search", criteria: [line("c1", "By name")] }, "rq-9"), lead, "rq-9");
  db = updateRequirement(db, lead, "rq-9", { criteria: [{ id: "c1", text: "By name", done: true }] });
  const r = req(db, "rq-9");
  assert.equal(r.criteria?.[0].done, true);
  assert.deepEqual([statusOfRequirement(r), r.rev], ["confirmed", 1]);
});

test("a requirement has a priority and a source (where it came from); both can be changed or cleared", () => {
  let db = addRequirement(db0, lead, "AP", { title: "Refunds", priority: "must", source: { kind: "email", note: " Ali's email, 16 Oct " } }, "rq-10");
  let r = req(db, "rq-10");
  assert.deepEqual([r.priority, r.source], ["must", { kind: "email", note: "Ali's email, 16 Oct" }]);
  db = markRequirementConfirmed(db, lead, "rq-10");
  db = updateRequirement(db, lead, "rq-10", { priority: "nice", source: { kind: "call" } });
  r = req(db, "rq-10");
  assert.deepEqual([r.priority, r.source, statusOfRequirement(r)], ["nice", { kind: "call" }, "confirmed"]); // not a change to its words
  db = updateRequirement(db, lead, "rq-10", { priority: null, source: null });
  r = req(db, "rq-10");
  assert.deepEqual([r.priority, r.source], [undefined, undefined]);
  assert.throws(() => updateRequirement(db, lead, "rq-10", { priority: "urgent" as never }), ValidationError);
  assert.throws(() => updateRequirement(db, lead, "rq-10", { source: { kind: "fax" as never } }), ValidationError);
});

test("dropping needs a reason; restoring goes back to confirmed only if nothing changed since", () => {
  let db = markRequirementConfirmed(addRequirement(db0, lead, "AP", { title: "Dark mode" }, "rq-7"), lead, "rq-7");
  assert.throws(() => dropRequirement(db, lead, "rq-7", "  "), ValidationError);
  db = dropRequirement(db, lead, "rq-7", "Client moved it to next year");
  assert.equal(statusOfRequirement(req(db, "rq-7")), "dropped");
  assert.equal(req(db, "rq-7").droppedReason, "Client moved it to next year");
  db = restoreRequirement(db, lead, "rq-7");
  assert.equal(statusOfRequirement(req(db, "rq-7")), "confirmed");
  assert.equal(req(db, "rq-7").droppedReason, undefined);

  let db2 = updateRequirement(db, lead, "rq-7", { title: "Dark mode everywhere" });
  db2 = restoreRequirement(dropRequirement(db2, lead, "rq-7", "Later"), lead, "rq-7");
  assert.equal(statusOfRequirement(req(db2, "rq-7")), "draft");
});

test("only a never-confirmed requirement with no tickets can be deleted", () => {
  const db = addRequirement(db0, lead, "AP", { title: "Typo" }, "rq-8");
  assert.equal(deleteRequirement(db, lead, "rq-8").requirements.some((r) => r.id === "rq-8"), false);
  assert.throws(() => deleteRequirement(markRequirementConfirmed(db, lead, "rq-8"), lead, "rq-8"), ValidationError);
  assert.throws(() => deleteRequirement(db0, admin, "AP-R1"), ValidationError); // tickets link to it
  const linked = updateTicket(db, lead, "AP-26", { requirementId: "rq-8" });
  assert.throws(() => deleteRequirement(linked, lead, "rq-8"), ValidationError);
});

test("progress counts the linked tasks and bugs — not epics, not cancelled or archived ones — and their hours", () => {
  // AP-R1: the epic AP-3, plus AP-12 (in dev, 6h), AP-13 (review, 8h), AP-14 and AP-15 (shipped, 5h + 3h)
  const p = requirementProgress(db0, req(db0, "AP-R1"));
  assert.deepEqual([p.done, p.doing, p.total, p.hoursDone, p.hoursTotal], [2, 2, 4, 8, 22]); // AP-12 in dev, AP-13 in review
  assert.equal(p.linked.some((t) => t.type === "epic"), false);
  const archived = archiveTickets(db0, admin, ["AP-12"]);
  assert.deepEqual([requirementProgress(archived, req(archived, "AP-R1")).total], [3]);
});
