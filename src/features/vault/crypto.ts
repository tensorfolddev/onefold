// Zero-knowledge vault crypto (Web Crypto only — works in every modern browser and in Node 20+), from the first 1Fold.
// Nothing in here ever stores or returns plaintext secrets for persistence: callers persist the base64 blobs.
//
//   master password ─PBKDF2-SHA256─► AES-256-GCM wrapping key (memory only)
//   recovery code   ─PBKDF2-SHA256─► a second wrapping key (the code is random, kept only by its owner)
//   RSA-OAEP-2048 key pair: public key stored in clear, private key stored only encrypted — once by each wrapping key
//   vault key (AES-256-GCM) stored once per member, encrypted with that member's public key
//   items stored as AES-GCM(vault key, JSON) with a fresh 12-byte IV

import type { VaultAccount } from "../../domain/types.ts";
import { WORDS } from "./words.ts";
export type { VaultAccount };

export const PBKDF2_ROUNDS = 600_000; // OWASP 2023 guidance for PBKDF2-HMAC-SHA256
export const RECOVERY_ROUNDS = 100_000; // the recovery code is random (~119 bits), so fewer rounds are plenty

export interface SealedItem { iv: string; ciphertext: string }

export interface VaultItemData {
  title: string;
  website: string;
  username: string;
  password: string;
  notes: string;
  icon?: string; // brand slug (see brands.ts) — stored encrypted with the rest
  color?: string; // letter-tile colour when there's no logo
}

export class WrongPasswordError extends Error {
  constructor() { super("Wrong master password"); }
}
export class WrongRecoveryCodeError extends Error {
  constructor() { super("That recovery code doesn't open this vault"); }
}

const subtle = () => globalThis.crypto.subtle;
const enc = new TextEncoder();
const dec = new TextDecoder();

const toB64 = (buf: ArrayBuffer | Uint8Array<ArrayBuffer>) => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
};
const fromB64 = (b64: string) => {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
};
const random = (n: number) => globalThis.crypto.getRandomValues(new Uint8Array(n));

const RSA = { name: "RSA-OAEP", hash: "SHA-256" } as const;

async function wrappingKey(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number) {
  const material = await subtle().importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]);
  return subtle().deriveKey(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"],
  );
}

/** The private key (pkcs8 bytes), locked with a password or a recovery code. */
async function lock(pkcs8: ArrayBuffer, secret: string, iterations: number) {
  const salt = random(16);
  const iv = random(12);
  const wrapped = await subtle().encrypt({ name: "AES-GCM", iv }, await wrappingKey(secret, salt, iterations), pkcs8);
  return { salt: toB64(salt), iv: toB64(iv), wrapped: toB64(wrapped) };
}
async function unlockBytes(secret: string, salt: string, iterations: number, iv: string, wrapped: string, wrong: () => Error): Promise<ArrayBuffer> {
  try {
    return await subtle().decrypt({ name: "AES-GCM", iv: fromB64(iv) }, await wrappingKey(secret, fromB64(salt), iterations), fromB64(wrapped));
  } catch {
    throw wrong(); // AES-GCM authentication failed
  }
}
const importPrivate = (pkcs8: ArrayBuffer) => subtle().importKey("pkcs8", pkcs8, RSA, false, ["decrypt"]);

// The recovery code: 24 characters from 31 unmistakable ones (no 0/O, 1/I/L) — about 119 bits — in six groups of four.
const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 24;
export const normalizeRecoveryCode = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, "");
export const formatRecoveryCode = (code: string) => normalizeRecoveryCode(code).replace(/(.{4})(?=.)/g, "$1-");
export function newRecoveryCode(): string {
  return formatRecoveryCode(Array.from({ length: CODE_LENGTH }, () => CODE_CHARS[randInt(CODE_CHARS.length)]).join(""));
}

/** First-time setup: a key pair whose private half is locked with the master password, and again with the recovery code. */
export async function createAccount(password: string, recoveryCode: string, iterations = PBKDF2_ROUNDS) {
  const pair = await subtle().generateKey(
    { ...RSA, modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]) }, true, ["encrypt", "decrypt"],
  );
  const pkcs8 = await subtle().exportKey("pkcs8", pair.privateKey);
  const byPassword = await lock(pkcs8, password, iterations);
  const byCode = await lock(pkcs8, normalizeRecoveryCode(recoveryCode), RECOVERY_ROUNDS);
  const spki = await subtle().exportKey("spki", pair.publicKey);
  const account: VaultAccount = {
    salt: byPassword.salt, iterations, iv: byPassword.iv, wrappedPrivateKey: byPassword.wrapped, publicKey: toB64(spki),
    recoverySalt: byCode.salt, recoveryIv: byCode.iv, recoveryWrappedPrivateKey: byCode.wrapped,
  };
  return { account, privateKey: await importPrivate(pkcs8) }; // kept in memory as a key that can't be exported
}

/**
 * A new master password for the same private key — opened with the current password, or with the recovery code
 * (forgot it). Returns the new master-password half of the account; the public key and recovery copy stay.
 */
