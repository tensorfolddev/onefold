import { test } from "node:test";
import assert from "node:assert/strict";
import { fixClock } from "./clock.ts";
import { SEED_TODAY } from "./seed.ts";
import { demoDb } from "../data/demo.ts";
import { clientViewFor } from "./clientView.ts";
import { deleteMessage, pinMessage, postMessage, readChat as clientReads, starMessage } from "./commands/clientActions.ts";
import {
  addClientPerson, createAsk, deleteChatMessage, pinChatMessage, postThreadMessage, readChat, setClientLook, setClientSettings, starChatMessage, weekDraft,
} from "./commands/clients.ts";
import { addRequirement, updateRequirement } from "./commands/requirements.ts";
import { AccessError, ValidationError } from "./commands/shared.ts";
import { clientRoom, seenByOtherSide, teamRoom } from "./selectors/room.ts";
import { priorityLook, reqPhase } from "./selectors/clientLook.ts";
import { snapshotFor } from "./snapshot.ts";
import type { Db } from "../data/db.ts";

fixClock(`${SEED_TODAY}T10:00:00`);
const base = demoDb();
const who = (id: string) => base.people.find((p) => p.id === id)!;
const admin = who("u-tayyab"), lead = who("u-ayesha"), sara = who("u-sara");

function world(): Db {
  let db = setClientSettings(base, admin, { clientSpace: true });
  db = addClientPerson(db, lead, { id: "c-ali", name: "Ali Raza", email: "ali@2n5.example", company: "2N5" }, "AP", "sponsor");
  db = postThreadMessage(db, lead, "chat:AP", "Hello Ali", "m-1");
  db = postThreadMessage(db, lead, "chat:AP", "Only for us", "m-note", { note: true });
  return postMessage(db, db.clientPeople.find((c) => c.id === "c-ali")!, "chat:AP", "Hi team", "m-2");
}
const ali = (db: Db) => db.clientPeople.find((c) => c.id === "c-ali")!;
const line = (db: Db, id: string) => db.clientMessages.find((m) => m.id === id)!;

