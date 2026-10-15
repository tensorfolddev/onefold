"use client";

// The client store: the signed-in company's data in memory, saved to this browser (data/storage.ts) and changed only
// through named domain commands (`run`). Sign-up, sign-in and invites live here too — they decide which company loads.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { today } from "../domain/clock.ts";
import { commands, AccessError, ValidationError, acceptInvite as acceptInviteCmd, inviteProblem, signUp, type CommandName, type Commands } from "../domain/commands/index.ts";
import { can as canFor, type Action, type Ctx } from "../domain/permissions.ts";
import { DEMO_PASSWORD, org as demoOrg } from "../domain/seed.ts";
import type { Panel, Person } from "../domain/types.ts";
import { Toaster, type ToastItem } from "../ui/Toast.tsx";
import { makeLookups, type Db, type Lookups } from "./db.ts";
import { demoDb } from "./demo.ts";
import { hashPassword, verifyPassword } from "./passwords.ts";
import { formatSession, isPublicPath, PANEL_SLUG, panelHome, parseSession, SESSION_COOKIE, SESSION_MAX_AGE_S, type Session } from "./session.ts";
import { loadOrg, orgsWithEmail, orgWithInvite, saveOrg, slugTaken, storageKeyFor } from "./storage.ts";

type Tail<T> = T extends [unknown, unknown, ...infer R] ? R : never;
type KeyOf<R> = R extends { key: infer K } ? K : true;
export interface RunOptions { success?: string; undoable?: boolean }
type ActResult<K> = Db | { db: Db; key: K };

export interface Store extends Lookups {
  db: Db;
  me: Person;
  panel: Panel;
  /** "/products/AP" → "/dev/products/AP" for the signed-in panel. */
  href: (path: string) => string;
  can: (action: Action, ctx?: Ctx) => boolean;
  /** Run a named domain command as the signed-in person. Refusals and validation errors become toasts. */
  run: <N extends CommandName>(name: N, args: Tail<Parameters<Commands[N]>>, opts?: RunOptions) => KeyOf<ReturnType<Commands[N]>> | undefined;
  /** Compose several commands into one change (one Undo). Only call `commands` inside. */
  act: <K = never>(fn: (db: Db, me: Person) => ActResult<K>, opts?: RunOptions) => K | true | undefined;
  toast: (message: string, undo?: () => void) => void;
  signOut: () => void;
  /** True in the demo company ("Explore the demo"). */
  isDemo: boolean;
  /** Demo company only: put the demo back the way it started. */
  resetDemo: () => Promise<void>;
}

export type SignInResult =
  | { ok: true; home: string }
  | { ok: false; error: string }
  | { ok: "choose"; companies: { slug: string; name: string }[] };

export interface Auth {
  ready: boolean;
  session: Session | null;
  signIn: (email: string, password: string, slug?: string) => Promise<SignInResult>;
  createCompany: (input: { name: string; email: string; password: string; company: string; slug: string }) => Promise<{ ok: true; home: string } | { ok: false; error: string }>;
  slugTaken: (slug: string) => boolean;
  lookupInvite: (token: string) => { db: Db | null; problem: string | null };
  acceptInvite: (token: string, name: string, password: string) => Promise<{ ok: true; home: string } | { ok: false; error: string }>;
  startDemo: (as: Panel) => Promise<string>;
  signOut: () => void;
}

const StoreCtx = createContext<{ store: Store | null; auth: Auth } | null>(null);
const TOAST_MS = 5000;
/** Who you are in the demo, per panel. */
const DEMO_AS: Record<Panel, string> = { admin: "u-tayyab", manager: "u-ayesha", developer: "u-sara" };

const readSession = (): Session | null =>
  parseSession(document.cookie.split("; ").find((c) => c.startsWith(`${SESSION_COOKIE}=`))?.split("=")[1]);