export async function newMasterPassword(account: VaultAccount, opener: { password: string } | { recoveryCode: string }, password: string, iterations = PBKDF2_ROUNDS) {
  const pkcs8 = "password" in opener
    ? await unlockBytes(opener.password, account.salt, account.iterations, account.iv, account.wrappedPrivateKey, () => new WrongPasswordError())
    : await unlockBytes(normalizeRecoveryCode(opener.recoveryCode), account.recoverySalt, RECOVERY_ROUNDS, account.recoveryIv, account.recoveryWrappedPrivateKey, () => new WrongRecoveryCodeError());
  const byPassword = await lock(pkcs8, password, iterations);
  return { wrap: { salt: byPassword.salt, iterations, iv: byPassword.iv, wrappedPrivateKey: byPassword.wrapped }, privateKey: await importPrivate(pkcs8) };
}

/** Unlock: the private key, kept in memory only. Throws WrongPasswordError on a wrong password. */
export async function unlockAccount(account: VaultAccount, password: string): Promise<CryptoKey> {
  return importPrivate(await unlockBytes(password, account.salt, account.iterations, account.iv, account.wrappedPrivateKey, () => new WrongPasswordError()));
}

export const newVaultKey = () =>
  subtle().generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]) as Promise<CryptoKey>;

/** Give someone a vault: encrypt the vault key with their public key (no secret of theirs needed). */
export async function grantVaultKey(vaultKey: CryptoKey, publicKeyB64: string): Promise<string> {
  const pub = await subtle().importKey("spki", fromB64(publicKeyB64), RSA, false, ["encrypt"]);
  const raw = await subtle().exportKey("raw", vaultKey);
  return toB64(await subtle().encrypt(RSA, pub, raw));
}

export async function openVaultKey(wrapped: string, privateKey: CryptoKey): Promise<CryptoKey> {
  const raw = await subtle().decrypt(RSA, privateKey, fromB64(wrapped));
  return subtle().importKey("raw", raw, { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
}

export async function sealItem(vaultKey: CryptoKey, data: VaultItemData): Promise<SealedItem> {
  const iv = random(12);
  const ct = await subtle().encrypt({ name: "AES-GCM", iv }, vaultKey, enc.encode(JSON.stringify(data)));
  return { iv: toB64(iv), ciphertext: toB64(ct) };
}

export async function openItem(vaultKey: CryptoKey, item: SealedItem): Promise<VaultItemData> {
  const pt = await subtle().decrypt({ name: "AES-GCM", iv: fromB64(item.iv) }, vaultKey, fromB64(item.ciphertext));
  return JSON.parse(dec.decode(pt)) as VaultItemData;
}

const SETS = ["abcdefghijkmnopqrstuvwxyz", "ABCDEFGHJKLMNPQRSTUVWXYZ", "23456789", "!@#$%^&*-_=+?"];

/** Uniform random integer in [0, max) — rejection sampling, so no modulo bias. */
function randInt(max: number): number {
  const limit = Math.floor(0x1_0000_0000 / max) * max;
  for (;;) {
    const v = globalThis.crypto.getRandomValues(new Uint32Array(1))[0];
    if (v < limit) return v % max;
  }
}

export interface GeneratorOptions { numbers?: boolean; symbols?: boolean }
export const MIN_GENERATED = 8;
export const MAX_GENERATED = 100;

/** Strong random password: at least one of each chosen character set, uniformly shuffled. Length 8–100. */
export function generatePassword(length = 20, { numbers = true, symbols = true }: GeneratorOptions = {}): string {
  const n = Math.min(MAX_GENERATED, Math.max(MIN_GENERATED, Math.round(length)));
  const sets = [SETS[0], SETS[1], ...(numbers ? [SETS[2]] : []), ...(symbols ? [SETS[3]] : [])];
  const all = sets.join("");
  const pick = (chars: string) => chars[randInt(chars.length)];
  const out = [...sets.map(pick), ...Array.from({ length: n - sets.length }, () => pick(all))];
  for (let i = out.length - 1; i > 0; i--) { // Fisher–Yates
    const j = randInt(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out.join("");
}

export const SEPARATORS = { "-": "Hyphens", " ": "Spaces", ".": "Periods", ",": "Commas", "_": "Underscores", "digits": "Numbers" } as const;
export type Separator = keyof typeof SEPARATORS;
export const MIN_WORDS = 3;
export const MAX_WORDS = 10;

/** Memorable password: random everyday words, e.g. "Maple-Rocket-Quiet-Harbor" (about 10 bits a word). */
export function generateMemorable(words = 4, { separator = "-", capitalize = true }: { separator?: Separator; capitalize?: boolean } = {}): string {
  const n = Math.min(MAX_WORDS, Math.max(MIN_WORDS, Math.round(words)));
  const picked = Array.from({ length: n }, () => WORDS[randInt(WORDS.length)]).map((w) => (capitalize ? w[0].toUpperCase() + w.slice(1) : w));
  if (separator !== "digits") return picked.join(separator);
  return picked.reduce((out, w) => `${out}${randInt(10)}${w}`); // a random digit between each pair of words
}

export const MIN_PIN = 4;
export const MAX_PIN = 12;
/** A PIN: random digits, 4–12 of them. */
export function generatePin(digits = 6): string {
  const n = Math.min(MAX_PIN, Math.max(MIN_PIN, Math.round(digits)));
  return Array.from({ length: n }, () => String(randInt(10))).join("");
}

/** 0 (very weak) … 4 (strong): length + variety, a rough guide for the strength meter. */
export function passwordStrength(pw: string): number {
  if (pw.length < 8) return 0;
  const variety = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length;
  let score = pw.length >= 12 ? 2 : 1;
  if (pw.length >= 16) score++;
  if (variety >= 3) score++;
  return Math.min(4, score);
}
