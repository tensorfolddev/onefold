import { test } from "node:test";
import assert from "node:assert/strict";
import { fixClock } from "./clock.ts";
import { SEED_TODAY } from "./seed.ts";
import { demoDb } from "../data/demo.ts";
import { clientText, clientViewFor } from "./clientView.ts";
import { answerAsk, completeAsk, confirmRequirement, postMessage, proposeRequirement, requestRequirementChanges, sendClientFile } from "./commands/clientActions.ts";
import {
  acceptProposal, addClientPerson, checkMayLinkClient, createAsk, postThreadMessage, postUpdate, remindClient, sendRequirementToClient,
  setAskState, setClientActive, setClientSettings, setProductClient,
} from "./commands/clients.ts";
import { addRequirement, archiveRequirements, unarchiveRequirements, updateRequirement } from "./commands/requirements.ts";
import { AccessError, ValidationError } from "./commands/shared.ts";
import { addComment, updateTicket } from "./commands/tickets.ts";
import { clientRoom, needsMe, teamRoom, whoseMove } from "./selectors/room.ts";
import { snapshotFor } from "./snapshot.ts";
import type { Db } from "../data/db.ts";

fixClock(`${SEED_TODAY}T10:00:00`);
const base = demoDb();
const who = (id: string) => base.people.find((p) => p.id === id)!;
const admin = who("u-tayyab"), lead = who("u-ayesha"), sara = who("u-sara");
const SECRET = "INTERNAL-ONLY-7f3a"; // anything with this in it must never reach a client

/** AP with Client Space on: Ali (sponsor), Hina (tester), a shared requirement, a draft, a request for each, secrets around. */
function world(): Db {
  let db = setClientSettings(base, admin, { clientSpace: true });
  db = addClientPerson(db, lead, { id: "c-ali", name: "Ali Raza", email: "ali@2n5.example", company: "2N5" }, "AP", "sponsor");
  db = addClientPerson(db, lead, { id: "c-hina", name: "Hina Khan", email: "hina@2n5.example", company: "2N5" }, "AP", "tester");
  db = addRequirement(db, lead, "AP", { title: "Pay by card", description: "Stripe" }, "rq-shared");
  db = sendRequirementToClient(db, lead, "rq-shared");
  db = addRequirement(db, lead, "AP", { title: `Draft ${SECRET}` }, "rq-draft");
  db = updateTicket(db, lead, "AP-12", { requirementId: "rq-shared" });
  const commented = addComment(db, lead, "AP-12", `Comment ${SECRET}`) as Db | { db: Db };
  db = "db" in commented && !("org" in commented) ? commented.db : (commented as Db);
  db = postThreadMessage(db, sara, "req:rq-shared", `Note ${SECRET}`, "note-1", { note: true }); // anyone on it writes notes
  db = createAsk(db, lead, "AP", { title: "Staging access", kind: "access", invite: "dev@acme.example", assigneeId: "c-ali" }, "ask-ali");
  db = createAsk(db, lead, "AP", { title: "Logo files", kind: "file", assigneeId: "c-hina" }, "ask-hina");
  return db;
}
const client = (db: Db, id: string) => db.clientPeople.find((c) => c.id === id)!;

test("a client sees their project's shared requirements, requests and chats — and nothing internal", () => {
  const db = world();
  const view = clientViewFor(db, "c-ali")!;
  const json = JSON.stringify(view);
  assert.ok(JSON.stringify(db).includes(SECRET)); // the secrets are there to leak…
  assert.equal(json.includes(SECRET), false); // …and don't: no draft, no comment, no internal note
  for (const p of db.people) assert.equal(json.includes(p.email), false); // no team emails
  assert.equal(json.includes("u-sara") || json.includes("AP-12") || /hours/i.test(json), false); // no note authors, tickets or hours
  const ap = view.projects[0];
  assert.deepEqual(ap.requirements.map((r) => [r.code, r.status]), [["R5", "to_confirm"]]);
  assert.deepEqual(ap.asks.map((a) => [a.code, a.id, a.invite ?? ""]).sort(), [["Q1", "ask-ali", "dev@acme.example"], ["Q2", "ask-hina", ""]]); // a sponsor sees every request
  assert.deepEqual(clientViewFor(db, "c-hina")!.projects[0].asks.map((a) => a.id), ["ask-hina"]); // a tester, only theirs
  assert.deepEqual(ap.messages.map((m) => [m.subject, m.event]), [["req:rq-shared", "sent"], ["ask:ask-ali", "asked"], ["ask:ask-hina", "asked"]]);
});

