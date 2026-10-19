// Doc bodies on a real Postgres: who may read and write, the revision check that stops silent overwrites, versions,
// the throttled "edited at", and search that never shows a doc you can't see.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { acceptInvitation, readSession, signUpCompany, type SessionRow } from "./accounts.ts";
import { applySteps, createInvites, viewFor } from "./changes.ts";
import { createDoc, DocConflict, docsLinkingTicket, normalizeMentions, presenceOf, readDoc, saveBody, searchDocs, setPresence } from "./docs.ts";
import { freshDatabase } from "./testing/db.ts";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join as joinPath } from "node:path";
import { readImage, uploadDocFile } from "./files.ts";

let pg: Awaited<ReturnType<typeof freshDatabase>>;
before(async () => { pg = await freshDatabase(); });
after(async () => { await pg.drop(); });

const APP = "https://1fold.test";
const PASSWORD = "Correct-Horse-42";
let admin: SessionRow, sam: SessionRow, lee: SessionRow; // sam is on the project; lee isn't
let docId = "";

async function join(email: string, name: string) {
  const { invites } = await createInvites(admin, [{ email, panel: "developer" }], APP);
  return (await readSession((await acceptInvitation(invites[0].link.split("/invite/")[1], { name, password: PASSWORD })).token))!;
}
const versions = () => pg.asOwner<{ rev: number; author_id: string }>("select rev, author_id from doc_versions where doc_id = $1 order by at", [docId]);

test("setup: a company, a project with Sam on it, and Lee off it", async () => {
  const founder = await signUpCompany({ name: "Ayla Khan", email: "ayla@docs.example", password: PASSWORD, company: "Docs Co", slug: "docs-co" });
  admin = (await readSession(founder.token))!;
  sam = await join("sam@docs.example", "Sam Dev");
  lee = await join("lee@docs.example", "Lee Dev");
  const samId = (await viewFor(sam)).meId;
  await applySteps(admin, [
    { name: "createProduct", args: [{ key: "DC", name: "Docs", type: "internal", pmId: founder.personId, projectManagerId: founder.personId }] },
    { name: "setMember", args: ["DC", samId, true] },
  ]);
});

