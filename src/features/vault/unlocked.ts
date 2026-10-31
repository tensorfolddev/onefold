// "Stay unlocked for an hour": this browser keeps the unlocked private key in IndexedDB — as a CryptoKey that can't be
// exported, so not even a script on the page can read it out — with when it runs out. Locking, signing out, a new master
// password or an hour without activity removes it. Tabs tell each other when the vault locks or unlocks.
// No IndexedDB (some private windows): nothing is kept, and the vault just asks again after a reload.

export const STAY_UNLOCKED_MS = 60 * 60 * 1000;
const DB_NAME = "onefold-vault";
const STORE = "unlocked";

interface Kept { wrapped: string; key: CryptoKey; until: number }

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, use: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  if (typeof indexedDB === "undefined") return undefined;
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = use(t.objectStore(STORE));
    t.oncomplete = () => { db.close(); resolve(req.result); };
    t.onerror = t.onabort = () => { db.close(); reject(t.error); };
  });
}

/** Keep `key` for `who` ("<org>:<person>") — tied to the lock it came from, so a new master password drops it. */
export async function keepUnlocked(who: string, wrapped: string, key: CryptoKey) {
  await run("readwrite", (s) => s.put({ wrapped, key, until: Date.now() + STAY_UNLOCKED_MS } satisfies Kept, who)).catch(() => undefined);
}

/** The kept key, if it's still theirs, for this same lock, and not run out — otherwise it's removed. */
export async function keptKey(who: string, wrapped: string): Promise<CryptoKey | null> {
  const kept = await run<Kept | undefined>("readonly", (s) => s.get(who)).catch(() => undefined);
  if (!kept) return null;
  if (kept.wrapped !== wrapped || kept.until < Date.now()) { await forgetUnlocked(); return null; }
  return kept.key;
}

/** Activity: another hour from now. */
export async function touchUnlocked(who: string) {
  const kept = await run<Kept | undefined>("readonly", (s) => s.get(who)).catch(() => undefined);
  if (kept && kept.until > Date.now()) await keepUnlocked(who, kept.wrapped, kept.key);
}

export async function forgetUnlocked() {
  await run("readwrite", (s) => s.clear()).catch(() => undefined);
}

/** Every tab of this browser hears "lock" and "unlock" from the others. */
export const vaultChannel = () => (typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel("onefold-vault"));
