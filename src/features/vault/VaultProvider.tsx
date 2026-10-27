"use client";

// Keeps the unlocked keys in memory only (never in storage). Auto-locks after 10 min idle, on leaving the vault, on
// sign-out and on reload. All persistence goes through store commands as ciphertext — the one exception, a forgotten
// master password, goes through /api/vault (an emailed link, then the recovery code). From the first 1Fold.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/data/api";
import {
  cancelVaultInvite, deleteVaultItem, grantVault, inviteToVault, rekeyVault, resetVault, rewrapVault, setupVault, shareItems, upsertVaultItem,
} from "@/data/commands";
import { useDb } from "@/data/StoreProvider";
import type { ShareInput } from "@/domain/commands";
import type { VaultAccount } from "@/domain/types";
import {
  createAccount, grantVaultKey, newMasterPassword, newRecoveryCode, newVaultKey, openItem, openVaultKey, sealItem, unlockAccount, type VaultItemData,
} from "./crypto";

const IDLE_LOCK_MS = 10 * 60 * 1000;

type Status = "none" | "locked" | "unlocked";

interface VaultCtx {
  status: Status;
  /** Vault id → decrypted items (memory only, while unlocked). */
  items: Record<string, { id: string; data: VaultItemData; updatedBy: string; updatedAt: string }[]>;
  /** First time: the vault, and its recovery code — shown once, for them to keep (null: it couldn't be saved). */
  setup: (masterPassword: string) => Promise<string | null>;
  unlock: (masterPassword: string) => Promise<void>;
  /** A new master password, knowing the current one. */
  changePassword: (current: string, next: string) => Promise<boolean>;
  /** Forgot it: email me a link to reset it. */
  forgot: () => Promise<void>;
  /** With the emailed link: the recovery code opens the vault, and a new master password locks it again. */
  recover: (token: string, recoveryCode: string, next: string) => Promise<void>;
  lock: () => void;
  saveItem: (vaultId: string, data: VaultItemData, itemId?: string) => Promise<boolean>;
  removeItem: (itemId: string) => boolean;
  /** A new password straight into Shared: its own key, only you hold it until you share it. */
  createShared: (data: VaultItemData) => Promise<boolean>;
  /** Share passwords (one, several or all) with people. Personal ones move to Shared; your shared ones gain people. */
  share: (itemIds: string[], personIds: string[]) => Promise<boolean>;
  /** Share with one person (or invite them if they have no vault yet). */
  giveAccess: (vaultId: string, personId: string, quiet?: boolean) => Promise<boolean>;
  /** Take access away and re-key the vault so they can't read anything, even old copies. */
  removeAccess: (vaultId: string, personId: string) => Promise<boolean>;
  cancelInvite: (vaultId: string, personId: string) => boolean;
  reset: (phrase: string) => void;
}

const Ctx = createContext<VaultCtx | null>(null);
const newId = (p: string) => `${p}-${crypto.randomUUID().slice(0, 8)}`;

