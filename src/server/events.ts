// Live updates. One LISTEN connection per server process hears every committed change ("org:version", sent by
// journal.ts) and passes it to that company's open browsers, which then refetch their view.
import pg from "pg";
import { CHANNEL } from "./journal.ts";

type Listener = (version: number) => void;
interface State { listeners: Map<string, Set<Listener>>; client: Promise<pg.Client> | null }
const holder = globalThis as unknown as { __onefoldEvents?: State };
const state: State = (holder.__onefoldEvents ??= { listeners: new Map(), client: null });

const RECONNECT_MS = 2000;

function connect(): Promise<pg.Client> {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  const lost = () => {
    state.client = null;
    // Browsers also refetch when they regain focus, so a short gap here loses nothing.
    if (state.listeners.size) setTimeout(() => ensure().catch((e: unknown) => console.error("[events] reconnect failed", e)), RECONNECT_MS);
  };
  client.on("notification", (msg) => {
    const [orgId, version] = (msg.payload ?? "").split(":");
    for (const fn of state.listeners.get(orgId) ?? []) fn(Number(version));
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

/** Calls `fn` with the new version after every change to `orgId`. Returns the unsubscribe function. */
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
