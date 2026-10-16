// Archived projects: who may archive, restore and delete them; that an archived project is read-only and that
// developers never see it, or anything in it; and who may manage groups and move projects between them.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fixClock } from "../clock.ts";
import { SEED_TODAY } from "../seed.ts";
import { demoDb } from "../../data/demo.ts";
import { archivedProducts, can, visibleProducts } from "../permissions.ts";
import { bookedH } from "../selectors/dashboard.ts";
import { groupMyWork } from "../selectors/mywork.ts";
import { isOpenTicket } from "../selectors/product.ts";
import { snapshotFor, withoutArchived } from "../snapshot.ts";
import { AccessError, ValidationError } from "./shared.ts";
import * as products from "./products.ts";
import * as template from "./template.ts";
import * as tickets from "./tickets.ts";

fixClock(`${SEED_TODAY}T10:00:00`);
const A = { ...products, ...template, ...tickets };
const db0 = demoDb();
const who = (id: string) => db0.people.find((p) => p.id === id)!;
// Ayesha manages AP (Acme Portal); Maryam is a manager too, but not on AP. Sara develops on AP and OF.
const admin = who("u-tayyab"), ayesha = who("u-ayesha"), maryam = who("u-maryam"), sara = who("u-sara");
const ap = (db: typeof db0) => db.products.find((p) => p.key === "AP");
const archived = A.archiveProduct(db0, ayesha, "AP");

