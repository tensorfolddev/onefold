// Client Space on a real Postgres: a client is invited, signs in with a link (no password), sees only their view,
// acts in it — and their session opens nothing of the team's.
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { AccessError } from "../domain/commands/index.ts";
import { readSession, signIn, signUpCompany, type SessionRow } from "./accounts.ts";
import { applySteps, viewFor } from "./changes.ts";
import { clientLinkCheck, clientNudges, clientView, inviteClient, newClientLink, readClientFile, runClientAction, signInWithClientLink, uploadClientFile, uploadThreadFile } from "./clientSpace.ts";
import { freshDatabase } from "./testing/db.ts";

let pg: Awaited<ReturnType<typeof freshDatabase>>;
before(async () => {
  process.env.FILES_DIR = await mkdtemp(join(tmpdir(), "onefold-client-files-"));
  process.env.SESSION_SECRET ??= "a-test-session-secret-of-32-chars-or-more"; // seals a client's own link
  pg = await freshDatabase();
});
after(async () => { await pg.drop(); });

const PASSWORD = "Correct-Horse-42";
const APP = "https://1fold.test";
let admin: SessionRow;
let founderId = "";
let link = "";
let client: SessionRow;

test("the team invites a client to a project: a link to share, and no password anywhere", async () => {
  const founder = await signUpCompany({ name: "Ayla Khan", email: "ayla@acme.example", password: PASSWORD, company: "Acme Labs", slug: "acme-labs" });
  founderId = founder.personId;
  admin = (await readSession(founder.token))!;
  await applySteps(admin, [
    { name: "createProduct", args: [{ key: "CH", name: "Checkout", type: "client", client: "2N5", pmId: founderId, projectManagerId: founderId }] },
  ]);
  await assert.rejects(inviteClient(admin, "CH", { name: "Ali Raza", email: "ali@2n5.example", company: "2N5", role: "sponsor" }, APP), /Client Space on first/);
  await applySteps(admin, [{ name: "setClientSettings", args: [{ clientSpace: true }] }]);
  await assert.rejects(inviteClient(admin, "CH", { name: "Me", email: "ayla@acme.example", company: "", role: "owner" }, APP), /teammate's email/);
  const made = await inviteClient(admin, "CH", { name: "Ali Raza", email: "Ali@2n5.example", company: "2N5", role: "sponsor" }, APP);
  assert.equal(made.emailed, false); // no email set up here: the team copies the link
  assert.match(made.link, /^https:\/\/1fold\.test\/c\/l\/[A-Za-z2-9]{12}$/); // short: theirs to keep
  link = made.link.split("/c/l/")[1];
  const team = await viewFor(admin);
  assert.deepEqual(team.db.clientPeople.map((c) => [c.name, c.email]), [["Ali Raza", "ali@2n5.example"]]);
  assert.deepEqual(team.db.products[0].clients, [{ personId: made.personId, role: "sponsor" }]);
  await assert.rejects(signIn("ali@2n5.example", PASSWORD), /Wrong email or password/); // a client has no password
});

test("their own link: it signs them in every time, the same link — until an admin makes a new one", async () => {
  assert.deepEqual(await clientLinkCheck(link), { problem: null, company: "Acme Labs" });
  const signedIn = await signInWithClientLink(link);
  assert.equal(signedIn.panel, "client");
  client = (await readSession(signedIn.token))!;
  assert.equal(client.kind, "client");
  assert.equal((await signInWithClientLink(link)).panel, "client"); // nothing used up
  const person = (await viewFor(admin)).db.clientPeople[0].id;
  assert.equal((await newClientLink(admin, person, APP)).link, `${APP}/c/l/${link}`); // asking again: the same link
  const fresh = (await newClientLink(admin, person, APP, true)).link.split("/c/l/")[1];
  assert.notEqual(fresh, link);
  await assert.rejects(signInWithClientLink(link), /doesn't open anything any more/); // the old one stopped working
  assert.match((await clientLinkCheck(link)).problem!, /new one/);
  link = fresh;
  assert.deepEqual(await clientLinkCheck("Zzzzzzzzzzzz"), { problem: "This link doesn't open anything any more — ask the team for your new one." });
});

test("a client session sees its own view and acts in it — and none of the team's data", async () => {
  await applySteps(admin, [
    { name: "addRequirement", args: ["CH", { title: "Pay by card" }, "rq-1"] },
    { name: "sendRequirementToClient", args: ["rq-1"] },
    { name: "addRequirement", args: ["CH", { title: "Internal draft" }, "rq-2"] },
  ]);
  const view = await clientView(client);
  assert.deepEqual(view.projects.map((p) => [p.key, p.requirements.map((r) => r.title)]), [["CH", ["Pay by card"]]]);
  assert.ok(!JSON.stringify(view).includes("ayla@acme.example"));
  await assert.rejects(viewFor(client), AccessError); // not a teammate: the team's view is refused
  await runClientAction(client, "confirmRequirement", ["rq-1"]);
  const team = await viewFor(admin);
  assert.equal(team.db.requirements.find((r) => r.id === "rq-1")?.status, "confirmed");
  assert.ok(team.db.notifications.some((n) => n.kind === "client" && n.text.includes("confirmed R1")));
  await assert.rejects(runClientAction(client, "createTicket", ["CH", "Sneaky"]), /isn't something you can do/);
  const [row] = await pg.asOwner<{ source: string }>("select source from audit_log where command = 'confirmRequirement'");
  assert.equal(row.source, "client");
});

test("Client Space off: the client is shut out at once", async () => {
  await applySteps(admin, [{ name: "setClientSettings", args: [{ clientSpace: false }] }]);
  await assert.rejects(clientView(client), AccessError);
  await applySteps(admin, [{ name: "setClientSettings", args: [{ clientSpace: true }] }]);
  assert.equal((await clientView(client)).projects.length, 1);
});

test("what needs a client gets them an email: a request, a requirement to confirm, a reminder, a reply — never a note", async () => {
  const before = (await viewFor(admin)).db;
  await applySteps(admin, [{ name: "createAsk", args: ["CH", { title: "Staging access", kind: "access" }, "a1"] }]);
  const asked = (await viewFor(admin)).db;
  const real = (db: typeof before) => ({ ...db, clientPeople: db.clientPeople.map((c) => ({ ...c, email: "ali@2n5.example" })) }); // the team's copy hides emails from non-admins
  assert.deepEqual(clientNudges(real(before), real(asked)).map((n) => [n.to, n.what]), [["ali@2n5.example", "Ayla Khan needs something from you: “Staging access”"]]);
  await applySteps(admin, [{ name: "postThreadMessage", args: ["ask:a1", "Only for us", "n1", { note: true }] }]);
  assert.deepEqual(clientNudges(real(asked), real((await viewFor(admin)).db)), []); // a note stays with the team
  assert.deepEqual(clientNudges(real(asked), real(asked)), []);
});

test("files in the chats: the team's and the client's reach whoever sees that chat — a note's never reaches the client", async () => {
  const png = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d605cb0000000049454e44ae426082", "hex");
  const shared = await uploadThreadFile(admin, "chat:CH", { name: "mockup.png", note: false }, png);
  const internal = await uploadThreadFile(admin, "chat:CH", { name: "internal.png", note: true }, png);
  const answer = await uploadClientFile(client, "ask:a1", { name: "keys.txt" }, Buffer.from("staging keys"));
  assert.equal((await readClientFile(client, shared.file.id))?.name, "mockup.png");
  assert.equal(await readClientFile(client, internal.file.id), null);
  assert.equal((await readClientFile(client, answer.file.id))?.download, true); // not an image or a PDF: only ever downloaded
  assert.equal((await viewFor(admin)).db.asks.find((a) => a.id === "a1")?.state, "answered"); // the file answered it
  await assert.rejects(uploadClientFile(client, "req:rq-2", { name: "x.txt" }, Buffer.from("x")), /isn't here/); // a team draft's chat
});
