// A client's own link: short, and the same every time — it signs them in until an admin makes a new one (Settings →
// Clients) or they're switched off. Kept hashed (to find it) and sealed (to show it to the team again), outside the
// company's data: never in its backups, its snapshot, or anything an assistant reads.
import { randomInt } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { seal, sha256, unseal } from "./auth/secrets.ts";
import { database } from "./db/client.ts";
import * as s from "./db/schema.ts";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789"; // none of 0 O 1 l I: it's read aloud, retyped
export const CODE_LENGTH = 12; // 57^12 ≈ 10^21, and signing in is rate-limited: guessing one isn't a way in
export const isClientCode = (v: string) => v.length === CODE_LENGTH && [...v].every((c) => ALPHABET.includes(c));
const newCode = () => Array.from({ length: CODE_LENGTH }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
export const clientCodeUrl = (appUrl: string, code: string) => `${appUrl}/c/l/${code}`;

const theirs = (orgId: string, memberId: string) => and(eq(s.clientLinks.orgId, orgId), eq(s.clientLinks.memberId, memberId));

/** Their code: the one they have, made the first time it's asked for — or a new one (`fresh`): the old stops working. */
export async function clientCode(orgId: string, memberId: string, by: string, fresh = false): Promise<string> {
  const code = newCode();
  const row = { orgId, memberId, codeHash: sha256(code), code: seal(code), createdBy: by, createdAt: new Date().toISOString() };
  const insert = database().insert(s.clientLinks).values(row);
  if (fresh) {
    await insert.onConflictDoUpdate({ target: [s.clientLinks.orgId, s.clientLinks.memberId], set: { codeHash: row.codeHash, code: row.code, createdBy: by, createdAt: row.createdAt } });
    return code;
  }
  await insert.onConflictDoNothing(); // two asking at once: both get the one that's kept
  const [kept] = await database().select({ code: s.clientLinks.code }).from(s.clientLinks).where(theirs(orgId, memberId));
  return unseal(kept.code);
}

/** Whose code this is — the company and the client person — or undefined. */
export async function clientCodeOwner(code: string): Promise<{ orgId: string; memberId: string } | undefined> {
  if (!isClientCode(code)) return undefined;
  const [row] = await database().select({ orgId: s.clientLinks.orgId, memberId: s.clientLinks.memberId }).from(s.clientLinks).where(eq(s.clientLinks.codeHash, sha256(code)));
  return row;
}
