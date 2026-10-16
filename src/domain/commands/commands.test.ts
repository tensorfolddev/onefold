import { test } from "node:test";
import assert from "node:assert/strict";
import { fixClock } from "../clock.ts";
import { SEED_TODAY } from "../seed.ts";
import { demoDb } from "../../data/demo.ts";
import { normalize as withSystemLists } from "../../data/db.ts";
import { AccessError, ValidationError } from "./shared.ts";
import * as docs from "./docs.ts";
import * as lists from "./lists.ts";
import * as people from "./people.ts";
import * as products from "./products.ts";
import * as template from "./template.ts";
import * as tickets from "./tickets.ts";

fixClock(`${SEED_TODAY}T10:00:00`);
const A = { ...docs, ...lists, ...people, ...products, ...template, ...tickets, AccessError, ValidationError };
const seedDb = () => demoDb();
const db0 = seedDb();
const who = (id: string) => db0.people.find((p) => p.id === id)!;
const sara = who("u-sara"), admin = who("u-tayyab"), lead = who("u-ayesha"), faraz = who("u-faraz");
const ticketIn = (db: ReturnType<typeof seedDb>, key: string) => db.tickets.find((t) => t.key === key)!;

test("developer creates, edits and deletes a ticket on own product", () => {
  const { db, key } = A.createTicket(db0, sara, "AP", "New thing");
  assert.equal(key, "AP-34");
  const t = db.tickets.find((x) => x.key === key)!;
  assert.equal(t.statusId, "ap-backlog");
  assert.equal(t.createdBy, "u-sara");
  const db2 = A.updateTicket(db, sara, key, { title: "Renamed", statusId: "ap-dev" });
  const log = db2.activity.filter((a) => a.ticketKey === key).map((a) => `${a.field}:${a.from ?? ""}>${a.to}`);
  assert.deepEqual(log, ["Created:>Backlog", "Title:New thing>Renamed", "Status:Backlog>In Dev"]);
  const db3 = A.deleteTickets(db2, sara, [key]);
  assert.equal(db3.tickets.some((x) => x.key === key), false);
  assert.equal(db3.activity.some((a) => a.ticketKey === key), false);
});

test("ticket title is required and assignee changes log names", () => {
  assert.throws(() => A.createTicket(db0, sara, "AP", "   "), A.ValidationError);
  assert.throws(() => A.updateTicket(db0, sara, "AP-12", { title: "" }), A.ValidationError);
  const db = A.updateTicket(db0, sara, "AP-12", { assigneeId: "u-daniyal" });
  const last = db.activity.at(-1)!;
  assert.deepEqual([last.field, last.from, last.to], ["Assignee", "Sara Ahmed", "Daniyal Shah"]);
});

test("developer is refused outside own products", () => {
  assert.throws(() => A.createTicket(db0, faraz, "AP", "x"), A.AccessError);
  assert.throws(() => A.deleteTickets(db0, faraz, ["AP-12"]), A.AccessError);
  assert.throws(() => A.updateTicket(db0, faraz, "AP-12", { title: "x" }), A.AccessError);
});

test("job titles: add, rename (people follow), delete only when unused", () => {
  const db = A.addJobTitle(db0, admin, "Data Scientist");
  assert.ok(db.jobTitles.includes("Data Scientist"));
  assert.throws(() => A.addJobTitle(db, admin, "data scientist"), A.ValidationError);
  const renamed = A.renameJobTitle(db0, admin, "Engineer", "Software Engineer");
  assert.ok(renamed.jobTitles.includes("Software Engineer") && !renamed.jobTitles.includes("Engineer"));
  assert.equal(renamed.people.find((p) => p.id === "u-sara")!.role, "Software Engineer");
  assert.throws(() => A.deleteJobTitle(db0, admin, "Engineer"), A.ValidationError);
  assert.ok(!A.deleteJobTitle(db, admin, "Data Scientist").jobTitles.includes("Data Scientist"));
  assert.throws(() => A.addJobTitle(db0, lead, "x"), A.AccessError);
});

