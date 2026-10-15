// Passwords and tokens. Passwords: Argon2id (its default cost: 19 MiB, 2 passes — OWASP's baseline), salt inside the
// encoded hash. Tokens (sessions, invites): 32 random bytes; only their SHA-256 is stored, so a database leak can't
// be replayed as logins or invite links.
import { createHash, randomBytes } from "node:crypto";
import { hash, verify } from "@node-rs/argon2";

export const MIN_PASSWORD = 8;
export const MAX_PASSWORD = 200; // hashing a megabyte "password" is a cheap denial of service

export async function hashPassword(password: string): Promise<string> {
  if (password.length < MIN_PASSWORD || password.length > MAX_PASSWORD) throw new Error("Password length out of range");
  return hash(password);
}

// Checking an unknown email still costs one real verify, so response times don't reveal which emails have accounts.
let decoy: Promise<string> | null = null;

/** True only for a stored hash that matches. `encoded` null = no such account (always false, same cost). */
export async function verifyPassword(password: string, encoded: string | null): Promise<boolean> {
  if (password.length > MAX_PASSWORD) return false;
  decoy ??= hash(newToken());
  try {
    const ok = await verify(encoded ?? (await decoy), password);
    return encoded !== null && ok;
  } catch {
    return false; // a corrupt stored hash is a wrong password, never a crash
  }
}

export const newToken = () => randomBytes(32).toString("base64url");
export const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
export const newId = (prefix: string) => `${prefix}-${randomBytes(9).toString("base64url")}`;
