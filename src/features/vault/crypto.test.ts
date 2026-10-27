import { test } from "node:test";
import assert from "node:assert/strict";
import * as V from "./crypto.ts";

const FAST = 1_000; // tests use few PBKDF2 rounds; the app uses V.PBKDF2_ROUNDS (600,000)
const CODE = V.newRecoveryCode();

test("set up, then unlock with the right master password only", async () => {
  const { account } = await V.createAccount("correct horse battery", CODE, FAST);
  assert.equal(account.iterations, FAST);
  assert.ok(account.publicKey && account.wrappedPrivateKey && account.salt && account.iv);
  assert.ok(!JSON.stringify(account).includes("correct horse")); // nothing plain is stored
  const key = await V.unlockAccount(account, "correct horse battery");
  assert.equal(key.type, "private");
  await assert.rejects(() => V.unlockAccount(account, "wrong password"), V.WrongPasswordError);
});

test("items round-trip and the stored blob reveals nothing", async () => {
  const vaultKey = await V.newVaultKey();
  const item = { title: "Staging DB", website: "https://db.example.com", username: "admin", password: "s3cret-Pa55", notes: "rotate monthly" };
  const sealed = await V.sealItem(vaultKey, item);
  for (const v of Object.values(item)) assert.ok(!JSON.stringify(sealed).includes(v), v);
  assert.deepEqual(await V.openItem(vaultKey, sealed), item);
  const again = await V.sealItem(vaultKey, item);
  assert.notEqual(again.ciphertext, sealed.ciphertext); // fresh IV every time
});

test("a shared vault: a second member opens items with their own key", async () => {
  const alice = await V.createAccount("alice master pw", CODE, FAST);
  const bob = await V.createAccount("bob master pw", CODE, FAST);
  const vaultKey = await V.newVaultKey();
  const forAlice = await V.grantVaultKey(vaultKey, alice.account.publicKey);
  const sealed = await V.sealItem(vaultKey, { title: "AWS", website: "", username: "root", password: "pw", notes: "" });
  // Alice unlocks, then shares with Bob using only Bob's public key
  const aliceKey = await V.openVaultKey(forAlice, await V.unlockAccount(alice.account, "alice master pw"));
  const forBob = await V.grantVaultKey(aliceKey, bob.account.publicKey);
  const bobKey = await V.openVaultKey(forBob, await V.unlockAccount(bob.account, "bob master pw"));
  assert.equal((await V.openItem(bobKey, sealed)).password, "pw");
});

test("tampered ciphertext is rejected", async () => {
  const k = await V.newVaultKey();
  const sealed = await V.sealItem(k, { title: "x", website: "", username: "", password: "y", notes: "" });
  const bytes = Buffer.from(sealed.ciphertext, "base64");
  bytes[0] ^= 1;
  await assert.rejects(() => V.openItem(k, { ...sealed, ciphertext: bytes.toString("base64") }));
});

test("password generator: length, character sets, no repeats across calls", () => {
  const a = V.generatePassword(20);
  assert.equal(a.length, 20);
  assert.match(a, /[a-z]/); assert.match(a, /[A-Z]/); assert.match(a, /[0-9]/); assert.match(a, /[^A-Za-z0-9]/);
  assert.notEqual(a, V.generatePassword(20));
});

test("strength score", () => {
  assert.ok(V.passwordStrength("abc") < 2);
  assert.ok(V.passwordStrength("correct-horse-battery-staple-42") >= 3);
});

test("generator options: length range and character sets can be turned off", () => {
  const plain = V.generatePassword(32, { numbers: false, symbols: false });
  assert.equal(plain.length, 32);
  assert.match(plain, /^[A-Za-z]+$/);
  const noSym = V.generatePassword(12, { symbols: false });
  assert.match(noSym, /[0-9]/);
  assert.doesNotMatch(noSym, /[^A-Za-z0-9]/);
  assert.equal(V.generatePassword(3).length, 8); // clamped to a sensible minimum
  assert.equal(V.generatePassword(500).length, 100);
});