test("descriptions lose their links into the team's 1Fold — the words stay", () => {
  assert.equal(clientText("Ask [@Sara](mention:u-sara) — see [AP-12 Cart](ticket:AP-12), [Spec](doc:d1) and [shot.png](/api/files/f1). [Stripe](https://stripe.com)"),
    "Ask Sara — see AP-12 Cart, Spec and shot.png. [Stripe](https://stripe.com)");
});

test("no Client Space, an inactive client or someone off the project: no view", () => {
  const db = world();
  assert.equal(clientViewFor(setClientSettings(db, admin, { clientSpace: false }), "c-ali"), null);
  assert.deepEqual(clientViewFor(setProductClient(db, lead, "AP", "c-ali", null), "c-ali")!.projects, []);
  assert.equal(clientViewFor(db, "u-tayyab"), null); // a teammate isn't a client
});

test("while the team changes a confirmed requirement, the client still sees what they agreed to", () => {
  let db = confirmRequirement(world(), client(world(), "c-ali"), "rq-shared");
  db = updateRequirement(db, lead, "rq-shared", { title: `Pay by card ${SECRET}` });
  const r = clientViewFor(db, "c-ali")!.projects[0].requirements[0];
  assert.deepEqual([r.title, r.status, r.beingUpdated], ["Pay by card", "confirmed", true]);
  assert.equal(JSON.stringify(clientViewFor(db, "c-ali")).includes(SECRET), false);
});

test("a sponsor confirms or asks for changes; a tester can't; each leaves a line and tells the managers", () => {
  let db = world();
  const ali = client(db, "c-ali"), hina = client(db, "c-hina");
  assert.throws(() => confirmRequirement(db, hina, "rq-shared"), AccessError);
  assert.throws(() => confirmRequirement(db, ali, "rq-draft"), ValidationError); // never shared: not there for them
  const changed = requestRequirementChanges(db, ali, "rq-shared", "Also Apple Pay", "msg-1");
  assert.equal(changed.requirements.find((r) => r.id === "rq-shared")?.status, "changes_requested");
  assert.deepEqual(changed.clientMessages.slice(-2).map((m) => [m.kind, m.event ?? m.body]), [["event", "changes"], [undefined, "Also Apple Pay"]]);
  db = confirmRequirement(db, ali, "rq-shared");
  const r = db.requirements.find((x) => x.id === "rq-shared")!;
  assert.deepEqual([r.status, r.confirmed?.by], ["confirmed", "c-ali"]);
  assert.deepEqual([db.clientMessages.at(-1)?.event, db.clientMessages.at(-1)?.rev], ["confirmed", 1]);
  assert.ok(db.notifications.some((n) => n.kind === "client" && n.text.includes("confirmed R5") && n.target.endsWith("?t=req%3Arq-shared")));
});

test("clients answer requests (in words or with a file), suggest requirements and write in the chats they can see", () => {
  let db = world();
  const ali = client(db, "c-ali"), hina = client(db, "c-hina");
  db = answerAsk(db, ali, "ask-ali", "Invited you", "msg-2");
  assert.equal(db.asks.find((a) => a.id === "ask-ali")?.state, "answered");
  assert.throws(() => answerAsk(db, hina, "ask-ali", "Me too", "msg-3"), ValidationError); // not hers to see
  db = sendClientFile(db, hina, "ask:ask-hina", { id: "file-1", name: "logo.svg", type: "image/svg+xml", size: 900 });
  assert.equal(db.asks.find((a) => a.id === "ask-hina")?.state, "answered"); // the file answers it
  db = completeAsk(db, hina, "ask-hina");
  assert.equal(db.asks.find((a) => a.id === "ask-hina")?.state, "done");
  assert.throws(() => proposeRequirement(db, hina, "AP", { title: "Dark mode" }, "rq-p0"), AccessError);
  db = proposeRequirement(db, ali, "AP", { title: "Dark mode" }, "rq-p1");
  assert.equal(db.requirements.find((r) => r.id === "rq-p1")?.status, "proposed");
  db = acceptProposal(db, lead, "rq-p1");
  assert.deepEqual([db.requirements.find((r) => r.id === "rq-p1")?.status, db.clientMessages.at(-1)?.event], ["draft", "taken"]);
  db = postMessage(db, hina, "chat:AP", "Hello team", "msg-4");
  assert.throws(() => postMessage(db, ali, "req:rq-draft", "Hi", "msg-5"), ValidationError);
  assert.throws(() => postMessage(db, ali, "req:rq-shared", "Re", "msg-6", "note-1"), ValidationError); // can't quote a note they can't see
  db = postThreadMessage(db, lead, "chat:AP", "Hi Hina!", "msg-7", { replyTo: "msg-4" });
  assert.equal(db.clientMessages.at(-1)?.data?.replyTo, "msg-4");
  assert.equal(postThreadMessage(db, sara, "chat:AP", "Hey", "msg-8").clientMessages.at(-1)?.kind, undefined); // a developer on it talks to the client too
  assert.throws(() => postThreadMessage(db, who("u-faraz"), "chat:AP", "Hey", "msg-9"), AccessError); // not on the project: no
  assert.throws(() => addClientPerson(db, sara, { id: "c-x2", name: "X", email: "x2@2n5.example", company: "" }, "AP", "tester"), AccessError); // who the client's people are: managers
});

