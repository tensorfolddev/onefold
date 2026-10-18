// Where sign-in sends you back to (?next=): your own panel, the short links from WhatsApp, never anywhere else.
import { test } from "node:test";
import assert from "node:assert/strict";
import { safeNext } from "./session.ts";

test("?next= keeps you inside your own panel, opens short links there, and refuses anything else", () => {
  assert.equal(safeNext("/dev/products/AP", "developer"), "/dev/products/AP");
  assert.equal(safeNext("/t/AP-12", "developer"), "/dev/t/AP-12"); // a WhatsApp brief's link
  assert.equal(safeNext("/my-work", "manager"), "/manager/my-work");
  assert.equal(safeNext("/admin/people", "developer"), "/dev"); // another panel
  assert.equal(safeNext("//evil.example", "admin"), "/admin");
  assert.equal(safeNext("/t/AP-12/../../signup", "admin"), "/admin");
  assert.equal(safeNext(null, "admin"), "/admin");
});