test("teams: delete only when nobody is on it", () => {
  assert.throws(() => A.deleteTeam(db0, admin, "frontend"), A.ValidationError);
  const db = A.addTeam(db0, admin, "QA");
  const qa = db.teams.find((t) => t.name === "QA")!;
  assert.equal(A.deleteTeam(db, admin, qa.id).teams.some((t) => t.id === qa.id), false);
});

test("admin cannot deactivate or demote self", () => {
  assert.throws(() => A.updatePerson(db0, admin, admin.id, { active: false }), A.ValidationError);
  assert.throws(() => A.updatePerson(db0, admin, admin.id, { panel: "developer" }), A.ValidationError);
  const db = A.updatePerson(db0, admin, "u-sara", { active: false });
  assert.equal(db.people.find((p) => p.id === "u-sara")!.active, false);
});

test("teams: add, rename, set lead", () => {
  const db = A.addTeam(db0, admin, "QA");
  const qa = db.teams.find((t) => t.name === "QA")!;
  const db2 = A.updateTeam(db, admin, qa.id, { name: "Quality", leadId: "u-ayesha" });
  assert.deepEqual(db2.teams.find((t) => t.id === qa.id), { id: qa.id, name: "Quality", leadId: "u-ayesha" });
  assert.throws(() => A.addTeam(db0, admin, "Frontend"), A.ValidationError);
  assert.throws(() => A.addTeam(db0, lead, "X"), A.AccessError);
});

test("createProduct validates key and starts with the standard lists", () => {
  const base = { name: "x", type: "internal" as const, pmId: "u-hina", projectManagerId: "u-bilal" };
  assert.throws(() => A.createProduct(db0, admin, { ...base, key: "ap" }), A.ValidationError);
  assert.throws(() => A.createProduct(db0, admin, { ...base, key: "AP" }), A.ValidationError);
  assert.throws(() => A.createProduct(db0, lead, { ...base, key: "XY" }), A.AccessError);
  assert.throws(() => A.createProduct(db0, admin, { ...base, key: "XY", pmId: "u-nobody" }), A.ValidationError);
  const db = A.createProduct(db0, admin, { ...base, key: "XY", name: "Xylo" });
  const p = db.products.find((x) => x.key === "XY")!;
  assert.equal(p.stage, "INTAKE");
  assert.deepEqual(p.memberIds, []);
  assert.deepEqual(db.statusesByProduct.XY.map((s) => s.name), ["Epic", "Backlog", "To Do", "In Progress", "Review", "Done"]);
  assert.deepEqual(db.statusesByProduct.XY.slice(0, 2).map((s) => s.system), ["epic", "backlog"]);
});

test("stage request then approval", () => {
  const db = A.requestStage(db0, who("u-hina"), "OR");
  assert.equal(db.stageRequests.length, 1);
  assert.equal(db.stageRequests[0].stage, "DEFINE");
  assert.throws(() => A.approveStage(db, who("u-hina"), "OR"), A.AccessError);
  const db2 = A.approveStage(db, admin, "OR");
  assert.equal(db2.products.find((p) => p.key === "OR")!.stage, "DEFINE");
  assert.equal(db2.products.find((p) => p.key === "OR")!.waitingApproval, undefined);
  assert.equal(db2.stageRequests.length, 0);
});

test("manager can add a developer but not another manager", () => {
  const db = A.setMember(db0, lead, "AP", "u-faraz", true);
  assert.ok(db.products.find((p) => p.key === "AP")!.memberIds.includes("u-faraz"));
  assert.throws(() => A.setMember(db0, lead, "AP", "u-maryam", true), A.AccessError);
  const removed = A.setMember(db0, lead, "AP", "u-sara", false);
  assert.equal(removed.products.find((p) => p.key === "AP")!.memberIds.includes("u-sara"), false);
});

