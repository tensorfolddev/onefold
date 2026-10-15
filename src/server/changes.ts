// Changes. The browser records the steps it ran (named commands + their arguments) and sends them; the server replays
// them on the real data as the signed-in person, in one transaction (all or nothing), saves only what changed, logs
// every step and tells the company's other browsers. Also: each person's view, invites (the server makes the secret
// links and emails them) and Undo (refused if anyone changed anything since).
import { and, eq } from "drizzle-orm";
import type { Db } from "../data/db.ts";
import { AccessError, commands, INVITE_DAYS, inviteMembers, ValidationError, type CommandName, type InviteInput } from "../domain/commands/index.ts";
import { snapshotFor } from "../domain/snapshot.ts";
import type { Panel, Person } from "../domain/types.ts";
import { emailVerified, personFor, type SessionRow } from "./accounts.ts";
import { newToken, sha256 } from "./auth/secrets.ts";
import { loadCompany, saveCompany, type Loaded } from "./company/store.ts";
import { inScope, type Tx } from "./db/client.ts";
import * as s from "./db/schema.ts";
import { emailEnabled, inviteEmail, sendEmail } from "./email.ts";
import { journal, type Source } from "./journal.ts";

export interface Step { name: string; args: unknown[] }
export const MAX_STEPS = 25;

/** Invites carry secrets the server must generate, so browsers can't send them as steps. */
const SERVER_ONLY = new Set<string>(["inviteMembers"]);
const isBrowserCommand = (name: string): name is CommandName => Object.hasOwn(commands, name) && !SERVER_ONLY.has(name);

async function mustLoad(tx: Tx, who: SessionRow): Promise<Loaded> {
  const loaded = await loadCompany(tx, who.orgId);
  if (!loaded) throw new AccessError();
  return loaded;
}

export interface View {
  db: Db; version: number; meId: string; panel: Panel; orgSlug: string;
  /** Their email isn't confirmed yet (only when email is set up): they can't send invites until it is. */
  emailUnverified: boolean;
}

/** What one person's browser gets: their view of the company, its version, and who they are. */
export async function viewFor(who: SessionRow): Promise<View> {
  const view = await inScope({ orgId: who.orgId, userId: who.userId }, async (tx) => {
    const loaded = await mustLoad(tx, who);
    const me = personFor(loaded, who.userId);
    return { db: snapshotFor(loaded.db, me), version: loaded.version, meId: me.id, panel: me.panel!, orgSlug: loaded.db.org.slug };
  });
  return { ...view, emailUnverified: emailEnabled() && !(await emailVerified(who.userId)) };
}

export interface Applied { version: number; key?: unknown }

/** Replays `steps` as the signed-in person. Refusals (permissions, validation) throw AccessError / ValidationError. */
export async function applySteps(who: SessionRow, steps: Step[], opts: { undoable?: boolean; source?: Source } = {}): Promise<Applied> {
  if (!Array.isArray(steps) || steps.length === 0 || steps.length > MAX_STEPS) throw new ValidationError("Nothing to change");
  for (const step of steps) {
    if (!step || typeof step.name !== "string" || !isBrowserCommand(step.name) || !Array.isArray(step.args)) {
      throw new ValidationError("That change isn't allowed");
    }
  }
  return inScope({ orgId: who.orgId, userId: who.userId, lock: true }, async (tx) => {
    const loaded = await mustLoad(tx, who);
    const me = personFor(loaded, who.userId);
    let db = loaded.db;
    let key: unknown;
    for (const step of steps) {
      const run = commands[step.name as CommandName] as unknown as (db: Db, me: Person, ...args: unknown[]) => Db | { db: Db; key: unknown };
      let result: Db | { db: Db; key: unknown };
      try {
        result = run(db, me, ...step.args);
      } catch (e) {
        if (e instanceof AccessError || e instanceof ValidationError) throw e;
        throw new ValidationError("That change couldn't be applied — refresh and try again"); // malformed arguments
      }
      if ("key" in result && "db" in result) { db = result.db; key = result.key; } else db = result as Db;
    }
    const version = await saveCompany(tx, loaded, db);
    if (opts.undoable) {
      await tx.insert(s.undoPoints).values({ orgId: who.orgId, userId: who.userId, version, before: loaded.db })
        .onConflictDoUpdate({ target: [s.undoPoints.orgId, s.undoPoints.userId], set: { version, before: loaded.db } });
    }
    await journal(tx, { orgId: who.orgId, userId: who.userId, actorId: me.id, source: opts.source ?? "web" },
      steps.map((st) => ({ command: st.name, args: st.args })), version);
    return { version, key };
  });
}

