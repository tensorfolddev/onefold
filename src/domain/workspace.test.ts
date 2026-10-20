import { test } from "node:test";
import assert from "node:assert/strict";
import { demoDb } from "../data/demo.ts";
import { createProduct } from "./commands/products.ts";
import { workspaceOfPath, workspaceView } from "./workspace.ts";

const base = demoDb();
const sara = base.people.find((p) => p.id === "u-sara")!;
const db = createProduct(base, sara, { key: "SIDE", name: "Side quest", type: "internal", pmId: "", projectManagerId: "", personal: true });
const company = base.products[0];

test("in your own workspace nothing of the company's shows; in the company's, nothing personal", () => {
  const mine = workspaceView(db, "personal");
  assert.deepEqual(mine.products.map((p) => p.key), ["SIDE"]);
  assert.ok(mine.tickets.every((t) => t.productKey === "SIDE"));
  assert.ok(mine.docs.every((d) => d.ownerId || d.productKey === "SIDE"));
  const theirs = workspaceView(db, "company");
  assert.ok(!theirs.products.some((p) => p.key === "SIDE"));
  assert.ok(theirs.docs.every((d) => !d.ownerId));
  assert.equal(mine.notifications, db.notifications); // the bell keeps everything of yours
});

test("a page of one workspace opens in it; a page of either keeps the one picked", () => {
  assert.equal(workspaceOfPath(db, "/products/SIDE/tickets"), "personal");
  assert.equal(workspaceOfPath(db, `/products/${company.key}`), "company");
  assert.equal(workspaceOfPath(db, "/docs/mine"), "personal");
  assert.equal(workspaceOfPath(db, "/docs"), "company");
  assert.equal(workspaceOfPath(db, "/settings"), "company");
  assert.equal(workspaceOfPath(db, "/integrations/email"), "company");
  for (const either of ["", "/products", "/my-work", "/integrations", "/integrations/claude"]) assert.equal(workspaceOfPath(db, either), null, either);
});
