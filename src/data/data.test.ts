import { test } from "node:test";
import assert from "node:assert/strict";
import { SEED_TODAY } from "../domain/seed.ts";
import { demoDb } from "./demo.ts";
import { normalize, type Db } from "./db.ts";
import { passwordStrength } from "./passwords.ts";

test("password strength", () => {
  assert.equal(passwordStrength("").score, 0);
  assert.equal(passwordStrength("aaaaaaaaaaaa").score, 0);
  assert.ok(passwordStrength("short1!").score < 2);
  assert.ok(passwordStrength("Correct-Horse-Battery-9").score >= 3);
});

test("the test company moves its dates, keeping the gaps between them", () => {
  const base = demoDb();
  const moved = demoDb("2026-10-15");
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

test("every command a screen can run is recorded, so the server hears of it", async () => {
  const screens = await import("./commands.ts");
  const { commands: domain } = await import("../domain/commands/index.ts");
  // Made on the server only: a doc (POST /api/docs), its save-time bookkeeping, and invites (they carry secrets).
  const serverOnly = new Set(["createDoc", "touchDoc", "setDocLink", "setDocPublic", "notifyDocMentions", "inviteMembers"]);
  for (const name of Object.keys(domain)) {
    if (!serverOnly.has(name)) assert.notEqual((screens as Record<string, unknown>)[name], (domain as Record<string, unknown>)[name], `${name} needs wrap() in data/commands.ts`);
  }
});