test("an admin or the project's own manager archives and restores it; developers and other managers can't", () => {
  assert.ok(ap(archived)!.archivedAt?.startsWith(SEED_TODAY));
  assert.equal(ap(archived)!.archivedBy, "u-ayesha");
  assert.throws(() => A.archiveProduct(db0, sara, "AP"), AccessError);
  assert.throws(() => A.archiveProduct(db0, maryam, "AP"), AccessError);
  assert.throws(() => A.archiveProduct(archived, admin, "AP"), /already archived/);

  const back = A.restoreProduct(archived, admin, "AP");
  assert.deepEqual(ap(back), ap(db0)); // exactly as it was — group, members and all
  assert.throws(() => A.restoreProduct(archived, sara, "AP"), AccessError);
  assert.throws(() => A.restoreProduct(db0, admin, "AP"), /isn't archived/);
});

test("an archived project is read-only until it's restored — for admins too", () => {
  const restoreFirst = /Acme Portal is archived — restore it first/;
  assert.throws(() => A.createTicket(archived, admin, "AP", "New"), restoreFirst);
  assert.throws(() => A.updateTicket(archived, ayesha, "AP-1", { title: "Renamed" }), restoreFirst);
  assert.throws(() => A.addComment(archived, admin, "AP-1", "Hello"), restoreFirst);
  assert.throws(() => A.setSection(archived, admin, "AP-1", "goal", "New goal"), restoreFirst);
  assert.throws(() => A.updateProduct(archived, admin, "AP", { name: "New name" }), restoreFirst);
  assert.throws(() => A.setMember(archived, admin, "AP", "u-faraz", true), restoreFirst);
  assert.throws(() => A.moveProduct(archived, admin, "AP", "grp-internal"), restoreFirst);
  assert.throws(() => A.createTicket(archived, sara, "AP", "New"), AccessError); // developers aren't told it exists
  assert.throws(() => A.setMember(archived, maryam, "AP", "u-faraz", true), AccessError); // nor a manager not on it
  assert.equal(can(admin, "ticket.edit", { product: ap(archived) }), false);
  assert.equal(can(admin, "product.view", { product: ap(archived) }), true);
  assert.equal(can(sara, "product.view", { product: ap(archived) }), false);
  A.createTicket(archived, sara, "OF", "Other projects carry on"); // no error
});

test("developers never see an archived project or anything in it; admins and its managers still can", () => {
  const dev = snapshotFor(archived, sara);
  assert.equal(ap(dev), undefined);
  assert.equal(dev.tickets.filter((t) => t.productKey === "AP").length, 0);
  assert.equal(dev.statusesByProduct.AP, undefined);
  assert.ok(dev.products.some((p) => p.key === "OF"));
  assert.ok(!dev.notifications.some((n) => n.target === "AP" || n.target.startsWith("AP-")));
  assert.ok(snapshotFor(db0, sara).notifications.some((n) => n.target.startsWith("AP-"))); // (she has some)

  const manager = snapshotFor(archived, ayesha);
  assert.ok(ap(manager)?.archivedAt);
  assert.ok(manager.tickets.some((t) => t.productKey === "AP"));

  // Lists of projects leave it out; it's only under Archived, for those who may open it.
  assert.ok(!visibleProducts(ayesha, archived.products).some((p) => p.key === "AP"));
  assert.deepEqual(archivedProducts(ayesha, archived.products).map((p) => p.key), ["AP"]);
  assert.deepEqual(archivedProducts(admin, archived.products).map((p) => p.key), ["AP"]);
  assert.deepEqual(archivedProducts(maryam, archived.products), []);
  assert.deepEqual(archivedProducts(sara, archived.products), []);

  // Nobody's day's work includes it: not My Work, not the brief, not their booked hours.
  assert.ok(!withoutArchived(archived).tickets.some((t) => t.productKey === "AP"));
  const mine = groupMyWork(archived, "u-sara", archived.tickets).flatMap((g) => g.tickets);
  assert.ok(mine.length > 0 && !mine.some((t) => t.productKey === "AP"));
  const apHours = db0.tickets.filter((t) => t.productKey === "AP" && t.assigneeId === "u-sara" && t.type !== "epic" && isOpenTicket(db0, t))
    .reduce((s, t) => s + t.estimateH, 0);
  assert.ok(apHours > 0);
  assert.equal(bookedH(archived, "u-sara"), bookedH(db0, "u-sara") - apHours);

  // Nothing new may wait on an archived ticket.
  const ofTicket = db0.tickets.find((t) => t.productKey === "OF" && t.type !== "epic")!.key;
  assert.throws(() => A.addDependency(archived, admin, ofTicket, "AP-1"), /AP-1 is in Acme Portal, which is archived/);
});

test("only an admin deletes a project, only once it's archived, and only by typing Delete and its name", () => {
  assert.throws(() => A.deleteProduct(db0, admin, "AP", "Delete Acme Portal"), /Archive Acme Portal before deleting it/);
  assert.throws(() => A.deleteProduct(archived, ayesha, "AP", "Delete Acme Portal"), AccessError);
  assert.throws(() => A.deleteProduct(archived, admin, "AP", "delete it"), /Type "Delete Acme Portal"/);

  const apTickets = new Set(db0.tickets.filter((t) => t.productKey === "AP").map((t) => t.key));
  const gone = A.deleteProduct(archived, admin, "AP", "  Delete Acme Portal ");
  assert.equal(ap(gone), undefined);
  assert.equal(gone.statusesByProduct.AP, undefined);
  assert.equal(gone.tickets.filter((t) => apTickets.has(t.key)).length, 0);
  assert.ok(!gone.tickets.some((t) => t.dependsOn?.some((k) => apTickets.has(k))));
  assert.ok(!gone.comments.some((c) => apTickets.has(c.ticketKey)) && !gone.activity.some((a) => apTickets.has(a.ticketKey)));
  assert.ok(!gone.notifications.some((n) => n.target === "AP" || apTickets.has(n.target)));
  for (const list of [gone.requirements, gone.decisions, gone.milestones, gone.docs, gone.stageRequests]) {
    assert.ok(!list.some((x) => x.productKey === "AP"));
  }
  assert.equal(gone.products.length, db0.products.length - 1);
  assert.equal(gone.tickets.length, db0.tickets.length - apTickets.size);
});

test("admins and managers manage groups and move their own projects between them; developers can't", () => {
  const db = A.addGroup(db0, ayesha, "Retainers", "grp-ret");
  assert.ok(db.productGroups.some((g) => g.id === "grp-ret"));
  assert.throws(() => A.addGroup(db0, sara, "Mine"), AccessError);
  assert.equal(A.renameGroup(db, ayesha, "grp-ret", "Retainer work").productGroups.find((g) => g.id === "grp-ret")!.name, "Retainer work");
  assert.throws(() => A.renameGroup(db, sara, "grp-ret", "x"), AccessError);

  const moved = A.moveProduct(db, ayesha, "AP", "grp-ret");
  assert.equal(ap(moved)!.groupId, "grp-ret");
  assert.equal(ap(A.moveProduct(moved, admin, "AP", undefined))!.groupId, undefined); // out of any group
  assert.equal(ap(A.moveProduct(moved, admin, "AP", null))!.groupId, undefined); // (as it arrives from a browser)
  assert.throws(() => A.moveProduct(db, maryam, "AP", "grp-ret"), AccessError); // not her project
  assert.throws(() => A.moveProduct(db, sara, "AP", "grp-ret"), AccessError);
  assert.throws(() => A.moveProduct(db, admin, "AP", "grp-nope"), ValidationError);

  assert.equal(ap(A.deleteGroup(moved, ayesha, "grp-ret"))!.groupId, undefined); // its projects stay, ungrouped
  assert.throws(() => A.deleteGroup(moved, sara, "grp-ret"), AccessError);
});
