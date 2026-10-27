// After every change: an audit-log row per step (who, what, when, from where), and a Postgres NOTIFY so every open
// browser of that company refreshes. Both happen inside the change's transaction, so they exist only if it commits.
import { sql } from "drizzle-orm";
import { VAULT_COMMANDS } from "../domain/commands/vault.ts";
import type { Tx } from "./db/client.ts";
import * as s from "./db/schema.ts";

export type Source = "web" | "mcp" | "whatsapp" | "system" | "client";
export const CHANNEL = "onefold_changes";

export interface Entry { command: string; args: unknown }
export interface Actor { orgId: string; userId: string | null; actorId: string | null; source: Source }

export async function journal(tx: Tx, actor: Actor, entries: Entry[], version: number) {
  if (entries.length) {
    await tx.insert(s.auditLog).values(entries.map((e) => ({
      orgId: actor.orgId, actorId: actor.actorId, userId: actor.userId, source: actor.source, command: e.command,
      args: VAULT_COMMANDS.has(e.command) ? { sealed: true } : e.args ?? {}, // the vault's blobs and keys stay out of the log
    })));
  }
  await tx.execute(sql`select pg_notify(${CHANNEL}, ${`${actor.orgId}:${version}`})`);
}
