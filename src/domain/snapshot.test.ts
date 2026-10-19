import { test } from "node:test";
import assert from "node:assert/strict";
import { demoDb } from "../data/demo.ts";
import { inviteMembers } from "./commands/org.ts";
import { isOnProduct } from "./permissions.ts";
import { snapshotFor } from "./snapshot.ts";

const SECRET = "ab".repeat(32);
const base = demoDb();
const admin = base.people.find((p) => p.id === "u-tayyab")!;
const db = inviteMembers(base, admin, [{ email: "new@tensorfold.example", panel: "developer", tokenHash: SECRET }]);
const dev = db.people.find((p) => p.id === "u-sara")!;

test("nobody's copy contains an invite link's secret", () => {
  for (const me of [admin, dev]) assert.ok(!JSON.stringify(snapshotFor(db, me)).includes(SECRET), me.id);
});

test("an admin sees the whole company, pending invites included", () => {
  const view = snapshotFor(db, admin);
  assert.equal(view.products.length, db.products.length);
  assert.equal(view.tickets.length, db.tickets.length);
  assert.deepEqual(view.invites.map((i) => i.email), ["new@tensorfold.example"]);
  assert.ok(view.people.every((p) => p.email));
});

test("a developer sees only their products and what hangs off them", () => {
  const view = snapshotFor(db, dev);
  assert.ok(view.products.length > 0 && view.products.length < db.products.length, "fixture: Sara is on some products, not all");
  assert.ok(view.products.every((p) => isOnProduct(dev.id, p)));
  const keys = new Set(view.products.map((p) => p.key));
  const tickets = new Set(view.tickets.map((t) => t.key));
  assert.ok(view.tickets.every((t) => keys.has(t.productKey)));
  assert.ok(Object.keys(view.statusesByProduct).every((k) => keys.has(k)));
  for (const list of [view.docs, view.decisions, view.milestones, view.requirements, view.stageRequests]) {
    assert.ok(list.every((x) => keys.has(x.productKey)));
  }
  assert.ok([...view.comments, ...view.activity].every((x) => tickets.has(x.ticketKey)));
  assert.equal(view.invites.length, 0);
});

test("a developer gets everyone's name but only their own email and notifications", () => {
  const view = snapshotFor(db, dev);
  assert.equal(view.people.length, db.people.length);
  assert.deepEqual(view.people.filter((p) => p.email).map((p) => p.id), [dev.id]);
  assert.ok(view.notifications.every((n) => n.personId === dev.id));
});

test("a personal product reaches only its owner and the people they add — never an admin who isn't on it", async () => {
  const { createProduct } = await import("./commands/products.ts");
  const withSide = createProduct(db, dev, { key: "SIDE", name: "Side quest", type: "internal", pmId: "", projectManagerId: "", personal: true });
  assert.ok(snapshotFor(withSide, dev).products.some((p) => p.key === "SIDE"));
  const adminView = snapshotFor(withSide, admin);
  assert.ok(!adminView.products.some((p) => p.key === "SIDE"));
  assert.ok(!adminView.statusesByProduct.SIDE);
});