test("docs, decisions and milestones respect roles", () => {
  assert.throws(() => A.addDoc(db0, sara, "AP", { kind: "Brief", title: "x" }), A.AccessError);
  const db = A.addDoc(db0, sara, "AP", { kind: "Meeting notes", title: "Standup" });
  assert.equal(db.docs.at(-1)!.authorId, "u-sara");
  assert.throws(() => A.addDecision(db0, sara, "AP", { title: "x", why: "y" }), A.AccessError);
  const db2 = A.addDecision(db0, lead, "AP", { title: "Use RLS", why: "Org isolation" });
  assert.equal(db2.decisions.at(-1)!.byId, "u-ayesha");
  const db3 = A.upsertMilestone(db0, lead, "AP", { name: "v2", due: "2027-01-15", pct: 0 });
  const m = db3.milestones.at(-1)!;
  const db4 = A.upsertMilestone(db3, lead, "AP", { id: m.id, name: "v2.0", due: "2027-01-20", pct: 10 });
  assert.equal(db4.milestones.find((x) => x.id === m.id)!.name, "v2.0");
  assert.throws(() => A.upsertMilestone(db0, sara, "AP", { name: "x", due: "2027-01-01", pct: 0 }), A.AccessError);
});

test("actions never mutate their input", () => {
  const before = JSON.stringify(db0);
  A.createTicket(db0, sara, "AP", "x");
  A.addTeam(db0, admin, "QA");
  A.setMember(db0, admin, "AP", "u-faraz", true);
  A.setSection(db0, sara, "AP-12", "goal", "changed");
  assert.equal(JSON.stringify(db0), before);
});

test("moveTicket changes status and drops the ticket at a specific position", () => {
  const order = (db: typeof db0, statusId: string) => db.tickets.filter((t) => t.productKey === "AP" && t.statusId === statusId).map((t) => t.key);
  const inDev = order(db0, "ap-dev");
  // Into another column, before its second card
  const db = A.moveTicket(db0, sara, "AP-25", "ap-dev", inDev[1]);
  assert.deepEqual(order(db, "ap-dev"), [inDev[0], "AP-25", ...inDev.slice(1)]);
  assert.equal(db.activity.at(-1)!.field, "Status");
  // Within the same column, to the end (no activity for a pure reorder)
  const db2 = A.moveTicket(db, sara, "AP-25", "ap-dev");
  assert.deepEqual(order(db2, "ap-dev"), [...inDev, "AP-25"]);
  assert.equal(db2.activity.length, db.activity.length);
  assert.throws(() => A.moveTicket(db0, faraz, "AP-25", "ap-dev"), A.AccessError);
});

test("lists (statuses): add, rename, recolour, reorder, delete with ticket move", () => {
  const names = (db: typeof db0) => db.statusesByProduct.AP.map((s) => s.name);
  const db = A.addStatus(db0, sara, "AP", { name: "Design" });
  const added = db.statusesByProduct.AP.at(-1)!;
  assert.deepEqual([added.name, added.category, added.tone], ["Design", "in_progress", "working"]);
  assert.throws(() => A.addStatus(db, sara, "AP", { name: "design" }), A.ValidationError);
  assert.throws(() => A.addStatus(db, sara, "AP", { name: " " }), A.ValidationError);
  const renamed = A.updateStatus(db, sara, "AP", added.id, { name: "UX", tone: "review", category: "todo" });
  assert.deepEqual(renamed.statusesByProduct.AP.at(-1), { ...added, name: "UX", tone: "review", category: "todo" });
  // Nothing can go in front of the fixed Epic + Backlog lists: aiming there lands right after them
  const moved = A.moveStatus(renamed, sara, "AP", added.id, "ap-epic");
  assert.deepEqual(names(moved).slice(0, 3), ["Epic", "Backlog", "UX"]);
  // Delete a list that has tickets: they move to the chosen list first
  const inDev = db0.tickets.filter((t) => t.statusId === "ap-dev").map((t) => t.key);
  assert.throws(() => A.deleteStatus(db0, sara, "AP", "ap-dev"), A.ValidationError);
  const gone = A.deleteStatus(db0, sara, "AP", "ap-dev", "ap-review");
  assert.equal(gone.statusesByProduct.AP.some((s) => s.id === "ap-dev"), false);
  assert.ok(inDev.every((k) => gone.tickets.find((t) => t.key === k)!.statusId === "ap-review"));
  assert.throws(() => A.addStatus(db0, faraz, "AP", { name: "x" }), A.AccessError);
});