test("memorable passwords: random words from the list, joined your way; PINs: digits only", async () => {
  const { WORDS } = await import("./words.ts");
  assert.ok(WORDS.length >= 1000 && WORDS.every((w) => /^[a-z]{3,8}$/.test(w)));
  const four = V.generateMemorable(4);
  assert.match(four, /^([A-Z][a-z]+-){3}[A-Z][a-z]+$/);
  assert.ok(four.split("-").every((w) => WORDS.includes(w.toLowerCase())));
  assert.match(V.generateMemorable(3, { separator: " ", capitalize: false }), /^[a-z]+ [a-z]+ [a-z]+$/);
  assert.match(V.generateMemorable(5, { separator: "digits" }), /^[A-Z][a-z]+(\d[A-Z][a-z]+){4}$/);
  assert.equal(V.generateMemorable(1).split("-").length, 3); // clamped, 3–10 words
  assert.equal(V.generateMemorable(50).split("-").length, 10);
  assert.notEqual(V.generateMemorable(6), V.generateMemorable(6));
  assert.match(V.generatePin(6), /^\d{6}$/);
  assert.equal(V.generatePin(1).length, 4);
  assert.equal(V.generatePin(99).length, 12);
});

test("brands: logo suggested from a website, including sub-domains", async () => {
  const B = await import("./brands.ts");
  assert.equal(B.brandForUrl("https://github.com/acme")?.title, "GitHub");
  assert.equal(B.brandForUrl("console.aws.amazon.com")?.slug, "aws");
  assert.equal(B.brandForUrl("https://platform.openai.com/api-keys")?.title, "OpenAI");
  assert.equal(B.brandForUrl("claude.ai")?.title, "Anthropic");
  assert.equal(B.brandForUrl("https://example.com"), undefined);
  assert.equal(B.brandForUrl("not a url"), undefined);
  assert.ok(B.BRANDS.length >= 80);
  assert.equal(new Set(B.BRANDS.map((b) => b.slug)).size, B.BRANDS.length); // no duplicates
  assert.equal(B.inkFor("FFFC00"), "#000"); // Snapchat yellow → dark logo
});

test("the recovery code: unmistakable, and it opens the vault when the master password is forgotten", async () => {
  assert.match(CODE, /^[A-HJKMNP-Z2-9]{4}(-[A-HJKMNP-Z2-9]{4}){5}$/); // six groups of four, no 0 O 1 I L
  assert.notEqual(V.newRecoveryCode(), CODE);
  const { account } = await V.createAccount("old master pw", CODE, FAST);
  const key = await V.newVaultKey();
  const wrapped = await V.grantVaultKey(key, account.publicKey);
  // forgot it: the recovery code (typed loosely — lower case, spaces) and a new master password
  const { wrap } = await V.newMasterPassword(account, { recoveryCode: CODE.toLowerCase().replace(/-/g, " ") }, "brand new master pw", FAST);
  const after = { ...account, ...wrap };
  await assert.rejects(() => V.unlockAccount(after, "old master pw"), V.WrongPasswordError); // the old one no longer works
  const opened = await V.openVaultKey(wrapped, await V.unlockAccount(after, "brand new master pw"));
  const sealed = await V.sealItem(key, { title: "Stripe", website: "", username: "", password: "s3cret", notes: "" });
  assert.equal((await V.openItem(opened, sealed)).password, "s3cret"); // everything still opens: same private key
  await assert.rejects(() => V.newMasterPassword(account, { recoveryCode: V.newRecoveryCode() }, "x", FAST), V.WrongRecoveryCodeError);
  await assert.rejects(() => V.newMasterPassword(account, { password: "not it" }, "x", FAST), V.WrongPasswordError);
  const changed = await V.newMasterPassword(account, { password: "old master pw" }, "changed pw", FAST); // changing it, knowing it
  await V.unlockAccount({ ...account, ...changed.wrap }, "changed pw");
});
