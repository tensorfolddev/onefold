// Personal API tokens for MCP clients (Claude Code, Claude Desktop…). A token acts as the person who made it, in the
// company they made it in, with exactly their permissions — and stops working when they revoke it, are turned off, or
// their password is changed or reset (a stolen password must not leave a working token behind).
// It's shown once; only its SHA-256 is kept, plus its last 4 characters to tell tokens apart.
import { and, desc, eq, isNull, lt, or, sql } from "drizzle-orm";
import { ValidationError } from "../../domain/commands/index.ts";
import { activeMemberId, type SessionRow } from "../accounts.ts";
import { newToken, sha256 } from "../auth/secrets.ts";
import { database } from "../db/client.ts";
import * as s from "../db/schema.ts";

export const TOKEN_PREFIX = "1fold_";
const MAX_TOKENS = 20; // per person per company
const MAX_NAME = 80;

export interface TokenInfo { id: string; name: string; hint: string; createdAt: string; lastUsedAt: string | null }

const mine = (who: SessionRow, memberId: string) =>
  and(eq(s.apiTokens.orgId, who.orgId), eq(s.apiTokens.memberId, memberId), isNull(s.apiTokens.revokedAt));

export async function listApiTokens(who: SessionRow): Promise<TokenInfo[]> {
  const memberId = await activeMemberId(who);
  return database().select({ id: s.apiTokens.id, name: s.apiTokens.name, hint: s.apiTokens.hint, createdAt: s.apiTokens.createdAt, lastUsedAt: s.apiTokens.lastUsedAt })
    .from(s.apiTokens).where(mine(who, memberId)).orderBy(desc(s.apiTokens.createdAt));
}

/** A new token for the signed-in person. The token itself is in the answer — the only time it ever is. */
export async function createApiToken(who: SessionRow, name: string): Promise<TokenInfo & { token: string }> {
  const memberId = await activeMemberId(who);
  const label = name.replace(/\s+/g, " ").trim().slice(0, MAX_NAME) || "MCP client";
  const [{ n }] = await database().select({ n: sql<number>`count(*)::int` }).from(s.apiTokens).where(mine(who, memberId));
  if (n >= MAX_TOKENS) throw new ValidationError(`You have ${MAX_TOKENS} tokens already — revoke one you no longer use`);
  const token = `${TOKEN_PREFIX}${newToken()}`;
  const [row] = await database().insert(s.apiTokens)
    .values({ id: sha256(token), orgId: who.orgId, memberId, userId: who.userId, name: label, hint: token.slice(-4) })
    .returning();
  return { id: row.id, name: row.name, hint: row.hint, createdAt: row.createdAt, lastUsedAt: null, token };
}

export async function revokeApiToken(who: SessionRow, id: string): Promise<void> {
  const memberId = await activeMemberId(who);
  const [gone] = await database().update(s.apiTokens).set({ revokedAt: sql`now()` })
    .where(and(eq(s.apiTokens.id, id), mine(who, memberId))).returning({ id: s.apiTokens.id });
  if (!gone) throw new ValidationError("That token isn't there any more");
}

/** The person behind a bearer token, as the session the rest of the server understands; null if unknown or revoked. */
export async function tokenSession(token: string): Promise<SessionRow | null> {
  if (!token.startsWith(TOKEN_PREFIX) || token.length > 100) return null;
  const id = sha256(token);
  const [row] = await database().select({ userId: s.apiTokens.userId, orgId: s.apiTokens.orgId }).from(s.apiTokens)
    .where(and(eq(s.apiTokens.id, id), isNull(s.apiTokens.revokedAt)));
  if (!row) return null;
  try { await activeMemberId(row); } catch { return null; } // turned off in that company: the token is too
  await database().update(s.apiTokens).set({ lastUsedAt: sql`now()` }) // at most once a minute
    .where(and(eq(s.apiTokens.id, id), or(isNull(s.apiTokens.lastUsedAt), lt(s.apiTokens.lastUsedAt, sql`now() - interval '1 minute'`))));
  return { sessionId: `token:${id}`, userId: row.userId, orgId: row.orgId };
}