test("Epic and Backlog are always the first two lists and can't be changed", () => {
  for (const key of ["AP", "OF", "NV", "OR"]) {
    assert.deepEqual(db0.statusesByProduct[key].slice(0, 2).map((x) => x.system), ["epic", "backlog"], key);
  }
  for (const sid of ["ap-epic", "ap-backlog"]) {
    assert.throws(() => A.updateStatus(db0, admin, "AP", sid, { name: "x" }), A.ValidationError);
    assert.throws(() => A.deleteStatus(db0, admin, "AP", sid, "ap-ready"), A.ValidationError);
    assert.throws(() => A.moveStatus(db0, admin, "AP", sid), A.ValidationError);
  }
  // New products get them too; deleting every other list leaves exactly those two
  let db = A.createProduct(db0, admin, { key: "ZZ", name: "Zed", type: "internal", pmId: "u-hina", projectManagerId: "u-bilal" });
  for (const st of db.statusesByProduct.ZZ.filter((x) => !x.system)) db = A.deleteStatus(db, admin, "ZZ", st.id);
  assert.deepEqual(db.statusesByProduct.ZZ.map((x) => x.name), ["Epic", "Backlog"]);
});

test("new tickets start in Backlog, not Epic", () => {
  const { db, key } = A.createTicket(db0, sara, "OF", "x");
  assert.equal(db.tickets.find((t) => t.key === key)!.statusId, "of-backlog");
});

test("saved data from before gets the fixed lists added in front", () => {
  const old = seedDb();
  old.statusesByProduct.NV = old.statusesByProduct.NV.filter((x) => x.system !== "epic").map((x) => ({ ...x, system: undefined }));
  old.statusesByProduct.NV = [old.statusesByProduct.NV[2], ...old.statusesByProduct.NV.filter((_, i) => i !== 2)];
  const fixed = withSystemLists(old).statusesByProduct.NV;
  assert.deepEqual(fixed.slice(0, 2).map((x) => [x.name, x.system]), [["Epic", "epic"], ["Backlog", "backlog"]]);
  assert.equal(fixed.length, old.statusesByProduct.NV.length + 1);
});

test("createTicket can add to a chosen list, at its top or bottom", () => {
  const col = (db: typeof db0) => db.tickets.filter((t) => t.productKey === "AP" && t.statusId === "ap-ready").map((t) => t.key);
  const before = col(db0);
  const top = A.createTicket(db0, sara, "AP", "On top", { statusId: "ap-ready", position: "top" });
  assert.deepEqual(col(top.db), [top.key, ...before]);
  const bottom = A.createTicket(top.db, sara, "AP", "At the bottom", { statusId: "ap-ready", position: "bottom" });
  assert.deepEqual(col(bottom.db), [top.key, ...before, bottom.key]);
  assert.equal(bottom.db.activity.at(-1)!.to, "Ready");
  assert.throws(() => A.createTicket(db0, sara, "AP", "x", { statusId: "nv-todo" }), A.ValidationError);
});

