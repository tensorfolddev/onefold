// Notifications: an @mention in a ticket update reaches the people it names (if they can see the ticket — never you);
// @@ marks it urgent; being assigned work tells you; read stays read.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fixClock } from "../clock.ts";
import { SEED_TODAY } from "../seed.ts";
import { demoDb } from "../../data/demo.ts";
import { markNotificationsRead } from "./notify.ts";
import { addComment, updateTicket } from "./tickets.ts";

fixClock(`${SEED_TODAY}T10:00:00`);
const db0 = demoDb();
const who = (id: string) => db0.people.find((p) => p.id === id)!;
const admin = who("u-tayyab"), sara = who("u-sara"), lead = who("u-ayesha"), faraz = who("u-faraz"); // faraz can't see AP
const ticket = db0.tickets.find((t) => t.productKey === "AP" && t.type !== "epic" && !t.archivedAt && !t.assigneeIds?.includes("u-sara"))!;
const fresh = (db: typeof db0) => db.notifications.filter((n) => !db0.notifications.some((o) => o.id === n.id));

test("an update's @mentions tell the people named — @@ is urgent; never you; only people who can see the ticket", () => {
  const db = addComment(db0, lead, ticket.key, `Hey @${sara.name}, see this. @@${admin.name} please decide today. cc @${faraz.name} @${lead.name}`);
  const told = fresh(db);
  assert.deepEqual(told.map((n) => [n.personId, n.kind, !!n.urgent, n.target]).sort(), [
    [admin.id, "mention", true, ticket.key], [sara.id, "mention", false, ticket.key],
  ].sort());
  assert.match(told[0].text, new RegExp(`mentioned you in ${ticket.key}`));
  assert.equal(fresh(addComment(db0, lead, ticket.key, `@${sara.name.split(" ")[0]}x is not a name`)).length, 0); // whole names only
});

test("being put on a ticket tells you (not when you put yourself on it, nor again for the same people)", () => {
  const db = updateTicket(db0, lead, ticket.key, { assigneeIds: [sara.id, lead.id] });
  assert.deepEqual(fresh(db).map((n) => [n.personId, n.kind, n.target]), [[sara.id, "assigned", ticket.key]]);
  const again = updateTicket(db, lead, ticket.key, { assigneeIds: [sara.id, lead.id] });
  assert.equal(fresh(again).length, 1);
});

test("read stays read: one notice, or all of yours — never someone else's", () => {
  const db = updateTicket(addComment(db0, lead, ticket.key, `@${sara.name} @${admin.name}`), lead, ticket.key, { assigneeIds: [sara.id] });
  const saras = fresh(db).filter((n) => n.personId === sara.id);
  const one = markNotificationsRead(db, sara, [saras[0].id]);
  assert.deepEqual(fresh(one).filter((n) => n.personId === sara.id).map((n) => n.read), [true, false]);
  const all = markNotificationsRead(db, sara, "all");
  assert.ok(all.notifications.filter((n) => n.personId === sara.id).every((n) => n.read));
  assert.ok(fresh(all).filter((n) => n.personId === admin.id).every((n) => !n.read)); // not hers to mark
});
