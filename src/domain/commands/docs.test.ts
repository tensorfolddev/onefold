import { test } from "node:test";
import assert from "node:assert/strict";
import { fixClock } from "../clock.ts";
import { SEED_TODAY } from "../seed.ts";
import { demoDb } from "../../data/demo.ts";
import { snapshotFor } from "../snapshot.ts";
import { AccessError, ValidationError } from "./shared.ts";
import { addDocGroup, archiveDocs, createDoc, deleteDocGroup, deleteDocs, docDeletePhrase, moveDoc, renameDocGroup, restoreDocs, setDocGroup, updateDoc } from "./docs.ts";

fixClock(`${SEED_TODAY}T10:00:00`);
const db0 = demoDb();
const who = (id: string) => db0.people.find((p) => p.id === id)!;
const admin = who("u-tayyab"), lead = who("u-ayesha"), sara = who("u-sara"), faraz = who("u-faraz"); // sara: on AP; faraz: not

test("a developer on the project writes its docs; someone off it can't; anyone writes company docs", () => {
  const { db, key } = createDoc(db0, sara, { productKey: "AP", title: "API notes", icon: "📘" });
  const doc = db.docs.find((d) => d.id === key)!;
  assert.deepEqual([doc.productKey, doc.title, doc.icon, doc.authorId, doc.rev], ["AP", "API notes", "📘", "u-sara", 1]);
  const renamed = updateDoc(db, sara, key, { title: "API guide", icon: null });
  assert.equal(renamed.docs.find((d) => d.id === key)!.title, "API guide");
  assert.equal(renamed.docs.find((d) => d.id === key)!.icon, undefined);
  assert.throws(() => createDoc(db0, faraz, { productKey: "AP", title: "Nope" }), AccessError);
  assert.throws(() => updateDoc(db, faraz, key, { title: "Mine now" }), AccessError);
  const company = createDoc(db0, faraz, { title: "Handbook" });
  assert.equal(company.db.docs.find((d) => d.id === company.key)!.productKey, "");
  assert.throws(() => createDoc(db0, sara, { productKey: "AP", title: "  " }), ValidationError);
});