test("a doc made from a template starts with its body; someone off the project can't open it", async () => {
  const made = await createDoc(sam, { productKey: "DC", title: "Kickoff", template: "meeting" });
  docId = made.id;
  const open = await readDoc(sam, docId);
  assert.equal(open.doc.title, "Kickoff");
  assert.equal(open.doc.icon, "🗓️");
  assert.equal(open.rev, 1);
  assert.match(open.body, /^## Attendees/);
  await assert.rejects(readDoc(lee, docId), /not found/);
  await assert.rejects(saveBody(lee, docId, { body: "mine", baseRev: 1 }), /not found/);
});

test("a save from an old revision is refused with the newer text; 'keep mine' keeps theirs as a version", async () => {
  const first = await saveBody(sam, docId, { body: "# One", baseRev: 1 });
  assert.equal(first.rev, 2);
  await assert.rejects(saveBody(admin, docId, { body: "# Stale", baseRev: 1 }), (e: unknown) => {
    assert.ok(e instanceof DocConflict);
    assert.deepEqual([e.latest.body, e.latest.rev], ["# One", 2]);
    return true;
  });
  const forced = await saveBody(admin, docId, { body: "# Admin's", baseRev: 1, force: true });
  assert.equal(forced.rev, 3);
  assert.equal((await readDoc(sam, docId)).body, "# Admin's");
  assert.ok((await versions()).some((v) => v.rev === 2), "Sam's text is kept as a version");
});

test("saves by one author within ten minutes are one version; the doc's 'edited at' isn't bumped on every save", async () => {
  const before = (await versions()).length;
  const a = await saveBody(sam, docId, { body: "# Two", baseRev: 3 });
  await saveBody(sam, docId, { body: "# Three", baseRev: a.rev });
  assert.equal((await versions()).length, before + 1);
  const touched = (await viewFor(sam)).db.docs.find((d) => d.id === docId)!;
  const again = await saveBody(sam, docId, { body: "# Four", baseRev: a.rev + 1 });
  assert.equal((await viewFor(sam)).db.docs.find((d) => d.id === docId)!.updatedAt, touched.updatedAt);
  assert.equal(again.rev, a.rev + 2);
  // An unchanged body is no new revision.
  assert.equal((await saveBody(sam, docId, { body: "# Four", baseRev: again.rev })).rev, again.rev);
});

test("search finds words in titles and bodies, as you type, but only in docs you may see", async () => {
  await saveBody(sam, docId, { body: "We picked Postgres for search.", baseRev: (await readDoc(sam, docId)).rev });
  await createDoc(lee, { title: "Company handbook", body: "Postgres is our database." });
  const samHits = await searchDocs(sam, "postgr");
  assert.deepEqual(samHits.map((h) => h.title).sort(), ["Company handbook", "Kickoff"]);
  assert.match(samHits.find((h) => h.title === "Kickoff")!.snippet, /«Postgres»/);
  assert.deepEqual((await searchDocs(lee, "postgres")).map((h) => h.title), ["Company handbook"]);
  assert.deepEqual((await searchDocs(lee, "kickoff")).map((h) => h.title), []);
});

test("presence: who has a doc open, and who's typing", async () => {
  await setPresence(sam, docId, { editing: true });
  await setPresence(admin, docId, { editing: false });
  assert.equal(presenceOf(admin.orgId, docId).length, 2);
  assert.ok(presenceOf(admin.orgId, docId).some((p) => p.editing));
  await setPresence(sam, docId, { editing: false, open: false });
  assert.equal(presenceOf(admin.orgId, docId).length, 1);
  await assert.rejects(setPresence(lee, docId, { editing: false }), /not found/);
});

test("a mention notifies the person once, never yourself, and never someone who can't see the doc", async () => {
  const view = await viewFor(admin);
  const id = (name: string) => view.db.people.find((p) => p.name === name)!.id;
  const notices = async (who: SessionRow) => (await viewFor(who)).db.notifications.filter((n) => n.kind === "mention" && n.target === `/d/${docId}`);
  const rev = (await readDoc(sam, docId)).rev;
  const mentions = `Ask [@Ayla Khan](mention:${id("Ayla Khan")}) and [@Lee Dev](mention:${id("Lee Dev")}) and me [@Sam Dev](mention:${id("Sam Dev")})`;
  const r = await saveBody(sam, docId, { body: mentions, baseRev: rev });
  assert.equal((await notices(admin)).length, 1);
  assert.match((await notices(admin))[0].text, /mentioned you in Kickoff/);
  assert.equal((await notices(lee)).length, 0); // Lee isn't on the project
  assert.equal((await notices(sam)).length, 0); // not yourself
  await saveBody(sam, docId, { body: `${mentions} — again`, baseRev: r.rev });
  assert.equal((await notices(admin)).length, 1, "saving again doesn't notify again");
});

test("backlinks: docs that link here (if you can see them), and docs that link a ticket", async () => {
  const target = await createDoc(sam, { productKey: "DC", title: "Target" });
  await createDoc(sam, { productKey: "DC", title: "Points at it", body: `See [Target](doc:${target.id}) and [DC-1](ticket:DC-1)` });
  await createDoc(admin, { title: "Company note", body: `Also [Target](doc:${target.id})` });
  assert.deepEqual((await readDoc(sam, target.id)).backlinks.map((b) => b.title).sort(), ["Company note", "Points at it"]);
  assert.deepEqual((await docsLinkingTicket(sam, "dc-1")).map((d) => d.title), ["Points at it"]);
  assert.deepEqual(await docsLinkingTicket(lee, "DC-1"), []); // not Lee's project
});

test("mentions written by a model (an email or a name) become the person's id; unknown ones stay plain text", async () => {
  const { db } = await viewFor(admin);
  const ayla = db.people.find((p) => p.name === "Ayla Khan")!;
  assert.equal(normalizeMentions(db, "Hi [@A](mention:ayla@docs.example)"), `Hi [@Ayla Khan](mention:${ayla.id})`);
  assert.equal(normalizeMentions(db, "Hi [@Ayla Khan](mention:Ayla Khan)"), `Hi [@Ayla Khan](mention:${ayla.id})`);
  assert.equal(normalizeMentions(db, "Hi [@Nobody](mention:nobody@x.y)"), "Hi @Nobody");
});

test("any file can go in a doc; only people who can see the doc fetch it; anything but an image only downloads", async () => {
  process.env.FILES_DIR = await mkdtemp(joinPath(tmpdir(), "onefold-docfiles-"));
  const txt = await uploadDocFile(sam, { docId, name: "notes.txt" }, Buffer.from("hello"));
  assert.equal(txt.type, "application/octet-stream");
  const got = await readImage(admin, txt.id);
  assert.deepEqual([got?.download, got?.bytes.toString(), got?.name], [true, "hello", "notes.txt"]);
  assert.equal(await readImage(lee, txt.id), null); // not Lee's project
  await assert.rejects(uploadDocFile(lee, { docId, name: "x.txt" }, Buffer.from("x")), /not found/);
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
  const img = await uploadDocFile(sam, { docId, name: "dot.png" }, png);
  assert.equal(img.type, "image/png");
  assert.equal((await readImage(sam, img.id))?.download, false);
});

test("a decision's text holds images too: managers upload them; only people who can see the decision fetch them", async () => {
  process.env.FILES_DIR = await mkdtemp(joinPath(tmpdir(), "onefold-decisionfiles-"));
  await applySteps(admin, [{ name: "addDecision", args: ["DC", { title: "Use one queue" }, "dec-files"] }]);
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
  const img = await uploadDocFile(admin, { decisionId: "dec-files", name: "diagram.png" }, png);
  assert.equal(img.type, "image/png");
  assert.equal((await readImage(sam, img.id))?.download, false); // on the project: sees it
  assert.equal(await readImage(lee, img.id), null); // not Lee's project
  await assert.rejects(uploadDocFile(sam, { decisionId: "dec-files", name: "x.png" }, png), /don.t have access/); // developers don't edit decisions
  await assert.rejects(uploadDocFile(admin, { decisionId: "nope", name: "x.png" }, png), /Decision not found/);
});

test("history: every save is a version with who and when; restoring keeps what it replaced", async () => {
  const { listVersions, getVersion, restoreVersion } = await import("./docs.ts");
  const made = await createDoc(sam, { productKey: "DC", title: "History", body: "first" });
  const one = await saveBody(sam, made.id, { body: "second", baseRev: 1 });
  await saveBody(admin, made.id, { body: "third", baseRev: one.rev });
  const list = await listVersions(sam, made.id);
  assert.ok(list.length >= 2);
  assert.ok(list[0].at >= list[list.length - 1].at, "newest first");
  const oldest = list[list.length - 1]; // Sam's first two saves within ten minutes are one version
  assert.equal((await getVersion(sam, made.id, oldest.id)).body, "second");
  assert.equal(list[0].authorId, (await viewFor(admin)).meId); // the latest is the admin's
  await restoreVersion(sam, made.id, oldest.id);
  assert.equal((await readDoc(sam, made.id)).body, "second");
  const after = await listVersions(sam, made.id);
  assert.ok((await Promise.all(after.map((v) => getVersion(sam, made.id, v.id)))).some((v) => v.body === "third"), "the replaced text is kept");
  await assert.rejects(listVersions(lee, made.id), /not found/);
});

test("only an urgent @@mention in a doc goes to the person's linked WhatsApp — once; a normal one stays in the app", async () => {
  const { sendOutbox } = await import("./whatsapp/outbox.ts");
  const view = await viewFor(admin);
  const aylaId = view.meId;
  await pg.asOwner("insert into whatsapp_links (org_id, member_id, user_id, jid, phone) values ($1, $2, $3, $4, $5)", [admin.orgId, aylaId, admin.userId, "923001234567@s.whatsapp.net", "923001234567"]);
  const made = await createDoc(sam, { productKey: "DC", title: "Launch plan" });
  const sent: { jid: string; text: string }[] = [];
  const send = { send: async (jid: string, text: string) => { sent.push({ jid, text }); } };
  const r1 = await saveBody(sam, made.id, { body: `Over to [@Ayla Khan](mention:${aylaId})`, baseRev: 1 });
  assert.equal(await sendOutbox(send), undefined, "a normal mention: nothing on WhatsApp");
  const r2 = await saveBody(sam, made.id, { body: `Over to [@@Ayla Khan](mention:${aylaId}) — today please`, baseRev: r1.rev });
  assert.deepEqual(await sendOutbox(send), { sent: 1, failed: 0 });
  assert.equal(sent[0].jid, "923001234567@s.whatsapp.net");
  assert.match(sent[0].text, /🚨 \*Sam Dev\* needs you\nThey mentioned you in \*Launch plan\*/);
  await saveBody(sam, made.id, { body: `Over to [@@Ayla Khan](mention:${aylaId}) — today please!`, baseRev: r2.rev });
  assert.equal(await sendOutbox(send), undefined, "still urgent: not sent again");
});
