// Urgent (@@) mentions on WhatsApp: whenever a change makes an urgent notice, the person it's for also gets it on their
// linked WhatsApp — who, where, the message itself, and a link — within seconds (queued here, sent by the worker).
// A normal @mention stays in the app. People without a linked number still have the in-app notice.
import { and, eq, inArray } from "drizzle-orm";
import type { Db } from "../../data/db.ts";
import { PANEL_SLUG } from "../../data/session.ts";
import type { Notification, Person } from "../../domain/types.ts";
import { DEFAULT_SETTINGS, fill } from "../../domain/whatsapp.ts";
import { whatsappLinkBase } from "./appLink.ts";
import { database } from "../db/client.ts";
import * as s from "../db/schema.ts";
import { settingsFor } from "./settings.ts";

const EXCERPT = 280;

export interface Alert { memberId: string; text: string }

const excerpt = (text: string) => {
  const one = text.replace(/\s+/g, " ").trim();
  return one.length > EXCERPT ? `${one.slice(0, EXCERPT - 1).trimEnd()}…` : one;
};

/** The WhatsApp messages for the urgent notices a change made (in `after`, not in `before`), in the company's own words
 * (`template`). Pure: no I/O. */
export function urgentAlerts(before: Db, after: Db, me: Person, appUrl = whatsappLinkBase(), template = DEFAULT_SETTINGS.templates.urgent): Alert[] {
  const old = new Set(before.notifications.map((n) => n.id));
  const base = appUrl.replace(/\/$/, "");
  const oldComments = new Set(before.comments.map((c) => c.id));
  return after.notifications.filter((n) => n.urgent && !old.has(n.id)).flatMap((n) => {
    const person = after.people.find((p) => p.id === n.personId);
    if (!person?.panel) return [];
    const slug = PANEL_SLUG[person.panel];
    return [{ memberId: person.id, text: fill(template, {
      actor: me.name,
      place: n.text.replace(/^mentioned you in (the decision )?/, ""),
      message: message(after, n, me, oldComments),
      link: linkTo(base, slug, n.target),
    }) }];
  });
}

/** What they were told: the update itself (for a ticket) or the decision's summary; nothing for a doc. */
function message(after: Db, n: Notification, me: Person, oldComments: Set<string>): string {
  if (/^[A-Z]+-\d+$/.test(n.target)) {
    const said = after.comments.filter((c) => c.ticketKey === n.target && c.authorId === me.id && !oldComments.has(c.id)).at(-1);
    return said ? `:\n\n“${excerpt(said.body)}”` : ".";
  }
  const decision = /decisions\?d=([\w-]+)/.exec(n.target)?.[1];
  const why = decision ? after.decisions.find((d) => d.id === decision)?.why : undefined;
  return why ? `:\n\n“${excerpt(why)}”` : ".";
}

const linkTo = (base: string, slug: string, target: string) =>
  /^[A-Z]+-\d+$/.test(target) ? `${base}/${slug}/t/${target}` : target.startsWith("/d/") ? `${base}${target}` : `${base}/${slug}${target}`;

/** Queues these on each person's linked WhatsApp (in this company); returns how many were queued. */
export async function queueAlerts(orgId: string, alerts: Alert[], kind = "urgent"): Promise<number> {
  if (!alerts.length) return 0;
  const db = database();
  const links = await db.select({ memberId: s.whatsappLinks.memberId, jid: s.whatsappLinks.jid }).from(s.whatsappLinks)
    .where(and(eq(s.whatsappLinks.orgId, orgId), inArray(s.whatsappLinks.memberId, alerts.map((a) => a.memberId))));
  const rows = alerts.flatMap((a) => links.filter((l) => l.memberId === a.memberId).map((l) => ({ jid: l.jid, text: a.text, orgId, memberId: a.memberId, kind })));
  if (rows.length) await db.insert(s.whatsappOutbox).values(rows);
  return rows.length;
}

/** After a change is saved: send its urgent notices on WhatsApp. Never fails the change (the in-app notice stands). */
export async function sendUrgent(orgId: string, before: Db, after: Db, me: Person): Promise<void> {
  if (!urgentAlerts(before, after, me).length) return; // most changes: nothing to send, so nothing to look up
  const send = async () => queueAlerts(orgId, urgentAlerts(before, after, me, undefined, (await settingsFor(orgId)).templates.urgent));
  await send().catch((e: unknown) => console.error("[whatsapp] couldn't queue urgent alerts", e));
}
