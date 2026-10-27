// The vault, store side: ciphertext only (the crypto is tested in features/vault/crypto.test.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { demoDb } from "../data/demo.ts";
import { clientViewFor } from "./clientView.ts";
import { AccessError, ValidationError } from "./commands/shared.ts";
import {
  cancelVaultInvite, deleteVaultItem, grantVault, inviteToVault, rekeyVault, resetVault, rewrapVault, setupVault, shareItems, upsertVaultItem,
  VAULT_COMMANDS,
} from "./commands/vault.ts";
import { snapshotFor } from "./snapshot.ts";

const db0 = demoDb();
const who = (id: string) => db0.people.find((p) => p.id === id)!;
const sara = who("u-sara"), faraz = who("u-faraz");
const acct = {
  salt: "c2FsdA==", iterations: 600_000, iv: "aXY=", wrappedPrivateKey: "d3JhcA==", publicKey: "cHVi",
  recoverySalt: "cnNhbHQ=", recoveryIv: "cml2", recoveryWrappedPrivateKey: "cndyYXA=",
};
const share = (vaultId: string, itemId: string, keys: Record<string, string>, invited: string[] = []) =>
  ({ vaultId, item: { id: itemId, iv: "aXY=", ciphertext: "c2VhbGVk" }, keys, invited });

test("vault: set up once, personal vault only you hold; a weak or broken account is refused", () => {
  const db = setupVault(db0, sara, acct, "v-sara", "a2V5");
  assert.deepEqual(db.vaultAccounts["u-sara"], acct);
  const v = db.vaults.find((x) => x.id === "v-sara")!;
  assert.deepEqual([v.kind, v.ownerId, Object.keys(v.keys)], ["personal", "u-sara", ["u-sara"]]);
  assert.throws(() => setupVault(db, sara, acct, "v2", "k"), ValidationError); // already set up
  assert.throws(() => grantVault(db, sara, "v-sara", "u-daniyal", "k"), ValidationError); // personal isn't shared
  assert.throws(() => setupVault(db0, sara, { ...acct, iterations: 1000 }, "v-sara", "k"), ValidationError); // too few rounds
  assert.throws(() => setupVault(db0, sara, { ...acct, recoveryWrappedPrivateKey: "" }, "v-sara", "k"), ValidationError); // no recovery code
  assert.throws(() => setupVault(db0, sara, { ...acct, wrappedPrivateKey: "<script>" }, "v-sara", "k"), ValidationError); // not a blob
});

test("vault: a new master password replaces only the password lock — the recovery lock and public key stay", () => {
  const db = setupVault(db0, sara, acct, "v-sara", "k");
  const wrap = { salt: "bmV3", iterations: 600_000, iv: "bml2", wrappedPrivateKey: "bmV3d3JhcA==" };
  assert.deepEqual(rewrapVault(db, sara, wrap).vaultAccounts["u-sara"], { ...acct, ...wrap });
  assert.throws(() => rewrapVault(db0, sara, wrap), /Set up your vault first/);
  assert.throws(() => rewrapVault(db, sara, { ...wrap, iterations: 10 }), ValidationError);
});

test("vault sharing: personal items move to Shared, each with its own people (not tied to a product)", () => {
  let db = setupVault(db0, sara, acct, "v-sara", "k");
  db = setupVault(db, faraz, acct, "v-faraz", "k"); // Faraz isn't on any of Sara's products — still fine
  db = upsertVaultItem(db, sara, { id: "p1", vaultId: "v-sara", iv: "a", ciphertext: "b" });
  db = upsertVaultItem(db, sara, { id: "p2", vaultId: "v-sara", iv: "a", ciphertext: "b" });
  db = shareItems(db, sara, [share("s1", "x1", { "u-sara": "k1", "u-faraz": "k1f" }, ["u-zain"]), share("s2", "x2", { "u-sara": "k2" }, ["u-zain"])], ["p1", "p2"]);
  assert.deepEqual(db.vaultItems.filter((i) => i.vaultId === "v-sara"), []); // moved out of Personal
  const s1 = db.vaults.find((v) => v.id === "s1")!;
  assert.deepEqual([s1.kind, s1.createdBy, Object.keys(s1.keys).sort(), s1.invited], ["shared", "u-sara", ["u-faraz", "u-sara"], ["u-zain"]]);
  assert.equal(db.vaultItems.find((i) => i.id === "x1")!.vaultId, "s1");
  assert.throws(() => shareItems(db, sara, [share("s3", "x3", { "u-faraz": "k" })], []), ValidationError); // must keep yourself
  assert.throws(() => shareItems(setupVault(db0, sara, acct, "v-sara", "k"), sara, [share("s3", "x3", { "u-sara": "k", "u-daniyal": "k" })], []), ValidationError); // Daniyal has no vault → invite instead
});