test("epics live only in the Epic list and get a colour instead of a status", () => {
  const ap3 = db0.tickets.find((t) => t.key === "AP-3")!;
  assert.deepEqual([ap3.type, ap3.statusId], ["epic", "ap-epic"]);
  assert.throws(() => A.updateTicket(db0, sara, "AP-3", { statusId: "ap-dev" }), A.ValidationError);
  assert.throws(() => A.moveTicket(db0, sara, "AP-3", "ap-ready"), A.ValidationError);
  assert.throws(() => A.moveTicket(db0, sara, "AP-12", "ap-epic"), A.ValidationError);
  const coloured = A.updateTicket(db0, sara, "AP-3", { color: "var(--color-grass_green)" });
  assert.equal(coloured.tickets.find((t) => t.key === "AP-3")!.color, "var(--color-grass_green)");
  assert.equal(coloured.activity.at(-1)!.field, "Colour");
  // Adding a task in the Epic list makes an epic
  const { db, key } = A.createTicket(db0, sara, "AP", "Payments", { statusId: "ap-epic" });
  const t = db.tickets.find((x) => x.key === key)!;
  assert.equal(t.type, "epic");
  assert.ok(t.color);
});

test("saved data with an epic in another list gets it moved to the Epic list", () => {
  const old = seedDb();
  old.tickets = old.tickets.map((t) => (t.key === "AP-3" ? { ...t, statusId: "ap-dev", color: undefined } : t));
  const fixed = withSystemLists(old).tickets.find((t) => t.key === "AP-3")!;
  assert.equal(fixed.statusId, "ap-epic");
  assert.ok(fixed.color);
});

test("product icon + colour: emoji or icon, admins and the product's managers only", () => {
  const withEmoji = A.setProductLook(db0, lead, "AP", { icon: { type: "emoji", value: "🚀" }, color: "var(--color-berry)" });
  const ap = withEmoji.products.find((p) => p.key === "AP")!;
  assert.deepEqual([ap.icon, ap.color], [{ type: "emoji", value: "🚀" }, "var(--color-berry)"]);
  const withIcon = A.setProductLook(withEmoji, admin, "AP", { icon: { type: "icon", value: "rocket" } });
  assert.deepEqual(withIcon.products.find((p) => p.key === "AP")!.icon, { type: "icon", value: "rocket" });
  const cleared = A.setProductLook(withIcon, admin, "AP", { icon: null });
  assert.equal(cleared.products.find((p) => p.key === "AP")!.icon, undefined); // back to the first letter
  assert.throws(() => A.setProductLook(db0, admin, "AP", { icon: { type: "icon", value: "<script>" } }), A.ValidationError);
  assert.throws(() => A.setProductLook(db0, admin, "AP", { color: "red; background: url(x)" }), A.ValidationError);
  assert.throws(() => A.setProductLook(db0, sara, "AP", { icon: { type: "emoji", value: "🚀" } }), A.AccessError);
});

test("epic colours come from the shared 24-colour palette", () => {
  assert.equal(A.updateTicket(db0, sara, "AP-3", { color: "var(--color-chili-blue)" }).tickets.find((t) => t.key === "AP-3")!.color, "var(--color-chili-blue)");
  assert.throws(() => A.updateTicket(db0, sara, "AP-3", { color: "red; background: url(x)" }), A.ValidationError);
});

test("groups: any grouping; deleting one leaves its products ungrouped", () => {
  assert.deepEqual(db0.productGroups.map((g) => g.name), ["Client products", "Internal products"]);
  assert.equal(db0.products.find((p) => p.key === "AP")!.groupId, db0.productGroups[0].id);
  const db = A.addGroup(db0, admin, "AI");
  const ai = db.productGroups.find((g) => g.name === "AI")!;
  assert.throws(() => A.addGroup(db, admin, "ai"), A.ValidationError);
  const moved = A.updateProduct(db, admin, "NV", { groupId: ai.id });
  assert.equal(moved.products.find((p) => p.key === "NV")!.groupId, ai.id);
  const gone = A.deleteGroup(moved, admin, ai.id);
  assert.equal(gone.productGroups.some((g) => g.id === ai.id), false);
  assert.equal(gone.products.find((p) => p.key === "NV")!.groupId, undefined);
  assert.equal(A.renameGroup(db, admin, ai.id, "Machine learning").productGroups.find((g) => g.id === ai.id)!.name, "Machine learning");
  assert.throws(() => A.addGroup(db0, sara, "X"), A.AccessError); // managers may (archive.test.ts); developers may not
});

