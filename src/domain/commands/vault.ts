// The vault (1Password-like), store side — ported from the first 1Fold. Everything here is ciphertext: the browser
// encrypts and decrypts (features/vault/crypto.ts); these commands only check who may hold, change or share what, and
// that what's stored is a well-formed blob. Nobody but the person, with their master password or recovery code, can
// open their private key — so nobody else, admins included, can read a password. Team members only: never clients.
import type { Db } from "../../data/db.ts";
import { now, today } from "../clock.ts";
import type { Notification, Person, VaultAccount, VaultRecord } from "../types.ts";
import { AccessError, fail, id, personOf, replace, ValidationError } from "./shared.ts";

const BLOB = /^[A-Za-z0-9+/]+={0,2}$/;
const MAX_KEY = 4096; // a wrapped key: an RSA-2048 block, or an AES-GCM(pkcs8) key
const MAX_ITEM = 64 * 1024; // one item's sealed JSON
const MIN_ROUNDS = 100_000; // PBKDF2 rounds a master password is stretched with (the browser uses 600,000)

/** A base64 blob, at most `max` characters. */
function blob(label: string, v: unknown, max = MAX_KEY): string {
  fail(typeof v === "string" && v.length > 0 && v.length <= max && BLOB.test(v) ? null : `${label} isn't valid`);
  return v as string;
}
const keysOf = (v: unknown): Record<string, string> => {
  fail(v && typeof v === "object" && !Array.isArray(v) ? null : "The keys aren't valid");
  return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([pid, k]) => [pid, blob("A key", k)]));
};
/** The master-password half of an account: what a new master password replaces. */
function passwordWrapOf(v: Partial<VaultAccount> | undefined) {
  fail(Number.isInteger(v?.iterations) && v!.iterations! >= MIN_ROUNDS ? null : "The master password isn't stretched enough");
  return { salt: blob("The salt", v?.salt), iterations: v!.iterations!, iv: blob("The IV", v?.iv), wrappedPrivateKey: blob("The private key", v?.wrappedPrivateKey) };
}
function accountOf(v: Partial<VaultAccount> | undefined): VaultAccount {
  return {
    ...passwordWrapOf(v), publicKey: blob("The public key", v?.publicKey),
    recoverySalt: blob("The recovery salt", v?.recoverySalt), recoveryIv: blob("The recovery IV", v?.recoveryIv),
    recoveryWrappedPrivateKey: blob("The recovery key", v?.recoveryWrappedPrivateKey),
  };
}

const teammate = (me: Person) => { if (!me.active || !me.panel) throw new AccessError(); };
const dropKey = (v: VaultRecord, personId: string): VaultRecord => {
  const keys = { ...v.keys };
  delete keys[personId];
  return { ...v, keys };
};
const vaultOf = (db: Db, vaultId: string) => {
  const v = db.vaults.find((x) => x.id === vaultId);
  if (!v) throw new ValidationError("Vault not found");
  return v;
};
const holdsKey = (v: VaultRecord, me: Person) => { if (!me.active || !me.panel || !v.keys[me.id]) throw new AccessError(); };
const canBeShared = (db: Db, personId: string) => {
  const p = db.people.find((x) => x.id === personId);
  return !!p?.active && !!p.panel;
};
/** Only whoever shared a password decides who else gets it. */
const ownShared = (db: Db, me: Person, vaultId: string) => {
  const v = vaultOf(db, vaultId);
  if (v.kind !== "shared") throw new ValidationError("Only shared passwords can be shared");
  if (v.createdBy !== me.id || !me.active) throw new AccessError();
  return v;
};

/** "shared a password with you" — never its name: titles are encrypted, so the store can't (and mustn't) read them. */
const shareNotices = (db: Db, me: Person, counts: Map<string, number>): Notification[] =>
  [...counts].filter(([pid]) => pid !== me.id).map(([pid, n]) => ({
    id: id(), personId: pid, kind: "vault" as const, actorId: me.id, target: "/vault", at: now(), read: false,
    text: `${n === 1 ? "shared a password" : `shared ${n} passwords`} with you${db.vaultAccounts[pid] ? "" : " — set up your vault to open it"}`,
  }));

export function setupVault(db: Db, me: Person, account: VaultAccount, personalVaultId: string, myWrappedKey: string): Db {
  teammate(me);
  if (db.vaultAccounts[me.id]) throw new ValidationError("Your vault is already set up");
  fail(typeof personalVaultId === "string" && personalVaultId && !db.vaults.some((v) => v.id === personalVaultId) ? null : "That vault id is taken");
  const personal: VaultRecord = {
    id: personalVaultId, kind: "personal", ownerId: me.id, keys: { [me.id]: blob("Your key", myWrappedKey) }, createdBy: me.id, createdAt: today(),
  };
  return { ...db, vaultAccounts: { ...db.vaultAccounts, [me.id]: accountOf(account) }, vaults: [...db.vaults, personal] };
}

