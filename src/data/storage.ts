// Each company's data in this browser, one key per company, plus a registry of the companies on this device.
// ponytail: the swap point for the backend — these four functions become API calls; nothing else reads storage.
import { DB_VERSION, normalize, type Db } from "./db.ts";

const REGISTRY_KEY = "onefold.orgs";
const orgKey = (slug: string) => `onefold.org.${slug}`;

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null; // blocked storage or corrupt JSON: treat as missing
  }
}

export function listOrgs(): string[] {
  const list = readJson<unknown>(REGISTRY_KEY);
  return Array.isArray(list) ? list.filter((s): s is string => typeof s === "string") : [];
}

export const slugTaken = (slug: string) => listOrgs().includes(slug);

/** A company's data, or null if it isn't on this device (or was saved by an incompatible version). */
export function loadOrg(slug: string): Db | null {
  const db = readJson<Db>(orgKey(slug));
  return db && db.version === DB_VERSION && db.org?.slug === slug ? normalize(db) : null;
}

/** false when the browser refused (private mode, storage full) — the caller tells the person. */
export function saveOrg(db: Db): boolean {
  try {
    localStorage.setItem(orgKey(db.org.slug), JSON.stringify(db));
    const list = listOrgs();
    if (!list.includes(db.org.slug)) localStorage.setItem(REGISTRY_KEY, JSON.stringify([...list, db.org.slug]));
    return true;
  } catch {
    return false;
  }
}

/** Every company on this device that has someone with this email (sign-in, invite lookup). */
export function orgsWithEmail(email: string): Db[] {
  const e = email.trim().toLowerCase();
  return listOrgs().map(loadOrg).filter((db): db is Db => !!db && db.people.some((p) => p.email === e));
}

export function orgWithInvite(token: string): Db | null {
  return listOrgs().map(loadOrg).find((db) => db?.invites.some((i) => i.token === token)) ?? null;
}

/** Storage key for a company — the store listens for it to pick up changes from other tabs. */
export const storageKeyFor = orgKey;