test("the team nudges, closes and updates: reminders only for what's waiting; requests are numbered", () => {
  let db = world();
  db = remindClient(db, lead, "req:rq-shared");
  assert.equal(db.clientMessages.at(-1)?.event, "reminded");
  assert.throws(() => remindClient(db, lead, "req:rq-draft"), /Nothing here is waiting/);
  db = setAskState(db, lead, "ask-ali", "done");
  assert.deepEqual([db.asks.find((a) => a.id === "ask-ali")?.state, db.clientMessages.at(-1)?.event], ["done", "done"]);
  db = postUpdate(db, lead, "AP", { week: "Payments in testing", next: "Beta on Nov 3" }, "upd-1");
  const u = db.clientMessages.at(-1)!;
  assert.deepEqual([u.subject, u.kind, u.data?.update?.week], ["chat:AP", "update", "Payments in testing"]);
  assert.equal(createAsk(db, lead, "AP", { title: "Third" }, "ask-3").asks.at(-1)?.code, "Q3");
});

test("whatever the team writes in a draft's chat stays a note — even after the draft is shared", () => {
  const typed = "TYPED-IN-DRAFT-41b"; // (the draft's title is shared once it's sent; this line must not be)
  let db = postThreadMessage(world(), lead, "req:rq-draft", typed, "msg-d1"); // not marked a note
  assert.equal(db.clientMessages.at(-1)?.kind, "note");
  db = addClientPerson(db, lead, { id: "c-x", name: "X", email: "x@2n5.example", company: "" }, "AP", "owner");
  db = sendRequirementToClient(db, lead, "rq-draft");
  assert.equal(JSON.stringify(clientViewFor(db, "c-ali")).includes(typed), false);
});

test("the room: both sides get the same chats — whose move it is, and what needs whom", () => {
  let db = world();
  const team = teamRoom(db, lead, "AP")!;
  assert.deepEqual(team.threads.map((t) => t.kind)[0], "chat");
  const shared = team.threads.find((t) => t.subject === "req:rq-shared")!;
  assert.deepEqual([shared.internal, team.threads.find((t) => t.subject === "req:rq-draft")!.internal], [false, true]);
  assert.equal(whoseMove(team, shared)?.side, "client"); // sent to confirm: Ali's move
  assert.equal(needsMe(team, shared), false);
  db = postMessage(db, client(db, "c-ali"), "req:rq-shared", "Does it take Amex?", "msg-9");
  const after = teamRoom(db, lead, "AP")!;
  assert.equal(whoseMove(after, after.threads.find((t) => t.subject === "req:rq-shared")!)?.side, "team"); // a question: ours
  const ali = clientRoom(clientViewFor(db, "c-ali")!, "AP")!;
  assert.equal(ali.threads.some((t) => t.subject === "req:rq-draft"), false);
  assert.equal(ali.threads.find((t) => t.subject === "req:rq-shared")!.messages.some((m) => m.kind === "note"), false);
  assert.equal(needsMe(ali, ali.threads.find((t) => t.subject === "req:rq-shared")!), true);
  const hina = clientRoom(clientViewFor(db, "c-hina")!, "AP")!;
  assert.equal(needsMe(hina, hina.threads.find((t) => t.subject === "req:rq-shared")!), false); // a tester doesn't confirm
});