/**
 * A new master password: the same private key, locked again with it (the browser opened it with the old password, or
 * with the recovery code after the emailed link). The public key and the recovery copy don't change.
 */
export function rewrapVault(db: Db, me: Person, wrap: Pick<VaultAccount, "salt" | "iterations" | "iv" | "wrappedPrivateKey">): Db {
  teammate(me);
  const cur = db.vaultAccounts[me.id];
  if (!cur) throw new ValidationError("Set up your vault first");
  return { ...db, vaultAccounts: { ...db.vaultAccounts, [me.id]: { ...cur, ...passwordWrapOf(wrap) } } };
}

export interface ShareInput {
  vaultId: string; // new shared vault, one per password
  item: { id: string; iv: string; ciphertext: string }; // re-encrypted with that vault's own key
  keys: Record<string, string>; // you + everyone who already has a vault
  invited: string[]; // people without a vault yet — they get it once they set one up
}

/** Share passwords: each becomes its own shared vault for the chosen people, and leaves your Personal vault (`fromItemIds`). */
export function shareItems(db: Db, me: Person, shares: ShareInput[], fromItemIds: string[]): Db {
  if (!me.active || !me.panel || !db.vaultAccounts[me.id]) throw new AccessError();
  const personal = db.vaults.find((v) => v.kind === "personal" && v.ownerId === me.id);
  for (const itemId of fromItemIds) {
    if (!db.vaultItems.some((i) => i.id === itemId && i.vaultId === personal?.id)) throw new ValidationError("You can only share your own passwords");
  }
  for (const sh of shares) {
    const keys = keysOf(sh.keys);
    if (!keys[me.id]) throw new ValidationError("You must keep access to what you share");
    for (const pid of Object.keys(keys)) {
      if (!canBeShared(db, pid)) throw new AccessError();
      if (!db.vaultAccounts[pid]) throw new ValidationError("Invite people who haven't set up their vault instead");
    }
    if ((sh.invited ?? []).some((pid) => !canBeShared(db, pid) || keys[pid])) throw new ValidationError("Invite only people without access");
    fail(db.vaults.some((v) => v.id === sh.vaultId) || db.vaultItems.some((i) => i.id === sh.item?.id) ? "That id is taken" : null);
  }
  const vaults: VaultRecord[] = shares.map((sh) => ({
    id: sh.vaultId, kind: "shared", keys: keysOf(sh.keys), invited: [...new Set(sh.invited ?? [])], createdBy: me.id, createdAt: today(),
  }));
  const items = shares.map((sh) => ({
    id: sh.item.id, vaultId: sh.vaultId, iv: blob("The IV", sh.item.iv), ciphertext: blob("The item", sh.item.ciphertext, MAX_ITEM), updatedBy: me.id, updatedAt: now(),
  }));
  const moved = new Set(fromItemIds);
  // Everyone it was shared with hears about it once, with how many passwords.
  const counts = new Map<string, number>();
  for (const sh of shares) for (const pid of new Set([...Object.keys(sh.keys), ...(sh.invited ?? [])])) counts.set(pid, (counts.get(pid) ?? 0) + 1);
  return {
    ...db, vaults: [...db.vaults, ...vaults], vaultItems: [...db.vaultItems.filter((i) => !moved.has(i.id)), ...items],
    notifications: [...shareNotices(db, me, counts), ...db.notifications],
  };
}

/** Give one more person a shared password: its key encrypted with their public key (the owner, or finishing an invite). */
export function grantVault(db: Db, me: Person, vaultId: string, personId: string, wrappedKey: string): Db {
  const v = vaultOf(db, vaultId);
  if (v.kind === "personal") throw new ValidationError("Personal vaults can't be shared");
  holdsKey(v, me);
  const person = personOf(db, personId);
  if (!db.vaultAccounts[personId]) throw new ValidationError(`${person.name} hasn't set up their vault yet`);
  if (!canBeShared(db, personId)) throw new AccessError();
  const wasInvited = (v.invited ?? []).includes(personId);
  if (v.createdBy !== me.id && !wasInvited) throw new AccessError();
  const key = blob("Their key", wrappedKey);
  return {
    ...db,
    vaults: replace(db.vaults, (x) => x.id === vaultId, (x) => ({ ...x, keys: { ...x.keys, [personId]: key }, invited: (x.invited ?? []).filter((p) => p !== personId) })),
    // Finishing an invite isn't news — they heard when they were invited.
    notifications: wasInvited ? db.notifications : [...shareNotices(db, me, new Map([[personId, 1]])), ...db.notifications],
  };
}

/** Share with someone who hasn't set up their vault yet: they get it the moment they do. */
export function inviteToVault(db: Db, me: Person, vaultId: string, personId: string): Db {
  const v = ownShared(db, me, vaultId);
  if (!canBeShared(db, personId)) throw new AccessError();
  if (v.keys[personId]) throw new ValidationError("They already have access");
  const invited = [...new Set([...(v.invited ?? []), personId])];
  return {
    ...db, vaults: replace(db.vaults, (x) => x.id === vaultId, (x) => ({ ...x, invited })),
    notifications: [...shareNotices(db, me, new Map([[personId, 1]])), ...db.notifications],
  };
}