test("vault sharing: only the owner adds/removes people; invites complete for anyone holding it", () => {
  let db = setupVault(db0, sara, acct, "v-sara", "k");
  db = setupVault(db, faraz, acct, "v-faraz", "k");
  db = shareItems(db, sara, [share("s1", "x1", { "u-sara": "k", "u-faraz": "kf" })], []);
  db = setupVault(db, who("u-zain"), acct, "v-zain", "k");
  assert.throws(() => grantVault(db, faraz, "s1", "u-zain", "k"), AccessError); // not the owner, not invited
  db = inviteToVault(db, sara, "s1", "u-daniyal");
  assert.throws(() => inviteToVault(db, faraz, "s1", "u-zain"), AccessError);
  db = setupVault(db, who("u-daniyal"), acct, "v-dan", "k");
  db = grantVault(db, faraz, "s1", "u-daniyal", "kd"); // invited by the owner → any holder may finish it
  db = grantVault(db, sara, "s1", "u-zain", "kz");
  assert.deepEqual(Object.keys(db.vaults.find((v) => v.id === "s1")!.keys).sort(), ["u-daniyal", "u-faraz", "u-sara", "u-zain"]);
  // remove Faraz → re-key; only the owner; owner must keep access
  db = rekeyVault(db, sara, "s1", { "u-sara": "n", "u-daniyal": "n", "u-zain": "n" }, [{ id: "x1", iv: "bml2", ciphertext: "bmN0" }]);
  assert.equal(db.vaults.find((v) => v.id === "s1")!.keys["u-faraz"], undefined);
  assert.throws(() => rekeyVault(db, who("u-zain"), "s1", { "u-zain": "n" }, [{ id: "x1", iv: "a", ciphertext: "b" }]), AccessError);
  assert.throws(() => rekeyVault(db, sara, "s1", { "u-zain": "n" }, [{ id: "x1", iv: "a", ciphertext: "b" }]), ValidationError);
  assert.deepEqual(cancelVaultInvite(inviteToVault(db, sara, "s1", "u-usman"), sara, "s1", "u-usman").vaults.find((v) => v.id === "s1")!.invited, []);
});

test("vault sharing: everyone with access can edit; only the owner deletes a shared password", () => {
  let db = setupVault(db0, sara, acct, "v-sara", "k");
  db = setupVault(db, faraz, acct, "v-faraz", "k");
  db = shareItems(db, sara, [share("s1", "x1", { "u-sara": "k", "u-faraz": "kf" })], []);
  db = upsertVaultItem(db, faraz, { id: "x1", vaultId: "s1", iv: "bmV3", ciphertext: "ZWRpdA==" });
  assert.equal(db.vaultItems.find((i) => i.id === "x1")!.updatedBy, "u-faraz");
  assert.throws(() => deleteVaultItem(db, faraz, "x1"), AccessError);
  assert.equal(deleteVaultItem(db, sara, "x1").vaults.some((v) => v.id === "s1"), false); // a shared password is its own little vault
  assert.throws(() => upsertVaultItem(db, who("u-zain"), { id: "x9", vaultId: "s1", iv: "a", ciphertext: "b" }), AccessError);
});

test("vault: reset (lost the code too) wipes only your own access", () => {
  let db = setupVault(db0, sara, acct, "v-sara", "k");
  db = setupVault(db, faraz, acct, "v-faraz", "k");
  db = upsertVaultItem(db, sara, { id: "p1", vaultId: "v-sara", iv: "a", ciphertext: "b" });
  db = shareItems(db, faraz, [share("s1", "x1", { "u-faraz": "k", "u-sara": "ks" })], []);
  assert.throws(() => resetVault(db, sara, "yes"), /Type "delete my vault"/); // only when they typed it out
  db = resetVault(db, sara, " Delete my vault ");
  assert.equal(db.vaultAccounts["u-sara"], undefined);
  assert.equal(db.vaultItems.some((i) => i.id === "p1"), false);
  assert.equal(db.vaults.find((v) => v.id === "s1")!.keys["u-sara"], undefined);
  assert.ok(db.vaults.find((v) => v.id === "s1")!.keys["u-faraz"]);
});

test("vault privacy: each browser gets its own locks; others' only their public key; items only from vaults it holds", () => {
  let db = setupVault(db0, sara, acct, "v-sara", "c2FyYQ==");
  db = setupVault(db, faraz, acct, "v-faraz", "ZmFyYXo=");
  db = upsertVaultItem(db, faraz, { id: "f1", vaultId: "v-faraz", iv: "aXY=", ciphertext: "ZmFyYXpvbmx5" });
  db = shareItems(db, faraz, [share("s1", "x1", { "u-faraz": "k" }, ["u-sara"])], []);
  const mine = snapshotFor(db, sara);
  assert.deepEqual(mine.vaultAccounts["u-sara"], acct);
  const theirs = mine.vaultAccounts["u-faraz"];
  assert.deepEqual([theirs.publicKey, theirs.salt, theirs.wrappedPrivateKey, theirs.recoverySalt, theirs.recoveryWrappedPrivateKey], ["cHVi", "", "", "", ""]);
  assert.deepEqual(mine.vaults.map((v) => v.id).sort(), ["s1", "v-sara"]); // invited to s1, but no key yet…
  assert.deepEqual(mine.vaultItems, []); // …so none of its items, and nothing of Faraz's own
  const admin = snapshotFor(db, who("u-tayyab")); // admins see no more than anyone
  assert.deepEqual([admin.vaults, admin.vaultItems], [[], []]);
  const clientSide = JSON.stringify(db.clientPeople.map((c) => clientViewFor(db, c.id)));
  assert.ok(!/ZmFyYXpvbmx5|vault/i.test(clientSide), "the client space never carries the vault");
});

test("vault commands keep their arguments out of the audit log", () => {
  for (const name of ["setupVault", "rewrapVault", "shareItems", "grantVault", "rekeyVault", "upsertVaultItem", "deleteVaultItem", "resetVault"]) assert.ok(VAULT_COMMANDS.has(name), name);
});
