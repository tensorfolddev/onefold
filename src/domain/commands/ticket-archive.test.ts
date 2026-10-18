// Archived tickets: admins and the product's managers archive and restore them (an epic with its tickets); an archived
// ticket is read-only and hidden from developers; only an admin deletes one for good, once archived, by typing it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fixClock } from "../clock.ts";
import { SEED_TODAY } from "../seed.ts";
import { demoDb } from "../../data/demo.ts";
import { snapshotFor } from "../snapshot.ts";
import { AccessError } from "./shared.ts";
import { setSection } from "./template.ts";
import { addComment, archiveTickets, deleteTickets, moveTicket, restoreTickets, updateTicket } from "./tickets.ts";

fixClock(`${SEED_TODAY}T10:00:00`);
const db0 = demoDb();
const who = (id: string) => db0.people.find((p) => p.id === id)!;
// Ayesha manages AP; Sara develops on it.
const admin = who("u-tayyab"), ayesha = who("u-ayesha"), sara = who("u-sara");
const t = (db: typeof db0, key: string) => db.tickets.find((x) => x.key === key);
const epicTickets = db0.tickets.filter((x) => x.epicKey === "AP-3").map((x) => x.key); // AP-3 is an epic

test("admins and the product's managers archive and restore tickets; developers can't", () => {
  const db = archiveTickets(db0, ayesha, ["AP-25"]);
  assert.equal(t(db, "AP-25")!.archivedBy, "u-ayesha");
  assert.equal(db.activity.at(-1)!.to, "Archived");
  assert.throws(() => archiveTickets(db0, sara, ["AP-25"]), AccessError);
  assert.throws(() => archiveTickets(db, admin, ["AP-25"]), /Already archived/);
  const back = restoreTickets(db, admin, ["AP-25"]);
  assert.deepEqual(t(back, "AP-25"), t(db0, "AP-25")); // exactly as it was
  assert.throws(() => restoreTickets(db, sara, ["AP-25"]), AccessError);
});

test("archiving an epic archives its tickets, and restoring it brings them all back", () => {
  const db = archiveTickets(db0, admin, ["AP-3"]);
  for (const key of ["AP-3", ...epicTickets]) assert.ok(t(db, key)!.archivedAt, key);
  const back = restoreTickets(db, admin, ["AP-3"]);
  for (const key of ["AP-3", ...epicTickets]) assert.equal(t(back, key)!.archivedAt, undefined, key);
});

test("an archived ticket is read-only — and a developer doesn't even see it", () => {
  const db = archiveTickets(db0, admin, ["AP-12"]);
  const restoreFirst = /AP-12 is archived — restore it first/;
  assert.throws(() => updateTicket(db, admin, "AP-12", { title: "x" }), restoreFirst);
  assert.throws(() => moveTicket(db, ayesha, "AP-12", "ap-review"), restoreFirst);
  assert.throws(() => addComment(db, admin, "AP-12", "hi"), restoreFirst);
  assert.throws(() => setSection(db, admin, "AP-12", "goal", "x"), restoreFirst);
  assert.throws(() => updateTicket(db, sara, "AP-12", { title: "x" }), /Ticket AP-12 not found/);

  assert.equal(t(snapshotFor(db, sara), "AP-12"), undefined);
  assert.ok(!snapshotFor(db, sara).comments.some((c) => c.ticketKey === "AP-12"));
  assert.ok(t(snapshotFor(db, ayesha), "AP-12")?.archivedAt); // managers find it in Settings → Archived
});

test("nobody deletes a live ticket; only an admin deletes an archived one for good, by typing it", () => {
  assert.throws(() => deleteTickets(db0, sara, ["AP-12"], "Delete AP-12"), AccessError); // developers no longer delete
  assert.throws(() => deleteTickets(db0, admin, ["AP-12"], "Delete AP-12"), /Archive AP-12 before deleting it/);
  const db = archiveTickets(db0, admin, ["AP-12", "AP-13"]);
  assert.throws(() => deleteTickets(db, ayesha, ["AP-12"], "Delete AP-12"), AccessError); // nor managers
  assert.throws(() => deleteTickets(db, admin, ["AP-12"], "delete it"), /Type "Delete AP-12"/);
  const gone = deleteTickets(db, admin, ["AP-12", "AP-13"], " Delete 2 tickets ");
  assert.equal(t(gone, "AP-12"), undefined);
  assert.equal(t(gone, "AP-13"), undefined);
  assert.equal(gone.tickets.length, db0.tickets.length - 2);
});