const writeSession = (s: Session | null) => {
  document.cookie = s
    ? `${SESSION_COOKIE}=${encodeURIComponent(formatSession(s))}; path=/; max-age=${SESSION_MAX_AGE_S}; samesite=lax${location.protocol === "https:" ? "; secure" : ""}`
    : `${SESSION_COOKIE}=; path=/; max-age=0; samesite=lax`;
};
const errorText = (e: unknown) => (e instanceof AccessError || e instanceof ValidationError ? e.message : "Something went wrong — please try again");

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [db, setDb] = useState<Db | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const dbRef = useRef<Db | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const toastId = useRef(0);
  const saveFailed = useRef(false);

  const dismiss = useCallback((id: number) => setToasts((ts) => ts.filter((t) => t.id !== id)), []);
  const toast = useCallback((message: string, undo?: () => void) => {
    const id = ++toastId.current;
    setToasts((ts) => [...ts.slice(-2), { id, message, undo }]);
    setTimeout(() => dismiss(id), TOAST_MS);
  }, [dismiss]);

  const persist = useCallback((next: Db) => {
    if (saveOrg(next)) { saveFailed.current = false; return; }
    if (!saveFailed.current) toast("Couldn't save — this browser's storage is full or blocked. Your changes last until you close the tab.");
    saveFailed.current = true;
  }, [toast]);

  // The browser holds the data, so the store loads after mount.
  useEffect(() => {
    const s = readSession();
    const loaded = s ? loadOrg(s.org) : null;
    const valid = s && loaded ? s : null;
    if (s && !valid) writeSession(null);
    sessionRef.current = valid;
    dbRef.current = loaded;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time load from browser storage
    setSession(valid);
    setDb(valid ? loaded : null);
    setReady(true);
  }, []);

  // Saving serialises everything: do it when the browser is idle, and always before the tab goes away.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const commit = useCallback((next: Db) => {
    dbRef.current = next;
    setDb(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const save = () => dbRef.current && persist(dbRef.current);
      if ("requestIdleCallback" in window) window.requestIdleCallback(save, { timeout: 1000 }); else save();
    }, 300);
  }, [persist]);
  useEffect(() => {
    const flush = () => { if (dbRef.current) persist(dbRef.current); };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", flush);
    return () => { window.removeEventListener("pagehide", flush); document.removeEventListener("visibilitychange", flush); };
  }, [persist]);
  // Another tab changed this company: pick it up.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      const s = sessionRef.current;
      if (!s || e.key !== storageKeyFor(s.org)) return;
      const fresh = loadOrg(s.org);
      if (fresh) { dbRef.current = fresh; setDb(fresh); }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const begin = useCallback((next: Db, person: Person) => {
    const s: Session = { org: next.org.slug, personId: person.id, panel: person.panel! };
    sessionRef.current = s;
    writeSession(s);
    dbRef.current = next;
    setSession(s);
    setDb(next);
    return panelHome(person.panel!);
  }, []);

  const signOut = useCallback(() => {
    if (dbRef.current) persist(dbRef.current);
    sessionRef.current = null;
    writeSession(null);
    setSession(null);
    dbRef.current = null;
    setDb(null);
    router.replace("/signin");
  }, [persist, router]);

  const me = useMemo(() => {
    const p = db && session ? db.people.find((x) => x.id === session.personId) : undefined;
    return p?.active && p.panel ? p : undefined;
  }, [db, session]);

  // Keep the session honest when data changes under it (person removed, deactivated, or moved to another panel).
  useEffect(() => {
    if (!ready || !session || !db || isPublicPath(pathname)) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reacts to the data changing under the session (removed or turned off)
    if (!me) { signOut(); return; }
    if (me.panel !== session.panel) {
      const s = { ...session, panel: me.panel! };
      sessionRef.current = s;
      writeSession(s);
      router.replace(panelHome(me.panel!));
    }
  }, [ready, session, db, me, pathname, router, signOut]);

  const act = useCallback(<K,>(fn: (db: Db, me: Person) => ActResult<K>, opts: RunOptions = {}) => {
    const cur = dbRef.current;
    const actor = cur?.people.find((p) => p.id === sessionRef.current?.personId);
    if (!cur || !actor) return undefined;
    try {
      const res = fn(cur, actor);
      const isKeyed = "key" in res && "db" in res;
      commit(isKeyed ? res.db : (res as Db));
      // Only the latest change can be undone: an older Undo would silently throw away everything after it.
      setToasts((ts) => (ts.some((t) => t.undo) ? ts.map((t) => (t.undo ? { ...t, undo: undefined } : t)) : ts));
      if (opts.success) toast(opts.success, opts.undoable ? () => commit(cur) : undefined);
      return isKeyed ? res.key : (true as const);
    } catch (e) {
      if (e instanceof AccessError || e instanceof ValidationError) { toast(e.message); return undefined; }
      throw e;
    }
  }, [commit, toast]);

  const run = useCallback(<N extends CommandName>(name: N, args: Tail<Parameters<Commands[N]>>, opts?: RunOptions) => {
    const command = commands[name] as unknown as (db: Db, me: Person, ...rest: unknown[]) => ActResult<unknown>;
    return act((d, m) => command(d, m, ...(args as unknown[])), opts) as KeyOf<ReturnType<Commands[N]>> | undefined;
  }, [act]);

  // ---------- auth ----------
  const signIn = useCallback(async (email: string, password: string, slug?: string): Promise<SignInResult> => {
    const e = email.trim().toLowerCase();
    const candidates = orgsWithEmail(e).filter((d) => !slug || d.org.slug === slug);
    const matches: { db: Db; person: Person }[] = [];
    for (const d of candidates) {
      const person = d.people.find((p) => p.email === e)!;
      if (await verifyPassword(password, person)) matches.push({ db: d, person });
    }
    if (!matches.length) return { ok: false, error: "Wrong email or password" };
    if (matches.length > 1) return { ok: "choose", companies: matches.map((m) => ({ slug: m.db.org.slug, name: m.db.org.name })) };
    const { db: d, person } = matches[0];
    if (!person.active) return { ok: false, error: "Your account is turned off — ask your admin" };
    if (!person.panel) return { ok: false, error: "This account can't sign in" };
    return { ok: true, home: begin(d, person) };
  }, [begin]);

  const createCompany = useCallback(async (input: { name: string; email: string; password: string; company: string; slug: string }) => {
    try {
      const credential = await hashPassword(input.password);
      const { db: fresh, founder } = signUp({ ...input, credential }, slugTaken);
      if (!saveOrg(fresh)) return { ok: false as const, error: "This browser won't let 1Fold save data (private mode or storage full)." };
      return { ok: true as const, home: begin(fresh, founder) };
    } catch (e) {
      return { ok: false as const, error: errorText(e) };
    }
  }, [begin]);

  const lookupInvite = useCallback((token: string) => {
    const d = orgWithInvite(token);
    return { db: d, problem: d ? inviteProblem(d, token) : "This invite link isn't valid." };
  }, []);

  const acceptInvite = useCallback(async (token: string, name: string, password: string) => {
    try {
      const d = orgWithInvite(token);
      if (!d) return { ok: false as const, error: "This invite link isn't valid." };
      const credential = await hashPassword(password);
      const { db: next, person } = acceptInviteCmd(d, token, { name, credential });
      if (!saveOrg(next)) return { ok: false as const, error: "This browser won't let 1Fold save data (private mode or storage full)." };
      return { ok: true as const, home: begin(next, person) };
    } catch (e) {
      return { ok: false as const, error: errorText(e) };
    }
  }, [begin]);

  const buildDemo = useCallback(async () => demoDb(await hashPassword(DEMO_PASSWORD), today()), []);
  const startDemo = useCallback(async (as: Panel) => {
    const d = loadOrg(demoOrg.slug) ?? await buildDemo();
    saveOrg(d);
    return begin(d, d.people.find((p) => p.id === DEMO_AS[as])!);
  }, [begin, buildDemo]);
  const resetDemo = useCallback(async () => {
    if (dbRef.current?.org.slug !== demoOrg.slug) return;
    commit(await buildDemo());
    toast("Demo data reset");
  }, [buildDemo, commit, toast]);

  const auth: Auth = useMemo(() => ({
    ready, session, signIn, createCompany, slugTaken, lookupInvite, acceptInvite, startDemo, signOut,
  }), [ready, session, signIn, createCompany, lookupInvite, acceptInvite, startDemo, signOut]);

  const lookups = useMemo(() => (db ? makeLookups(db) : null), [db]);
  const store: Store | null = useMemo(() => {
    if (!db || !me || !lookups) return null;
    const panel = me.panel!;
    return {
      ...lookups, db, me, panel,
      href: (path: string) => `/${PANEL_SLUG[panel]}${path}`,
      can: (action, ctx = {}) => canFor(me, action, ctx),
      run, act, toast, signOut, resetDemo, isDemo: db.org.slug === demoOrg.slug,
    };
  }, [db, me, lookups, run, act, toast, signOut, resetDemo]);

  return (
    <StoreCtx.Provider value={{ store, auth }}>
      {children}
      <Toaster items={toasts} onDismiss={dismiss} />
    </StoreCtx.Provider>
  );
}

/** Signed-in screens. Throws outside the app (the panel layout only renders once someone is signed in). */
export function useDb(): Store {
  const ctx = useContext(StoreCtx);
  if (!ctx?.store) throw new Error("useDb needs a signed-in person — render inside the panel layout");
  return ctx.store;
}
export const useMe = useDb;

/** Sign-in, sign-up, invites and whether someone is signed in. Works everywhere. */
export function useAuth(): Auth & { signedIn: boolean } {
  const ctx = useContext(StoreCtx);
  if (!ctx) throw new Error("useAuth must be used inside <StoreProvider>");
  return { ...ctx.auth, signedIn: !!ctx.store };
}