test("pages nest within their own space, never inside themselves", () => {
  const a = createDoc(db0, lead, { productKey: "AP", title: "Parent" });
  const b = createDoc(a.db, lead, { productKey: "AP", parentId: a.key, title: "Child" });
  assert.equal(b.db.docs.find((d) => d.id === b.key)!.parentId, a.key);
  assert.throws(() => moveDoc(b.db, lead, a.key, { parentId: b.key }), /inside itself/);
  assert.throws(() => createDoc(b.db, lead, { title: "Company child", parentId: a.key }), /parent's space/);
  const top = moveDoc(b.db, lead, b.key, { parentId: null, beforeId: a.key });
  const moved = top.docs.find((d) => d.id === b.key)!;
  assert.equal(moved.parentId, undefined);
  assert.ok(top.docs.findIndex((d) => d.id === b.key) < top.docs.findIndex((d) => d.id === a.key));
});

test("only admins archive and restore; a page goes with its subpages and comes back with them", () => {
  const a = createDoc(db0, sara, { productKey: "AP", title: "Spec" });
  const b = createDoc(a.db, sara, { productKey: "AP", parentId: a.key, title: "Appendix" });
  assert.throws(() => archiveDocs(b.db, sara, [a.key]), AccessError);
  assert.throws(() => archiveDocs(b.db, lead, [a.key]), AccessError);
  const archived = archiveDocs(b.db, admin, [a.key]);
  assert.ok(archived.docs.filter((d) => d.id === a.key || d.id === b.key).every((d) => d.archivedAt));
  assert.throws(() => updateDoc(archived, admin, a.key, { title: "x" }), /archived/);
  const back = restoreDocs(archived, admin, [a.key]);
  assert.ok(back.docs.filter((d) => d.id === a.key || d.id === b.key).every((d) => !d.archivedAt));
  // A subpage restored alone, while its parent stays archived, lands at the top of its space.
  const alone = restoreDocs(archived, admin, [b.key]).docs.find((d) => d.id === b.key)!;
  assert.deepEqual([alone.archivedAt, alone.parentId], [undefined, undefined]);
});

test("deleting is for archived pages, by an admin, with the name typed — subpages go too", () => {
  const a = createDoc(db0, sara, { productKey: "AP", title: "Old plan" });
  const b = createDoc(a.db, sara, { productKey: "AP", parentId: a.key, title: "Old detail" });
  assert.throws(() => deleteDocs(b.db, admin, [a.key], "Delete Old plan"), /Archive Old plan/);
  const archived = archiveDocs(b.db, admin, [a.key]);
  assert.throws(() => deleteDocs(archived, sara, [a.key], "Delete Old plan"), AccessError);
  assert.throws(() => deleteDocs(archived, admin, [a.key], "delete"), /Type "Delete Old plan"/);
  assert.equal(docDeletePhrase(["Old plan"]), "Delete Old plan");
  const gone = deleteDocs(archived, admin, [a.key], "Delete Old plan");
  assert.equal(gone.docs.some((d) => d.id === a.key || d.id === b.key), false);
});

test("snapshots: project docs only for people on the project; archived docs only for admins", () => {
  const p = createDoc(db0, sara, { productKey: "AP", title: "AP only" });
  const c = createDoc(p.db, sara, { title: "Everyone" });
  const arch = archiveDocs(c.db, admin, [c.key]);
  const ids = (db: typeof db0) => new Set(db.docs.map((d) => d.id));
  assert.ok(!ids(snapshotFor(c.db, faraz)).has(p.key));
  assert.ok(ids(snapshotFor(c.db, faraz)).has(c.key));
  assert.ok(ids(snapshotFor(c.db, sara)).has(p.key));
  assert.ok(!ids(snapshotFor(arch, sara)).has(c.key));
  assert.ok(ids(snapshotFor(arch, admin)).has(c.key));
});

test("groups: anyone who writes in a space groups its pages; deleting a group keeps the pages; a subpage leaves its group", () => {
  let db = addDocGroup(db0, sara, "AP", "Specs", "dg-specs");
  assert.throws(() => addDocGroup(db, sara, "AP", "specs"), /already a group/);
  assert.throws(() => addDocGroup(db, faraz, "AP", "Mine"), AccessError);
  const a = createDoc(db, sara, { productKey: "AP", title: "API", groupId: "dg-specs" });
  db = a.db;
  assert.equal(db.docs.find((d) => d.id === a.key)!.groupId, "dg-specs");
  const b = createDoc(db, sara, { productKey: "AP", title: "Loose" });
  db = setDocGroup(b.db, sara, b.key, "dg-specs");
  assert.equal(db.docs.find((d) => d.id === b.key)!.groupId, "dg-specs");
  db = moveDoc(db, sara, b.key, { parentId: a.key });
  assert.equal(db.docs.find((d) => d.id === b.key)!.groupId, undefined); // goes with its parent now
  db = renameDocGroup(db, sara, "dg-specs", "Specifications");
  assert.equal(db.docGroups.find((g) => g.id === "dg-specs")!.name, "Specifications");
  const company = addDocGroup(db, faraz, "", "Handbook", "dg-hb");
  assert.throws(() => setDocGroup(company, sara, a.key, "dg-hb"), /another space/);
  db = deleteDocGroup(db, sara, "dg-specs");
  assert.equal(db.docGroups.length, 0);
  assert.equal(db.docs.find((d) => d.id === a.key)!.groupId, undefined);
  assert.ok(db.docs.some((d) => d.id === a.key), "pages stay");
});

test("decisions: a full record — status, context, alternatives, consequences, links — and superseding", async () => {
  const { addDecision, updateDecision } = await import("./docs.ts");
  const ticket = db0.tickets.find((t) => t.productKey === "AP")!;
  assert.throws(() => addDecision(db0, sara, "AP", { title: "x", why: "y" }), AccessError); // developers don't record decisions
  let db = addDecision(db0, lead, "AP", { title: "Use Postgres", why: "One database for everything", status: "proposed",
    context: "We need search", alternatives: "Elastic", consequences: "Run backups", ticketKeys: [ticket.key, "NOPE-1"] });
  const d = db.decisions.at(-1)!;
  assert.deepEqual([d.status, d.context, d.alternatives, d.consequences, d.ticketKeys], ["proposed", "We need search", "Elastic", "Run backups", [ticket.key]]);
  db = updateDecision(db, lead, d.id, { status: "accepted" });
  assert.equal(db.decisions.find((x) => x.id === d.id)!.status, "accepted");
  db = addDecision(db, lead, "AP", { title: "Use SQLite", why: "Simpler" });
  const newer = db.decisions.at(-1)!;
  db = updateDecision(db, lead, d.id, { supersededBy: newer.id });
  assert.deepEqual([db.decisions.find((x) => x.id === d.id)!.status, db.decisions.find((x) => x.id === d.id)!.supersededBy], ["superseded", newer.id]);
  assert.throws(() => updateDecision(db, lead, d.id, { supersededBy: d.id }), /another decision/);
  assert.throws(() => updateDecision(db, lead, d.id, { status: "maybe" as never }), /Unknown decision status/);
});

test("decisions: the caller names a new decision, so the browser and the server agree on its id", async () => {
  const { addDecision } = await import("./docs.ts");
  const db = addDecision(db0, lead, "AP", { title: "Use RLS", why: "Org isolation" }, "dec-1");
  assert.equal(db.decisions.at(-1)!.id, "dec-1");
  assert.throws(() => addDecision(db, lead, "AP", { title: "Again", why: "Same id" }, "dec-1"), /already exists/);
});

test("decisions: your own label (like Suspended) and a note colour; checked, cleared, and superseding drops the label", async () => {
  const { addDecision, updateDecision } = await import("./docs.ts");
  let db = addDecision(db0, lead, "AP", { title: "Use RLS", why: "Org isolation" }, "dec-l");
  const get = () => db.decisions.find((d) => d.id === "dec-l")!;
  db = updateDecision(db, lead, "dec-l", { label: { name: "  Suspended ", color: "#A25DDC" }, color: "#FFCB00" });
  assert.deepEqual([get().label, get().color], [{ name: "Suspended", color: "#a25ddc" }, "#ffcb00"]);
  assert.throws(() => updateDecision(db, lead, "dec-l", { label: { name: "accepted", color: "#a25ddc" } }), /already a status/);
  assert.throws(() => updateDecision(db, lead, "dec-l", { label: { name: "On hold", color: "purple" } }), /colour/);
  assert.throws(() => updateDecision(db, lead, "dec-l", { label: { name: "x".repeat(25), color: "#a25ddc" } }), /under 24/);
  assert.throws(() => updateDecision(db, lead, "dec-l", { color: "red" }), /colour/);
  assert.throws(() => updateDecision(db, sara, "dec-l", { color: "#ffcb00" }), AccessError); // developers don't edit decisions
  db = updateDecision(db, lead, "dec-l", { label: null, color: null });
  assert.deepEqual([get().label, get().color], [undefined, undefined]);
  db = addDecision(db, lead, "AP", { title: "Use Postgres RLS v2", why: "Newer" }, "dec-m");
  db = updateDecision(db, lead, "dec-l", { label: { name: "On hold", color: "#579bfc" } });
  db = updateDecision(db, lead, "dec-l", { supersededBy: "dec-m" });
  assert.deepEqual([get().status, get().label], ["superseded", undefined]);
});

test("doc covers: a colour, a gallery image or an uploaded image — nothing else", async () => {
  const { updateDoc } = await import("./docs.ts");
  const docId = db0.docs.find((d) => d.productKey === "AP" && !d.archivedAt)!.id;
  const cover = (c: string | null) => updateDoc(db0, lead, docId, { cover: c }).docs.find((d) => d.id === docId)!.cover;
  assert.equal(cover("dawn"), "dawn");
  assert.equal(cover("/covers/mountains-dawn.svg"), "/covers/mountains-dawn.svg");
  assert.equal(cover("/api/files/file-abc_123"), "/api/files/file-abc_123");
  assert.equal(cover(null), undefined);
  for (const bad of ["https://evil.example/x.png", "/covers/../secret.svg", "/api/files/x\");background:url(x", "url(x)"]) {
    assert.throws(() => cover(bad), /cover/, bad);
  }
});

test("decisions: a body you write freely (Markdown); its first words become the summary; new @mentions are told once", async () => {
  const { addDecision, updateDecision } = await import("./docs.ts");
  let db = addDecision(db0, lead, "AP", { title: "Pick a queue" }, "dec-b"); // a title is enough to start
  const get = () => db.decisions.find((d) => d.id === "dec-b")!;
  assert.equal(get().why, "");
  const body = `## Why\n\nWe need **retries** without a new service. See [AP-1](ticket:AP-1) and ask [@${sara.name}](mention:${sara.id}).\n\n| Option | Cost |\n| --- | --- |\n| Postgres | 0 |`;
  const before = db.notifications.length;
  db = updateDecision(db, lead, "dec-b", { body });
  assert.equal(get().body, body);
  assert.equal(get().why, `We need retries without a new service. See AP-1 and ask @${sara.name}.`); // the words, not headings or tables
  const told = db.notifications.slice(0, db.notifications.length - before);
  assert.deepEqual(told.map((n) => [n.personId, n.kind, n.target]), [[sara.id, "mention", "/products/AP/decisions?d=dec-b"]]);
  db = updateDecision(db, lead, "dec-b", { body: `${body}\n\nMore.` }); // still mentioned: not told again
  assert.equal(db.notifications.length, before + 1);
  assert.throws(() => updateDecision(db, lead, "dec-b", { body: "x".repeat(200_001) }), /too long/);
  const { plainSummary } = await import("./docs.ts");
  assert.equal(plainSummary("Ship **now**, _not_ later; keep `snake_case` and ~~old~~ words."), "Ship now, not later; keep snake_case and old words.");
});

test("@@ mentions are urgent: in a decision's text (told again, urgently, even if mentioned before) and in a doc", async () => {
  const { addDecision, updateDecision, notifyDocMentions } = await import("./docs.ts");
  let db = addDecision(db0, lead, "AP", { title: "Pick a host", body: `Ask [@${sara.name}](mention:${sara.id})` }, "dec-u");
  const notices = (d: typeof db) => d.notifications.filter((n) => n.personId === sara.id && !db0.notifications.some((o) => o.id === n.id));
  assert.deepEqual(notices(db).map((n) => !!n.urgent), [false]);
  db = updateDecision(db, lead, "dec-u", { body: `Ask [@@${sara.name}](mention:${sara.id}) today` });
  assert.deepEqual(notices(db).map((n) => !!n.urgent), [true, false]); // newest first
  db = updateDecision(db, lead, "dec-u", { body: `Ask [@@${sara.name}](mention:${sara.id}) today!` });
  assert.equal(notices(db).length, 2); // still urgent: not told again
  const docId = db0.docs.find((d) => d.productKey === "AP" && !d.archivedAt)!.id;
  const told = notifyDocMentions(db0, lead, docId, [], [sara.id]).notifications[0];
  assert.deepEqual([told.personId, told.urgent], [sara.id, true]);
});