/** Puts back the company as it was before your last undoable change — only if nobody changed anything since. */
export async function undoLast(who: SessionRow): Promise<Applied> {
  return inScope({ orgId: who.orgId, userId: who.userId, lock: true }, async (tx) => {
    const loaded = await mustLoad(tx, who);
    const me = personFor(loaded, who.userId);
    const where = and(eq(s.undoPoints.orgId, who.orgId), eq(s.undoPoints.userId, who.userId));
    const [point] = await tx.select().from(s.undoPoints).where(where);
    if (!point) throw new ValidationError("There's nothing to undo");
    if (point.version !== loaded.version) throw new ValidationError("Something changed since — this can't be undone any more");
    await tx.delete(s.undoPoints).where(where);
    const version = await saveCompany(tx, loaded, point.before as Db);
    await journal(tx, { orgId: who.orgId, userId: who.userId, actorId: me.id, source: "web" }, [{ command: "undo", args: { version: point.version } }], version);
    return { version };
  });
}

export interface CreatedInvite { id: string; email: string; panel: Panel; role: string; link: string; emailed: boolean }

/**
 * Admins invite people: the server makes each link's secret token, stores only its hash, emails each person their link
 * and returns the links once (the copyable backup). Needs a confirmed email when email is set up, so nobody can send
 * invites in the name of an address they don't own.
 */
export async function createInvites(who: SessionRow, invites: InviteInput[], appUrl: string): Promise<{ version: number; invites: CreatedInvite[] }> {
  if (!Array.isArray(invites)) throw new ValidationError("Add at least one email");
  if (emailEnabled() && !(await emailVerified(who.userId))) throw new ValidationError("Confirm your email first — open the link we emailed you");
  const tokens = invites.map(() => newToken());
  const made = await inScope({ orgId: who.orgId, userId: who.userId, lock: true }, async (tx) => {
    const loaded = await mustLoad(tx, who);
    const me = personFor(loaded, who.userId);
    const next = inviteMembers(loaded.db, me, invites.map((inv, i) => ({
      email: String(inv?.email ?? ""), panel: inv?.panel, role: inv?.role, tokenHash: sha256(tokens[i]),
    })));
    const version = await saveCompany(tx, loaded, next);
    await journal(tx, { orgId: who.orgId, userId: who.userId, actorId: me.id, source: "web" },
      [{ command: "inviteMembers", args: invites.map((i) => ({ email: i.email, panel: i.panel })) }], version);
    const created = next.invites.slice(-invites.length).map((inv, i) => ({ id: inv.id, email: inv.email, panel: inv.panel, role: inv.role, link: `${appUrl}/invite/${tokens[i]}` }));
    return { version, created, orgName: next.org.name, inviterName: me.name };
  });
  // After the commit: an email that fails still leaves a working invite, and its link is shown to copy.
  // One at a time — Resend limits requests per second, and a batch sent at once would bounce the extras.
  const invitesOut: CreatedInvite[] = [];
  for (const inv of made.created) {
    const emailed = await sendEmail(inviteEmail({ to: inv.email, orgName: made.orgName, inviterName: made.inviterName, link: inv.link, days: INVITE_DAYS }));
    invitesOut.push({ ...inv, emailed });
  }
  return { version: made.version, invites: invitesOut };
}
