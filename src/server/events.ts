// Live updates. One LISTEN connection per server process hears every committed change ("org:version", sent by
// journal.ts) and passes it to that company's open browsers, which then refetch their view. Docs add two kinds of
// their own: a body was saved ("org:doc:…") and who has a doc open ("org:presence:…"); see docs.ts.
import pg from "pg";
import { CHANNEL } from "./journal.ts";

export type OrgEvent =
  | { type: "version"; version: number }
  | { type: "doc"; docId: string; productKey: string; rev: number; personId: string }
  | { type: "presence"; docId: string; productKey: string; people: { personId: string; editing: boolean }[] };

type Listener = (event: OrgEvent) => void;
interface State { listeners: Map<string, Set<Listener>>; client: Promise<pg.Client> | null }
const holder = globalThis as unknown as { __onefoldEvents?: State };
const state: State = (holder.__onefoldEvents ??= { listeners: new Map(), client: null });

const RECONNECT_MS = 2000;

/** "org:42" → a version; "org:doc:{json}" / "org:presence:{json}" → a doc event. Anything else is ignored. */
export function parseEvent(payload: string): { orgId: string; event: OrgEvent } | null {
  const at = payload.indexOf(":");
  if (at < 0) return null;
  const orgId = payload.slice(0, at);
  const rest = payload.slice(at + 1);
  if (/^\d+$/.test(rest)) return { orgId, event: { type: "version", version: Number(rest) } };
  const kind = rest.slice(0, rest.indexOf(":"));
  if (kind !== "doc" && kind !== "presence") return null;
  try {
    return { orgId, event: { type: kind, ...JSON.parse(rest.slice(kind.length + 1)) } as OrgEvent };
  } catch {
    return null;
  }
}

function connect(): Promise<pg.Client> {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  const lost = () => {
    state.client = null;
    // Browsers also refetch when they regain focus, so a short gap here loses nothing.
    if (state.listeners.size) setTimeout(() => ensure().catch((e: unknown) => console.error("[events] reconnect failed", e)), RECONNECT_MS);
  };
  client.on("notification", (msg) => {
    const parsed = parseEvent(msg.payload ?? "");
    if (!parsed) return;
    for (const fn of state.listeners.get(parsed.orgId) ?? []) fn(parsed.event);
  });
  client.on("error", lost);
  client.on("end", lost);
  return client.connect().then(async () => {
    await client.query(`LISTEN ${CHANNEL}`);
    return client;
  });
}

function ensure(): Promise<pg.Client> {
  state.client ??= connect().catch((e: unknown) => { state.client = null; throw e; });
  return state.client;
}

/** Calls `fn` with every event of `orgId`. Returns the unsubscribe function. */
export async function subscribe(orgId: string, fn: Listener): Promise<() => void> {
  await ensure();
  const set = state.listeners.get(orgId) ?? new Set<Listener>();
  set.add(fn);
  state.listeners.set(orgId, set);
  return () => {
    set.delete(fn);
    if (!set.size) state.listeners.delete(orgId);
  };
}
