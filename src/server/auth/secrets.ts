// Passwords and tokens. Passwords: Argon2id (its default cost: 19 MiB, 2 passes — OWASP's baseline), salt inside the
// encoded hash. Tokens (sessions, invites): 32 random bytes; only their SHA-256 is stored, so a database leak can't
// be replayed as logins or invite links.
import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from "node:crypto";
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

// ---------- secrets a company keeps in 1Fold (its own Resend API key): encrypted at rest ----------
// AES-256-GCM, with a key derived from SESSION_SECRET — so a copy of the database alone can't read them. (Changing
// SESSION_SECRET makes them unreadable: they're entered again in Integrations.)

function sealKey(): Buffer {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET must be set (32+ random characters)");
  return Buffer.from(hkdfSync("sha256", secret, "1fold", "company-secrets:v1", 32));
}

/** Encrypts a secret for the database ("v1.<iv>.<tag>.<ciphertext>"). */
export function seal(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", sealKey(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), data.toString("base64url")].join(".");
}

/** The secret back — or an error if it was changed, or sealed under another SESSION_SECRET. */
export function unseal(sealed: string): string {
  const [version, iv, tag, data] = sealed.split(".");
  if (version !== "v1" || !iv || !tag || !data) throw new Error("Not a sealed secret");
  const decipher = createDecipheriv("aes-256-gcm", sealKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}