export function VaultProvider({ children }: { children: React.ReactNode }) {
  const { db, me, act, toast } = useDb();
  const stored = me ? db.vaultAccounts[me.id] : undefined;
  // Just recovered: the new lock, until this tab's data catches up — so the old master password stops working at once.
  const [recovered, setRecovered] = useState<{ was: string; now: VaultAccount } | null>(null);
  const account = recovered && stored?.wrappedPrivateKey === recovered.was ? recovered.now : stored;
  const [privateKey, setPrivateKey] = useState<CryptoKey | null>(null);
  const [vaultKeys, setVaultKeys] = useState<Map<string, CryptoKey>>(new Map());
  const [items, setItems] = useState<VaultCtx["items"]>({});
  const idle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const status: Status = !account ? "none" : privateKey ? "unlocked" : "locked";

  const lock = useCallback(() => {
    setPrivateKey(null);
    setVaultKeys(new Map());
    setItems({});
  }, []);

  // Auto-lock after inactivity.
  useEffect(() => {
    if (status !== "unlocked") return;
    const arm = () => {
      if (idle.current) clearTimeout(idle.current);
      idle.current = setTimeout(lock, IDLE_LOCK_MS);
    };
    arm();
    const events = ["pointerdown", "keydown"] as const;
    events.forEach((e) => window.addEventListener(e, arm, { passive: true }));
    return () => {
      if (idle.current) clearTimeout(idle.current);
      events.forEach((e) => window.removeEventListener(e, arm));
    };
  }, [status, lock]);

  // Open every vault key I hold; share product vaults with members who are still waiting for one.
  const openKeys = useCallback(async (pk: CryptoKey) => {
    if (!me) return new Map<string, CryptoKey>();
    const keys = new Map<string, CryptoKey>();
    for (const v of db.vaults) {
      const wrapped = v.keys[me.id];
      if (!wrapped) continue;
      try { keys.set(v.id, await openVaultKey(wrapped, pk)); } catch { /* corrupt entry: skip that vault */ }
    }
    // Finish invitations for people who have set up their vault since a password was shared with them.
    for (const v of db.vaults.filter((x) => x.kind === "shared" && keys.has(x.id))) {
      const pending = db.people.filter((p) => (v.invited ?? []).includes(p.id) && p.active && db.vaultAccounts[p.id]);
      for (const p of pending) {
        const wrapped = await grantVaultKey(keys.get(v.id)!, db.vaultAccounts[p.id].publicKey);
        act((d, m) => grantVault(d, m, v.id, p.id, wrapped));
      }
    }
    return keys;
  }, [db, me, act]);

  // Decrypt items of the vaults I can open (re-runs when items change while unlocked).
  useEffect(() => {
    if (status !== "unlocked") return;
    let cancelled = false;
    (async () => {
      const next: VaultCtx["items"] = {};
      for (const [vaultId, key] of vaultKeys) {
        const rows = db.vaultItems.filter((i) => i.vaultId === vaultId);
        next[vaultId] = [];
        for (const r of rows) {
          try { next[vaultId].push({ id: r.id, data: await openItem(key, r), updatedBy: r.updatedBy, updatedAt: r.updatedAt }); }
          catch { /* tampered / unreadable item: leave it out */ }
        }
      }
      if (!cancelled) setItems(next);
    })();
    return () => { cancelled = true; };
  }, [status, vaultKeys, db.vaultItems]);

  const setup = useCallback(async (masterPassword: string) => {
    const code = newRecoveryCode();
    const { account: acct, privateKey: pk } = await createAccount(masterPassword, code);
    const personalKey = await newVaultKey();
    const vaultId = newId("v");
    const wrapped = await grantVaultKey(personalKey, acct.publicKey);
    if (!act((d, m) => setupVault(d, m, acct, vaultId, wrapped))) return null;
    setPrivateKey(pk);
    setVaultKeys(new Map([[vaultId, personalKey]]));
    return code;
  }, [act]);

  const changePassword = useCallback(async (current: string, next: string) => {
    if (!account) return false;
    const { wrap } = await newMasterPassword(account, { password: current }, next); // throws WrongPasswordError
    return !!act((d, m) => rewrapVault(d, m, wrap), { success: "Master password changed" });
  }, [account, act]);

  const forgot = useCallback(async () => { await api("/api/vault/forgot", {}); }, []);

  const recover = useCallback(async (token: string, recoveryCode: string, next: string) => {
    if (!account) return;
    const { wrap, privateKey: pk } = await newMasterPassword(account, { recoveryCode }, next); // throws WrongRecoveryCodeError
    await api("/api/vault/recover", { token, wrap }); // the link is used up here
    setRecovered({ was: account.wrappedPrivateKey, now: { ...account, ...wrap } });
    setPrivateKey(pk);
    setVaultKeys(await openKeys(pk));
  }, [account, openKeys]);

  const unlock = useCallback(async (masterPassword: string) => {
    if (!account) return;
    const pk = await unlockAccount(account, masterPassword); // throws WrongPasswordError
    const keys = await openKeys(pk);
    setPrivateKey(pk);
    setVaultKeys(keys);
  }, [account, openKeys]);

  const saveItem = useCallback(async (vaultId: string, data: VaultItemData, itemId?: string) => {
    const key = vaultKeys.get(vaultId);
    if (!key) return false;
    const sealed = await sealItem(key, data);
    return !!act((d, m) => upsertVaultItem(d, m, { id: itemId ?? newId("i"), vaultId, ...sealed }), { success: itemId ? "Item updated" : "Item saved" });
  }, [vaultKeys, act]);

  const removeItem = useCallback(
    (itemId: string) => !!act((d, m) => deleteVaultItem(d, m, itemId), { success: "Item deleted", undoable: true }),
    [act],
  );

  const createShared = useCallback(async (data: VaultItemData) => {
    if (!me || !account) return false;
    const key = await newVaultKey();
    const vaultId = newId("v");
    const sealed = await sealItem(key, data);
    const keys = { [me.id]: await grantVaultKey(key, account.publicKey) };
    if (!act((d, m) => shareItems(d, m, [{ vaultId, item: { id: newId("i"), ...sealed }, keys, invited: [] }], []), { success: "Shared password saved — share it with people from its row" })) return false;
    setVaultKeys((cur) => new Map(cur).set(vaultId, key));
    return true;
  }, [me, account, act]);

  const giveAccess = useCallback(async (vaultId: string, personId: string, quiet = false) => {
    const key = vaultKeys.get(vaultId);
    const theirs = db.vaultAccounts[personId];
    if (!theirs) return !!act((d, m) => inviteToVault(d, m, vaultId, personId), quiet ? {} : { success: "Invited — they get access when they set up their vault" });
    if (!key) return false;
    const wrapped = await grantVaultKey(key, theirs.publicKey);
    return !!act((d, m) => grantVault(d, m, vaultId, personId, wrapped), quiet ? {} : { success: "Access given" });
  }, [vaultKeys, db.vaultAccounts, act]);

  const share = useCallback(async (itemIds: string[], personIds: string[]) => {
    if (!me || !account || !personIds.length) return false;
    const personal = db.vaults.find((v) => v.kind === "personal" && v.ownerId === me.id);
    const rows = db.vaultItems.filter((i) => itemIds.includes(i.id));
    const fromPersonal = rows.filter((i) => i.vaultId === personal?.id);
    const alreadyShared = rows.filter((i) => i.vaultId !== personal?.id);
    // Each personal password becomes its own shared vault with a fresh key, sealed for exactly these people.
    const shares: ShareInput[] = [];
    const fresh = new Map<string, CryptoKey>();
    for (const row of fromPersonal) {
      const oldKey = vaultKeys.get(row.vaultId);
      if (!oldKey) return false;
      const key = await newVaultKey();
      const vaultId = newId("v");
      const keys: Record<string, string> = { [me.id]: await grantVaultKey(key, account.publicKey) };
      const invited: string[] = [];
      for (const pid of personIds) {
        if (pid === me.id) continue;
        if (db.vaultAccounts[pid]) keys[pid] = await grantVaultKey(key, db.vaultAccounts[pid].publicKey);
        else invited.push(pid);
      }
      shares.push({ vaultId, item: { id: newId("i"), ...(await sealItem(key, await openItem(oldKey, row))) }, keys, invited });
      fresh.set(vaultId, key);
    }
    if (shares.length && !act((d, m) => shareItems(d, m, shares, fromPersonal.map((i) => i.id)))) return false;
    if (fresh.size) setVaultKeys((cur) => new Map([...cur, ...fresh]));
    // Passwords you already shared: just add the new people.
    for (const row of alreadyShared) {
      const v = db.vaults.find((x) => x.id === row.vaultId);
      for (const pid of personIds) if (v && pid !== me.id && !v.keys[pid] && !(v.invited ?? []).includes(pid)) await giveAccess(v.id, pid, true);
    }
    const n = rows.length;
    toast(`Shared ${n === 1 ? "1 password" : `${n} passwords`} with ${personIds.length === 1 ? "1 person" : `${personIds.length} people`}`);
    return true;
  }, [me, account, db.vaults, db.vaultItems, db.vaultAccounts, vaultKeys, act, toast, giveAccess]);

  const removeAccess = useCallback(async (vaultId: string, personId: string) => {
    const oldKey = vaultKeys.get(vaultId);
    const vault = db.vaults.find((v) => v.id === vaultId);
    if (!oldKey || !vault) return false;
    const fresh = await newVaultKey();
    const keys: Record<string, string> = {};
    for (const pid of Object.keys(vault.keys)) {
      if (pid === personId || !db.vaultAccounts[pid]) continue;
      keys[pid] = await grantVaultKey(fresh, db.vaultAccounts[pid].publicKey);
    }
    const items: { id: string; iv: string; ciphertext: string }[] = [];
    for (const it of db.vaultItems.filter((i) => i.vaultId === vaultId)) {
      items.push({ id: it.id, ...(await sealItem(fresh, await openItem(oldKey, it))) });
    }
    if (!act((d, m) => rekeyVault(d, m, vaultId, keys, items), { success: "Access removed — vault re-encrypted" })) return false;
    setVaultKeys((cur) => new Map(cur).set(vaultId, fresh));
    return true;
  }, [vaultKeys, db.vaults, db.vaultAccounts, db.vaultItems, act]);

  const cancelInvite = useCallback(
    (vaultId: string, personId: string) => !!act((d, m) => cancelVaultInvite(d, m, vaultId, personId), { success: "Invite cancelled" }),
    [act],
  );

  const reset = useCallback((phrase: string) => {
    lock();
    act((d, m) => resetVault(d, m, phrase), { success: "Vault deleted — set it up again" });
  }, [act, lock]);

  const value = useMemo<VaultCtx>(
    () => ({ status, items, setup, unlock, changePassword, forgot, recover, lock, saveItem, removeItem, createShared, share, giveAccess, removeAccess, cancelInvite, reset }),
    [status, items, setup, unlock, changePassword, forgot, recover, lock, saveItem, removeItem, createShared, share, giveAccess, removeAccess, cancelInvite, reset],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useVault() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useVault must be used inside <VaultProvider>");
  return ctx;
}