export function cancelVaultInvite(db: Db, me: Person, vaultId: string, personId: string): Db {
  ownShared(db, me, vaultId);
  return { ...db, vaults: replace(db.vaults, (x) => x.id === vaultId, (x) => ({ ...x, invited: (x.invited ?? []).filter((p) => p !== personId) })) };
}

/** Remove people properly: a brand-new key for whoever keeps access, and the password re-encrypted with it — so a
 *  removed person can't read it even from an old copy. One step or nothing. */
export function rekeyVault(db: Db, me: Person, vaultId: string, keys: Record<string, string>, items: { id: string; iv: string; ciphertext: string }[]): Db {
  const v = ownShared(db, me, vaultId);
  holdsKey(v, me);
  const next = keysOf(keys);
  if (!next[me.id]) throw new ValidationError("You must keep access to what you shared");
  if (Object.keys(next).some((pid) => !canBeShared(db, pid))) throw new AccessError();
  const current = db.vaultItems.filter((i) => i.vaultId === vaultId).map((i) => i.id).sort();
  if (current.join() !== (items ?? []).map((i) => i.id).sort().join()) throw new ValidationError("Every item must be re-encrypted");
  const sealed = new Map(items.map((i) => [i.id, { iv: blob("The IV", i.iv), ciphertext: blob("The item", i.ciphertext, MAX_ITEM) }]));
  return {
    ...db,
    vaults: replace(db.vaults, (x) => x.id === vaultId, (x) => ({ ...x, keys: next })),
    vaultItems: db.vaultItems.map((i) => (i.vaultId === vaultId ? { ...i, ...sealed.get(i.id)! } : i)),
  };
}

export function upsertVaultItem(db: Db, me: Person, item: { id: string; vaultId: string; iv: string; ciphertext: string }): Db {
  holdsKey(vaultOf(db, item.vaultId), me);
  fail(typeof item.id === "string" && item.id ? null : "That item id isn't valid");
  const record = { id: item.id, vaultId: item.vaultId, iv: blob("The IV", item.iv), ciphertext: blob("The item", item.ciphertext, MAX_ITEM), updatedBy: me.id, updatedAt: now() };
  const exists = db.vaultItems.find((i) => i.id === item.id);
  fail(exists && exists.vaultId !== item.vaultId ? "That item is in another vault" : null);
  return { ...db, vaultItems: exists ? replace(db.vaultItems, (i) => i.id === item.id, () => record) : [...db.vaultItems, record] };
}

/** Personal: delete the item. Shared: only whoever shared it can, and it goes for everyone. */
export function deleteVaultItem(db: Db, me: Person, itemId: string): Db {
  const item = db.vaultItems.find((i) => i.id === itemId);
  if (!item) throw new ValidationError("Item not found");
  const v = vaultOf(db, item.vaultId);
  holdsKey(v, me);
  if (v.kind === "shared") {
    if (v.createdBy !== me.id) throw new AccessError();
    return { ...db, vaults: db.vaults.filter((x) => x.id !== v.id), vaultItems: db.vaultItems.filter((i) => i.vaultId !== v.id) };
  }
  return { ...db, vaultItems: db.vaultItems.filter((i) => i.id !== itemId) };
}

/** Lost the master password and the recovery code: your account, personal vault and its items go; shared passwords stay
 *  for the others (re-shared to you once you set up again). */
/** What a person types to delete their vault — checked here too, so nothing wipes a vault by accident. */
export const RESET_PHRASE = "delete my vault";

export function resetVault(db: Db, me: Person, phrase: string): Db {
  teammate(me);
  if (typeof phrase !== "string" || phrase.trim().toLowerCase() !== RESET_PHRASE) throw new ValidationError(`Type "${RESET_PHRASE}" to delete your vault`);
  const mine = new Set(db.vaults.filter((v) => v.kind === "personal" && v.ownerId === me.id).map((v) => v.id));
  const vaultAccounts = { ...db.vaultAccounts };
  delete vaultAccounts[me.id];
  return {
    ...db,
    vaultAccounts,
    vaults: db.vaults.filter((v) => !mine.has(v.id)).map((v) => dropKey(v, me.id)),
    vaultItems: db.vaultItems.filter((i) => !mine.has(i.vaultId)),
  };
}

/** The vault commands — their arguments are blobs and keys, kept out of the audit log (server/journal.ts). */
export const VAULT_COMMANDS = new Set(["setupVault", "rewrapVault", "shareItems", "grantVault", "inviteToVault", "cancelVaultInvite", "rekeyVault", "upsertVaultItem", "deleteVaultItem", "resetVault"]);