test("deleting: for everyone only by who wrote it — the words go from every copy; for me, just from mine", () => {
  let db = world();
  assert.throws(() => deleteChatMessage(db, sara, "m-1", true), /Only whoever wrote it/);
  db = deleteChatMessage(db, lead, "m-1", true);
  assert.ok(line(db, "m-1").deletedAt);
  assert.equal(snapshotFor(db, sara).clientMessages.find((m) => m.id === "m-1")!.body, ""); // nobody's copy has the words
  assert.equal(clientViewFor(db, "c-ali")!.projects[0].messages.find((m) => m.id === "m-1")!.body, "");
  db = deleteMessage(db, ali(db), "m-2", false); // Ali: just for himself
  assert.equal(clientViewFor(db, "c-ali")!.projects[0].messages.some((m) => m.id === "m-2"), false);
  assert.equal(snapshotFor(db, lead).clientMessages.find((m) => m.id === "m-2")!.body, "Hi team"); // still there for the team
  assert.throws(() => deleteMessage(db, ali(db), "m-note", false), /isn't here/); // a note isn't theirs to reach
});

test("stars are each person's own; pins are everyone's, three at most", () => {
  let db = starChatMessage(world(), lead, "m-2", true);
  db = starMessage(db, ali(db), "m-2", true);
  assert.deepEqual(snapshotFor(db, lead).clientMessages.find((m) => m.id === "m-2")!.starredBy, ["u-ayesha"]); // never someone else's
  assert.equal(snapshotFor(db, sara).clientMessages.find((m) => m.id === "m-2")!.starredBy, undefined);
  assert.equal(clientViewFor(db, "c-ali")!.projects[0].messages.find((m) => m.id === "m-2")!.starred, true);
  for (let i = 3; i <= 6; i++) db = postThreadMessage(db, lead, "chat:AP", `Point ${i}`, `m-${i}`);
  for (const id of ["m-3", "m-4", "m-5"]) db = pinChatMessage(db, lead, id, true);
  db = pinMessage(db, ali(db), "m-6", true); // the client pins too — a fourth unpins the oldest
  assert.deepEqual(db.clientMessages.filter((m) => m.pinnedAt).map((m) => m.id).sort(), ["m-4", "m-5", "m-6"]);
});

test("reading moves forward only, and the other side's read turns a line's ticks blue", () => {
  let db = world();
  const at = line(db, "m-1").at;
  const before = teamRoom(db, lead, "AP")!;
  assert.equal(seenByOtherSide(before, "chat:AP", before.threads[0].messages[0]), false);
  db = clientReads(db, ali(db), "chat:AP", line(db, "m-2").at); // Ali read up to his own line
  const room = teamRoom(db, lead, "AP")!;
  assert.equal(seenByOtherSide(room, "chat:AP", room.threads[0].messages.find((m) => m.id === "m-1")!), true);
  db = readChat(db, lead, "chat:AP", at);
  db = readChat(db, lead, "chat:AP", "2000-01-01T00:00:00Z"); // never back
  assert.equal(db.chatReads.find((r) => r.personId === "u-ayesha")!.at, at);
  const theirs = clientRoom(clientViewFor(db, "c-ali")!, "AP")!;
  assert.equal(theirs.reads.some((r) => r.personId === "u-ayesha"), true); // the team's read: for Ali's ticks
  assert.throws(() => readChat(db, who("u-faraz"), "chat:AP", at), AccessError);
});

test("a project's own phases and priorities: both sides see them, other projects keep theirs; one still in use can't go", () => {
  let db = setClientLook(world(), lead, "AP", { // whoever shapes the project's board: its lead here
    phases: { req: { to_confirm: { name: "Awaiting approval", color: "#123456" } } },
    priorities: [{ id: "critical", name: "Critical", color: "#d83a52" }, { id: "must", name: "Must have", color: "#1f5fd1" }],
  });
  assert.throws(() => setClientLook(db, who("u-faraz"), "AP", { phases: null }), AccessError); // not on the project
  assert.deepEqual(reqPhase(clientViewFor(db, "c-ali")!.projects[0].look, "to_confirm", "client"), { label: "Awaiting approval", color: "#123456" });
  assert.equal(teamRoom(db, lead, "OF")!.look.priorities, undefined); // another project: still Must / Should / Nice
  db = addRequirement(db, lead, "AP", { title: "Refunds", priority: "critical" }, "rq-1");
  assert.equal(priorityLook(teamRoom(db, lead, "AP")!.look, "critical")!.short, "Critical");
  assert.throws(() => updateRequirement(db, lead, "rq-1", { priority: "nice" }), /Pick Critical, Must have/); // not theirs any more
  assert.throws(() => setClientLook(db, admin, "AP", { priorities: [{ id: "must", name: "Must have", color: "#1f5fd1" }] }), /R\d+ is still “Critical” — change it first/);
  assert.throws(() => setClientLook(db, admin, "AP", { phases: { ask: { open: { color: "red; background:url(x)" } } } }), ValidationError);
  db = setClientLook(updateRequirement(db, lead, "rq-1", { priority: "must" }), admin, "AP", { priorities: null, phases: null }); // back to the defaults
  const ap = db.products.find((p) => p.key === "AP")!;
  assert.equal(ap.requirementPriorities, undefined);
  assert.equal(ap.clientPhases, undefined);
});

test("a chat @mention tells the teammate (@@: urgently); @Team and @everyone reach only who's on the project", () => {
  const db = postThreadMessage(world(), lead, "chat:AP", "@@Sara Ahmed please check · @Faraz Qureshi too · @Frontend fyi", "m-9");
  const told = (d: Db, id: string) => d.notifications.filter((n) => n.personId === id && n.kind === "mention" && n.target.includes("?t="));
  assert.equal(told(db, "u-sara").length, 1); // once, though @Frontend names her too
  assert.equal(told(db, "u-sara")[0].urgent, true);
  assert.equal(told(db, "u-sara")[0].text, "mentioned you in the Acme Inc. chat");
  assert.equal(told(db, "u-faraz").length, 0); // not on Acme Portal
  assert.equal(told(db, "u-ayesha").length, 0); // never the author
  const fromAli = postMessage(db, ali(db), "chat:AP", "Thanks @Ayesha Malik", "m-10");
  assert.equal(told(fromAli, "u-ayesha")[0].actorId, "c-ali"); // the client's mention reaches the team too
  assert.equal(told(postThreadMessage(world(), lead, "chat:AP", "mail sara@ayesha.example", "m-11"), "u-sara").length, 0);
});

test("the weekly update drafts itself from the week: confirmed, finished, in progress, and what the client owes", () => {
  let db = createAsk(world(), lead, "AP", { kind: "file", title: "Your logo", due: "2026-10-30" }, "ask-1");
  db = addRequirement(db, lead, "AP", { title: "Refunds" }, "rq-1");
  db = { ...db, requirements: db.requirements.map((r) => (r.id === "rq-1" ? { ...r, confirmed: { by: "c-ali", at: `${SEED_TODAY}T09:00:00`, rev: 1, title: r.title, description: "", criteria: [] } } : r)) };
  const draft = weekDraft(db, "AP", `${SEED_TODAY}T10:00:00`);
  assert.match(draft.week, /^- Refunds — confirmed/);
  assert.equal(draft.needs, "- Your logo — by Oct 30");
  assert.ok(draft.next.split("\n").every((l) => l.startsWith("- "))); // the tickets being worked on, as a list
  assert.equal(weekDraft(db, "AP", "2030-01-01T00:00:00").week, ""); // nothing this week: nothing claimed
});
