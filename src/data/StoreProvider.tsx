"use client";

// The client store: the signed-in person's view of their company, from the server (GET /api/org). A change runs here
// first for an instant result, then goes to the server as the steps it recorded (POST /api/org/changes), which
// replays them on the real data; afterwards the view is refetched, so the screen always ends up matching the server.
// Other people's changes arrive as live events. Sign-up, sign-in and invites call the server too.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { can as canFor, type Action, type Ctx } from "../domain/permissions.ts";
import type { Panel, Person } from "../domain/types.ts";
import { Toaster, type ToastItem } from "../ui/Toast.tsx";
import { api, ApiError } from "./api.ts";
import { AccessError, record, recorded, ValidationError, type CommandName, type Commands, type InviteInput, type Step } from "./commands.ts";
import { makeLookups, type Db, type Lookups } from "./db.ts";
import { isPublicPath, PANEL_SLUG, panelFromSlug, panelHome } from "./session.ts";

type Tail<T> = T extends [unknown, unknown, ...infer R] ? R : never;
type KeyOf<R> = R extends { key: infer K } ? K : true;
export interface RunOptions { success?: string; undoable?: boolean }
type ActResult<K> = Db | { db: Db; key: K };

export interface CreatedInvite { id: string; email: string; panel: Panel; role: string; link: string }

export interface Store extends Lookups {
  db: Db;
  me: Person;
  panel: Panel;
  /** "/products/AP" → "/dev/products/AP" for the signed-in panel. */
  href: (path: string) => string;
  can: (action: Action, ctx?: Ctx) => boolean;
  /** Run a named command as the signed-in person. Refusals and validation errors become toasts. */
  run: <N extends CommandName>(name: N, args: Tail<Parameters<Commands[N]>>, opts?: RunOptions) => KeyOf<ReturnType<Commands[N]>> | undefined;
  /** Compose several commands into one change (one server transaction, one Undo). Use commands from @/data/commands. */
  act: <K = never>(fn: (db: Db, me: Person) => ActResult<K>, opts?: RunOptions) => K | true | undefined;
  toast: (message: string, undo?: () => void) => void;
  signOut: () => void;
  /** Admins: make invite links. The server generates the secrets; each link is shown once. */
  createInvites: (invites: InviteInput[]) => Promise<CreatedInvite[]>;
  /** Your password, or (admins) a teammate's. Resolves to an error message, or null when it worked. */
  setPassword: (personId: string, password: string) => Promise<string | null>;
}

export type SignInResult =
  | { ok: true; home: string }
  | { ok: false; error: string }
  | { ok: "choose"; companies: { slug: string; name: string }[] };
type Outcome = { ok: true; home: string } | { ok: false; error: string };

export interface InviteView {
  problem: string | null; orgName?: string; inviterName?: string; email?: string; panel?: Panel; role?: string;
  /** The invited email already has a 1Fold login (another company): they confirm with that password. */
  hasLogin?: boolean;
}

export interface Auth {
  ready: boolean;
  signIn: (email: string, password: string, slug?: string) => Promise<SignInResult>;
  createCompany: (input: { name: string; email: string; password: string; company: string; slug: string }) => Promise<Outcome>;
  /** Why this short name can't be used ("taken", "reserved"…), or null if it's free. */
  checkSlug: (slug: string) => Promise<string | null>;
  lookupInvite: (token: string) => Promise<InviteView>;
  acceptInvite: (token: string, name: string, password: string) => Promise<Outcome>;
  signOut: () => void;
}

interface View { db: Db; version: number; meId: string; panel: Panel; orgSlug: string }