test("createProduct takes group, created date, icon and colour", () => {
  const db1 = A.addGroup(db0, admin, "Platform");
  const g = db1.productGroups.at(-1)!;
  const base = { name: "Atlas", type: "internal" as const, pmId: "u-hina", projectManagerId: "u-bilal" };
  const db = A.createProduct(db1, admin, {
    ...base, key: "AT", groupId: g.id, createdAt: "2026-09-15", icon: { type: "emoji", value: "🗺️" }, color: "var(--color-teal)",
  });
  const p = db.products.find((x) => x.key === "AT")!;
  assert.deepEqual([p.groupId, p.createdAt, p.icon?.value, p.color], [g.id, "2026-09-15", "🗺️", "var(--color-teal)"]);
  const d2 = A.createProduct(db1, admin, { ...base, key: "AU" }); // defaults: today, no group
  assert.deepEqual([d2.products.at(-1)!.createdAt, d2.products.at(-1)!.groupId], [SEED_TODAY, undefined]);
  assert.throws(() => A.createProduct(db1, admin, { ...base, key: "AV", groupId: "nope" }), A.ValidationError);
  assert.throws(() => A.createProduct(db1, admin, { ...base, key: "AV", createdAt: "yesterday" }), A.ValidationError);
});

test("template: sections are fixed per type — unknown ids and wrong shapes are refused", () => {
  const db = A.setSection(db0, sara, "AP-26", "goal", "  Let people upload a profile photo.  ");
  assert.equal(ticketIn(db, "AP-26").sections!.goal, "Let people upload a profile photo.");
  const crit = [{ id: "c1", text: "  Accepts PNG and JPG ", done: false }, { id: "c2", text: "Max 5 MB" }];
  const db2 = A.setSection(db, sara, "AP-26", "acceptance_criteria", crit);
  assert.deepEqual(ticketIn(db2, "AP-26").sections!.acceptance_criteria, [{ id: "c1", text: "Accepts PNG and JPG", done: false }, { id: "c2", text: "Max 5 MB", done: false }]);
  assert.throws(() => A.setSection(db0, sara, "AP-26", "my_own_section", "x"), A.ValidationError); // template is locked
  assert.throws(() => A.setSection(db0, sara, "AP-26", "steps_to_reproduce", []), A.ValidationError); // bug-only section
  assert.throws(() => A.setSection(db0, sara, "AP-26", "goal", [{ id: "a", text: "x" }]), A.ValidationError); // text section
  assert.throws(() => A.setSection(db0, sara, "AP-26", "acceptance_criteria", "text"), A.ValidationError);
  assert.throws(() => A.setSection(db0, sara, "AP-26", "acceptance_criteria", [{ id: "a", text: "  " }]), A.ValidationError);
  assert.throws(() => A.setSection(db0, sara, "AP-26", "dependencies", "x"), A.ValidationError); // not a free-form section
  assert.throws(() => A.setSection(db0, admin, "AP-26", "my_own_section", "x"), A.ValidationError); // not even admins
  assert.throws(() => A.setSection(db0, faraz, "AP-26", "goal", "x"), A.AccessError);
  assert.equal(db2.activity.at(-1)!.field, "Section");
});

test("template: Definition of done keeps its fixed lines; only ticks are stored", () => {
  const db = A.setSection(db0, sara, "AP-12", "definition_of_done", [{ id: "reviewed", text: "anything", done: true }]);
  assert.deepEqual(ticketIn(db, "AP-12").sections!.definition_of_done, [{ id: "reviewed", text: "Code reviewed, approved and merged", done: true }]);
  assert.throws(() => A.setSection(db0, sara, "AP-12", "definition_of_done", [{ id: "made_up", text: "x", done: true }]), A.ValidationError);
});