test("a link signs in as the client everywhere: only an admin, or whoever manages all their projects, gets one", () => {
  const db = world();
  assert.throws(() => checkMayLinkClient(db, who("u-maryam"), "c-ali"), /a project you don't manage/);
  checkMayLinkClient(db, who("u-usman"), "c-ali");
  checkMayLinkClient(db, admin, "c-ali");
});

test("someone an admin switched off stays off: re-adding them to a project is an admin's call", () => {
  const off = setClientActive(world(), admin, "c-ali", false);
  const again = { id: "c-ali2", name: "Ali Raza", email: "ali@2n5.example", company: "2N5" };
  assert.throws(() => addClientPerson(off, lead, again, "AP", "sponsor"), /switched off/);
  assert.equal(addClientPerson(off, admin, again, "AP", "sponsor").clientPeople.find((c) => c.id === "c-ali")?.active, true);
});

test("the team's own data copy carries client people — their emails only for admins and managers", () => {
  const db = world();
  assert.equal(snapshotFor(db, admin).clientPeople.find((c) => c.id === "c-ali")?.email, "ali@2n5.example");
  assert.equal(snapshotFor(db, sara).clientPeople.find((c) => c.id === "c-ali")?.email, "");
  assert.equal(snapshotFor(db, sara).asks.length, 2); // on the project: they read the requests
});

test("every version sent to the client stays in its chat, as it read then — and what they asked to change", () => {
  let db = world();
  const ali = db.clientPeople.find((c) => c.id === "c-ali")!;
  db = requestRequirementChanges(db, ali, "rq-shared", "Add Apple Pay too", "m-change");
  db = updateRequirement(db, lead, "rq-shared", { title: "Pay by card or Apple Pay", description: "Like [AP-12](ticket:AP-12)" });
  db = sendRequirementToClient(db, lead, "rq-shared");
  type Line = { id: string; event?: string; rev?: number; data?: { sent?: { title: string; description: string } } };
  const sent = (lines: Line[]) => lines.filter((m) => m.event === "sent").map((m) => [m.rev, m.data?.sent?.title]);
  const team = teamRoom(db, lead, "AP")!.threads.find((t) => t.subject === "req:rq-shared")!;
  assert.deepEqual(sent(team.messages), [[1, "Pay by card"], [2, "Pay by card or Apple Pay"]]);
  const theirs = clientRoom(clientViewFor(db, "c-ali")!, "AP")!.threads.find((t) => t.subject === "req:rq-shared")!;
  assert.deepEqual(sent(theirs.messages), [[1, "Pay by card"], [2, "Pay by card or Apple Pay"]]);
  assert.ok(theirs.messages.some((m) => m.id === "m-change"));
  assert.equal((theirs.messages as Line[]).filter((m) => m.event === "sent").at(-1)!.data!.sent!.description, "Like AP-12"); // no ticket link for them
});

test("archived requirements: off the team's board and the client's, chat and all — back as they were", () => {
  let db = world();
  const ap = base.products.find((p) => p.key === "AP")!;
  const outsider = base.people.find((p) => p.panel === "developer" && !ap.memberIds.includes(p.id))!;
  assert.throws(() => archiveRequirements(db, outsider, ["rq-shared"]), AccessError);
  assert.throws(() => archiveRequirements(db, lead, ["rq-shared"]), AccessError); // its manager edits it — only an admin archives
  assert.throws(() => archiveRequirements(db, sara, ["rq-shared"]), AccessError);
  db = archiveRequirements(db, admin, ["rq-shared"]);
  assert.equal(db.requirements.find((r) => r.id === "rq-shared")!.archivedBy, admin.id);
  assert.ok(!teamRoom(db, lead, "AP")!.threads.some((t) => t.subject === "req:rq-shared"));
  const view = clientViewFor(db, "c-ali")!;
  assert.ok(!view.projects[0].requirements.some((r) => r.id === "rq-shared"));
  assert.ok(!view.projects[0].messages.some((m) => m.subject === "req:rq-shared"));
  assert.throws(() => confirmRequirement(db, db.clientPeople.find((c) => c.id === "c-ali")!, "rq-shared"), /isn't here/);
  assert.ok(snapshotFor(db, lead).requirements.some((r) => r.id === "rq-shared" && r.archivedAt)); // the team can still restore it
  assert.throws(() => unarchiveRequirements(db, lead, ["rq-shared"]), AccessError);
  db = unarchiveRequirements(db, admin, ["rq-shared"]);
  assert.equal(db.requirements.find((r) => r.id === "rq-shared")!.archivedAt, undefined);
  assert.ok(clientRoom(clientViewFor(db, "c-ali")!, "AP")!.threads.some((t) => t.subject === "req:rq-shared"));
});