const StoreCtx = createContext<{ store: Store | null; auth: Auth } | null>(null);
const TOAST_MS = 5000;
const message = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong — please try again");

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const [view, setView] = useState<View | null>(null);
  const viewRef = useRef<View | null>(null);
  const pending = useRef(0); // changes sent but not yet answered
  const queue = useRef<Promise<void>>(Promise.resolve()); // the server gets changes in the order they were made
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const toastId = useRef(0);

  const dismiss = useCallback((id: number) => setToasts((ts) => ts.filter((t) => t.id !== id)), []);
  const toast = useCallback((text: string, undo?: () => void) => {
    const id = ++toastId.current;
    setToasts((ts) => [...ts.slice(-2), { id, message: text, undo }]);
    setTimeout(() => dismiss(id), TOAST_MS);
  }, [dismiss]);

  const show = useCallback((v: View | null) => { viewRef.current = v; setView(v); }, []);

  /** The server's view of the company. While changes are in flight it waits for them (they refetch when done). */
  const refresh = useCallback(async () => {
    try {
      const v = await api<View>("/api/org");
      if (pending.current === 0) show(v);
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) show(null); // signed out, or turned off
      else throw e;
    }
  }, [show]);
  const refreshOrSay = useCallback(() => refresh().catch((e: unknown) => toast(message(e))), [refresh, toast]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time load; state is set when the server answers
    refresh().catch((e: unknown) => toast(message(e))).finally(() => setReady(true));
  }, [refresh, toast]);

  // Other people's changes: a live event with the new version, or coming back to the tab.
  const orgId = view?.db.org.id;
  useEffect(() => {
    if (!orgId) return;
    const events = new EventSource("/api/org/events");
    events.addEventListener("version", (e) => {
      if (Number((e as MessageEvent).data) > (viewRef.current?.version ?? 0) && pending.current === 0) void refreshOrSay();
    });
    const onVisible = () => { if (document.visibilityState === "visible") void refreshOrSay(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { events.close(); document.removeEventListener("visibilitychange", onVisible); };
  }, [orgId, refreshOrSay]);

  // Moved to another panel by an admin (or opened a link to another panel): go to your own.
  useEffect(() => {
    if (!view || isPublicPath(pathname)) return;
    const panel = panelFromSlug(pathname.split("/")[1] ?? "");
    if (panel && panel !== view.panel) router.replace(panelHome(view.panel));
  }, [view, pathname, router]);

  /** Sends one change to the server, in order; a refusal puts the screen back to the server's version. */
  const send = useCallback((path: string, body: unknown) => {
    pending.current += 1;
    queue.current = queue.current.then(async () => {
      try {
        await api(path, body);
      } catch (e) {
        toast(message(e));
      } finally {
        pending.current -= 1;
        if (pending.current === 0) await refreshOrSay();
      }
    });
  }, [refreshOrSay, toast]);

  const undo = useCallback(() => send("/api/org/undo", {}), [send]);

  const act = useCallback(<K,>(fn: (db: Db, me: Person) => ActResult<K>, opts: RunOptions = {}) => {
    const cur = viewRef.current;
    const me = cur?.db.people.find((p) => p.id === cur.meId);
    if (!cur || !me) return undefined;
    let result: ActResult<K>;
    let steps: Step[];
    try {
      ({ result, steps } = record(() => fn(cur.db, me)));
    } catch (e) {
      if (e instanceof AccessError || e instanceof ValidationError) { toast(e.message); return undefined; }
      throw e;
    }
    if (!steps.length) {
      // A screen changed data without a recorded command, so the server would never hear of it.
      console.error("[store] change with no recorded commands — import commands from @/data/commands");
      toast("That change couldn't be saved — please refresh");
      return undefined;
    }
    const isKeyed = "key" in result && "db" in result;
    show({ ...cur, db: isKeyed ? (result as { db: Db }).db : (result as Db) });
    // Only the latest change can be undone.
    setToasts((ts) => (ts.some((t) => t.undo) ? ts.map((t) => (t.undo ? { ...t, undo: undefined } : t)) : ts));
    if (opts.success) toast(opts.success, opts.undoable ? undo : undefined);
    send("/api/org/changes", { steps, undoable: !!opts.undoable });
    return isKeyed ? (result as { key: K }).key : (true as const);
  }, [send, show, toast, undo]);

  const run = useCallback(<N extends CommandName>(name: N, args: Tail<Parameters<Commands[N]>>, opts?: RunOptions) => {
    const command = recorded[name] as unknown as (db: Db, me: Person, ...rest: unknown[]) => ActResult<unknown>;
    return act((d, m) => command(d, m, ...(args as unknown[])), opts) as KeyOf<ReturnType<Commands[N]>> | undefined;
  }, [act]);

  // ---------- accounts ----------

  const signedInTo = useCallback(async (home: string): Promise<Outcome> => {
    await refresh();
    return { ok: true, home };
  }, [refresh]);

  const signIn = useCallback(async (email: string, password: string, slug?: string): Promise<SignInResult> => {
    try {
      const r = await api<{ home?: string; choose?: { slug: string; name: string }[] }>("/api/auth/signin", { email, password, slug });
      return r.choose ? { ok: "choose", companies: r.choose } : signedInTo(r.home!);
    } catch (e) {
      return { ok: false, error: message(e) };
    }
  }, [signedInTo]);

  const createCompany = useCallback(async (input: { name: string; email: string; password: string; company: string; slug: string }): Promise<Outcome> => {
    try { return signedInTo((await api<{ home: string }>("/api/auth/signup", input)).home); } catch (e) { return { ok: false, error: message(e) }; }
  }, [signedInTo]);

  const checkSlug = useCallback(async (slug: string) => {
    try { return (await api<{ problem: string | null }>(`/api/auth/slug?s=${encodeURIComponent(slug)}`)).problem; }
    catch { return null; } // the server checks again on sign-up; don't block typing on a network blip
  }, []);

  const lookupInvite = useCallback(async (token: string): Promise<InviteView> => {
    try { return await api<InviteView>(`/api/invites/${encodeURIComponent(token)}`); } catch (e) { return { problem: message(e) }; }
  }, []);

  const acceptInvite = useCallback(async (token: string, name: string, password: string): Promise<Outcome> => {
    try { return signedInTo((await api<{ home: string }>(`/api/invites/${encodeURIComponent(token)}`, { name, password })).home); }
    catch (e) { return { ok: false, error: message(e) }; }
  }, [signedInTo]);

  const signOut = useCallback(async () => {
    try {
      await api("/api/auth/signout", {});
    } catch (e) {
      toast(`Couldn't sign out: ${message(e)}`);
      return;
    }
    show(null);
    router.replace("/signin");
  }, [router, show, toast]);

  const createInvites = useCallback(async (invites: InviteInput[]) => {
    const r = await api<{ invites: CreatedInvite[] }>("/api/org/invites", { invites });
    await refreshOrSay();
    return r.invites;
  }, [refreshOrSay]);

  const setPassword = useCallback(async (personId: string, password: string) => {
    try { await api("/api/org/password", { personId, password }); return null; } catch (e) { return message(e); }
  }, []);

  const auth: Auth = useMemo(() => ({ ready, signIn, createCompany, checkSlug, lookupInvite, acceptInvite, signOut }),
    [ready, signIn, createCompany, checkSlug, lookupInvite, acceptInvite, signOut]);

  const lookups = useMemo(() => (view ? makeLookups(view.db) : null), [view]);
  const store: Store | null = useMemo(() => {
    const me = view?.db.people.find((p) => p.id === view.meId);
    if (!view || !me || !lookups) return null;
    return {
      ...lookups, db: view.db, me, panel: view.panel,
      href: (path: string) => `/${PANEL_SLUG[view.panel]}${path}`,
      can: (action, ctx = {}) => canFor(me, action, ctx),
      run, act, toast, signOut, createInvites, setPassword,
    };
  }, [view, lookups, run, act, toast, signOut, createInvites, setPassword]);

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
