// The vault on the server: only "forgot my master password". The server never sees a password, a key or a recovery
// code — it emails a link that proves the inbox is theirs (30 minutes, once), and when they come back with it, stores
// the private key their browser locked again with a new master password (opened with their recovery code). The link
// alone opens nothing.
import { and, eq, isNull, sql } from "drizzle-orm";
import type { VaultAccount } from "../domain/types.ts";
import { ValidationError } from "../domain/commands/index.ts";
import { issueLink, liveLink, type SessionRow } from "./accounts.ts";
import { applySteps } from "./changes.ts";
import { database } from "./db/client.ts";
import * as s from "./db/schema.ts";
import { deliverEmail, vaultResetEmail } from "./email.ts";

export const VAULT_RESET_MINUTES = 30;
const GONE = "This link has expired or was already used — ask for a new one from the vault.";
const okToken = (t: unknown): t is string => typeof t === "string" && t.length > 0 && t.length <= 100;

/** "Forgot my master password": a link to their own inbox (the platform's email, so nobody's locked out). */
export async function sendVaultReset(who: SessionRow, appUrl: string): Promise<void> {
  const [user] = await database().select({ email: s.users.email }).from(s.users).where(eq(s.users.id, who.userId));
  if (!user) throw new ValidationError("Sign in again");
  const token = await issueLink(who.userId, "vault", VAULT_RESET_MINUTES * 60_000, who.orgId);
  // Signed in, so there's nothing to hide: if it didn't go, say why instead of "we emailed you".
  const sent = await deliverEmail(vaultResetEmail({ to: user.email, link: `${appUrl}/vault/recover/${token}`, minutes: VAULT_RESET_MINUTES }));
  // The reason helps whoever sets email up; an address in it (Resend's "only to <owner>") isn't theirs to see.
  if (!sent.ok) throw new ValidationError(`The email couldn't be sent: ${sent.reason.replace(/[^\s@<>()]+@[^\s@<>()]+/g, "the account owner")}`);
}

const theirs = (who: SessionRow, token: string) => and(liveLink(token, "vault"), isNull(s.emailTokens.usedAt), eq(s.emailTokens.userId, who.userId));

/** Whether a reset link is still good — and theirs (signed in as the person it was sent to). Checking never uses it up. */
export async function vaultResetCheck(who: SessionRow, token: unknown): Promise<{ problem: string | null }> {
  if (!okToken(token)) return { problem: GONE };
  const [row] = await database().select({ id: s.emailTokens.id }).from(s.emailTokens).where(theirs(who, token));
  return { problem: row ? null : GONE };
}

/** With a good link: their private key, locked again with the new master password. The link is used up. */
export async function recoverVault(who: SessionRow, token: unknown, wrap: Pick<VaultAccount, "salt" | "iterations" | "iv" | "wrappedPrivateKey">) {
  if (!okToken(token)) throw new ValidationError(GONE);
  const [used] = await database().update(s.emailTokens).set({ usedAt: sql`now()` }).where(theirs(who, token)).returning({ id: s.emailTokens.id });
  if (!used) throw new ValidationError(GONE);
  return applySteps(who, [{ name: "rewrapVault", args: [wrap] }]);
}
