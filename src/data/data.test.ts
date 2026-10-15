import { test } from "node:test";
import assert from "node:assert/strict";
import { SEED_TODAY } from "../domain/seed.ts";
import { demoDb } from "./demo.ts";
import { normalize, type Db } from "./db.ts";
import { hashPassword, passwordStrength, verifyPassword } from "./passwords.ts";

test("passwords: salted hash verifies the right password only; never stored in plain text", async () => {
  const cred = await hashPassword("correct horse battery", 1_000);
  assert.match(cred.hash, /^1000:/);
  assert.ok(!cred.hash.includes("correct"));
  const stored = { passwordHash: cred.hash, passwordSalt: cred.salt };
  assert.equal(await verifyPassword("correct horse battery", stored), true);
  assert.equal(await verifyPassword("wrong", stored), false);
  const again = await hashPassword("correct horse battery", 1_000);
  assert.notEqual(again.hash, cred.hash); // fresh salt every time
  assert.equal(await verifyPassword("x", { passwordHash: "garbage", passwordSalt: "" }), false);
});

test("password strength", () => {
  assert.equal(passwordStrength("").score, 0);
  assert.equal(passwordStrength("aaaaaaaaaaaa").score, 0);
  assert.ok(passwordStrength("short1!").score < 2);
  assert.ok(passwordStrength("Correct-Horse-Battery-9").score >= 3);
});

test("the demo moves its dates to today, keeping the gaps between them", () => {
  const base = demoDb();
  const moved = demoDb(undefined, "2026-10-15");
  const due = (db: Db) => db.tickets.find((t) => t.key === "AP-12")!.due!;
  assert.equal(due(base), "2026-10-02"); // a day after SEED_TODAY
  assert.equal(due(moved), "2026-10-16");
  assert.equal(base.org.createdAt, "2026-01-05");
  assert.equal(moved.activity[0].at.slice(10), base.activity[0].at.slice(10)); // times of day stay put
  assert.equal(SEED_TODAY, "2026-10-01");
});

test("normalize keeps Epic + Backlog first and fills missing collections", () => {
  const db = demoDb();
  const broken = { ...db, invites: undefined, docs: undefined, statusesByProduct: { ...db.statusesByProduct, AP: db.statusesByProduct.AP.slice(2) } } as unknown as Db;
  const fixed = normalize(broken);
  assert.deepEqual(fixed.statusesByProduct.AP.slice(0, 2).map((s) => s.system), ["epic", "backlog"]);
  assert.deepEqual([fixed.invites, fixed.docs], [[], []]);
});
