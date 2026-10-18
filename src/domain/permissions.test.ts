import { test } from "node:test";
import assert from "node:assert/strict";
import { can, visibleProducts } from "./permissions.ts";
import { demoDb } from "../data/demo.ts";

const db = demoDb();
const p = (id: string) => db.people.find((x) => x.id === id)!;
const prod = (k: string) => db.products.find((x) => x.key === k)!;
const [admin, pm, lead, sara, faraz] = ["u-tayyab", "u-hina", "u-ayesha", "u-sara", "u-faraz"].map(p);

test("developer sees only member products", () => {
  assert.deepEqual(visibleProducts(sara, db.products).map((x) => x.key), ["AP", "OF"]);
  assert.deepEqual(visibleProducts(faraz, db.products).map((x) => x.key), ["NV"]);
  assert.equal(visibleProducts(admin, db.products).length, 4);
});

test("developer creates and edits tickets only on own products, and never archives or deletes them", () => {
  for (const a of ["ticket.create", "ticket.edit"] as const) {
    assert.equal(can(sara, a, { product: prod("AP") }), true, a);
    assert.equal(can(sara, a, { product: prod("NV") }), false, a);
  }
  for (const a of ["ticket.archive", "ticket.delete"] as const) assert.equal(can(sara, a, { product: prod("AP") }), false, a);
});

test("developer never manages anything", () => {
  for (const a of ["product.edit", "org.manage", "members.edit", "decision.add", "milestone.edit", "doc.add",
    "people.manage", "teams.manage", "product.create"] as const) {
    assert.equal(can(sara, a, { product: prod("AP"), person: p("u-daniyal") }), false, a);
  }
  assert.equal(can(sara, "doc.addMeetingNotes", { product: prod("AP") }), true);
});

test("manager: full on own products, nothing on others, no admin tools", () => {
  assert.equal(can(lead, "ticket.create", { product: prod("AP") }), true);
  assert.equal(can(lead, "product.view", { product: prod("NV") }), false);
  assert.equal(can(pm, "product.requestStage", { product: prod("OR") }), true);
  assert.equal(can(pm, "product.approveStage", { product: prod("OR") }), false);
  for (const a of ["people.manage", "teams.manage", "product.create", "product.edit"] as const) {
    assert.equal(can(pm, a, { product: prod("AP") }), false, a);
  }
});

test("manager may add/remove developers only", () => {
  assert.equal(can(lead, "members.edit", { product: prod("AP"), person: p("u-faraz") }), true);
  assert.equal(can(lead, "members.edit", { product: prod("AP"), person: p("u-usman") }), false);
  assert.equal(can(admin, "members.edit", { product: prod("AP"), person: p("u-usman") }), true);
});

test("inactive or panel-less people can do nothing", () => {
  assert.equal(can({ ...admin, active: false }, "product.view", { product: prod("AP") }), false);
  assert.equal(can(p("u-client-acme"), "product.view", { product: prod("AP") }), false);
  assert.equal(can(undefined, "product.view", { product: prod("AP") }), false);
});

test("anyone who works on a product can manage its lists", () => {
  assert.equal(can(sara, "statuses.edit", { product: prod("AP") }), true);
  assert.equal(can(lead, "statuses.edit", { product: prod("AP") }), true);
  assert.equal(can(sara, "statuses.edit", { product: prod("NV") }), false);
});

test("product icon: admins and the product's managers, not developers", () => {
  assert.equal(can(admin, "product.brand", { product: prod("NV") }), true);
  assert.equal(can(lead, "product.brand", { product: prod("AP") }), true);
  assert.equal(can(lead, "product.brand", { product: prod("NV") }), false);
  assert.equal(can(sara, "product.brand", { product: prod("AP") }), false);
});
