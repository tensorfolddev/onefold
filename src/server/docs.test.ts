// Doc bodies on a real Postgres: who may read and write, the revision check that stops silent overwrites, versions,
// the throttled "edited at", and search that never shows a doc you can't see.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { acceptInvitation, readSession, signUpCompany, type SessionRow } from "./accounts.ts";
import { applySteps, createInvites, viewFor } from "./changes.ts";
import { createDoc, DocConflict, docsLinkingTicket, normalizeMentions, presenceOf, readDoc, saveBody, searchDocs, setPresence } from "./docs.ts";
import { freshDatabase } from "./testing/db.ts";

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