test("type: tasks and bugs switch; epics stay epics", () => {
  const db = A.updateTicket(db0, sara, "AP-26", { type: "bug" });
  assert.equal(ticketIn(db, "AP-26").type, "bug");
  assert.throws(() => A.updateTicket(db0, sara, "AP-26", { type: "epic" }), A.ValidationError);
  assert.throws(() => A.updateTicket(db0, lead, "AP-3", { type: "task" }), A.ValidationError);
});

test("epic link: only an epic of the same product, never on an epic", () => {
  const db = A.updateTicket(db0, sara, "AP-26", { epicKey: "AP-3" });
  assert.equal(ticketIn(db, "AP-26").epicKey, "AP-3");
  assert.equal(db.activity.at(-1)!.field, "Epic");
  assert.throws(() => A.updateTicket(db0, sara, "AP-26", { epicKey: "AP-12" }), A.ValidationError); // not an epic
  assert.throws(() => A.updateTicket(db0, lead, "AP-3", { epicKey: "AP-3" }), A.ValidationError);
  assert.equal(ticketIn(A.updateTicket(db, sara, "AP-26", { epicKey: undefined }), "AP-26").epicKey, undefined);
});

test("dependencies: previous tickets only once, no self, no loops", () => {
  let db = A.addDependency(db0, sara, "AP-26", "AP-25");
  db = A.addDependency(db, sara, "AP-25", "AP-21");
  assert.deepEqual(ticketIn(db, "AP-26").dependsOn, ["AP-25"]);
  assert.throws(() => A.addDependency(db, sara, "AP-26", "AP-25"), A.ValidationError); // already there
  assert.throws(() => A.addDependency(db, sara, "AP-26", "AP-26"), A.ValidationError);
  assert.throws(() => A.addDependency(db, sara, "AP-21", "AP-26"), A.ValidationError); // AP-26 → AP-25 → AP-21 → AP-26
  assert.throws(() => A.addDependency(db, sara, "AP-26", "NV-1"), A.AccessError); // a product Sara isn't on
  assert.throws(() => A.addDependency(db, sara, "AP-26", "AP-999"), A.ValidationError);
  db = A.removeDependency(db, sara, "AP-26", "AP-25");
  assert.deepEqual(ticketIn(db, "AP-26").dependsOn, []);
});

test("deleting a ticket clears it from dependencies and epic links", () => {
  let db = A.addDependency(db0, sara, "AP-26", "AP-25");
  db = A.updateTicket(db, sara, "AP-26", { epicKey: "AP-3" });
  db = A.deleteTickets(db, admin, ["AP-25", "AP-3"]);
  assert.deepEqual(ticketIn(db, "AP-26").dependsOn, []);
  assert.equal(ticketIn(db, "AP-26").epicKey, undefined);
});

test("images: image types only, metadata stored, removable", () => {
  const img = { id: "f1", name: "mock.webp", type: "image/webp", size: 120_000, width: 1280, height: 800 };
  const db = A.addAttachment(db0, sara, "AP-26", img);
  assert.deepEqual(ticketIn(db, "AP-26").attachments!.map((a) => [a.id, a.addedBy]), [["f1", "u-sara"]]);
  assert.throws(() => A.addAttachment(db0, sara, "AP-26", { ...img, type: "application/pdf" }), A.ValidationError);
  assert.throws(() => A.addAttachment(db0, faraz, "AP-26", img), A.AccessError);
  assert.deepEqual(ticketIn(A.removeAttachment(db, sara, "AP-26", "f1"), "AP-26").attachments, []);
});

test("saved descriptions from before become the first template section", () => {
  const old = seedDb();
  old.tickets = old.tickets.map((t) => (t.key === "AP-33" ? { ...t, sections: undefined, description: "Old text" } as typeof t : t));
  const t = withSystemLists(old).tickets.find((x) => x.key === "AP-33")!;
  assert.equal(t.sections!.summary, "Old text"); // AP-33 is a bug → Summary
  assert.equal("description" in t, false);
});

