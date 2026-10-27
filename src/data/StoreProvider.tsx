"use client";

// The client store: the signed-in person's view of their company, from the server (GET /api/org). A change runs here
// first for an instant result, then goes to the server as the steps it recorded (POST /api/org/changes), which
// replays them on the real data; afterwards the view is refetched, so the screen always ends up matching the server.
// Other people's changes arrive as live events. Sign-up, sign-in and invites call the server too.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { can as canFor, type Action, type Ctx } from "../domain/permissions.ts";
import type { Panel, Person, Ticket } from "../domain/types.ts";
import { cheer, finished } from "../domain/selectors/celebrate.ts";
import { celebrate } from "../ui/celebrate.ts";
import { Toaster, type ToastItem, type ToastTone } from "../ui/Toast.tsx";
import { api, ApiError, upload } from "./api.ts";
import { AccessError, record, recorded, ValidationError, type CommandName, type Commands, type InviteInput, type Step } from "./commands.ts";
import { makeLookups, type Db, type Lookups } from "./db.ts";
import { isPublicPath, PANEL_SLUG, panelFromSlug, panelHome } from "./session.ts";

type Tail<T> = T extends [unknown, unknown, ...infer R] ? R : never;
type KeyOf<R> = R extends { key: infer K } ? K : true;
export interface RunOptions { success?: string; undoable?: boolean }
type ActResult<K> = Db | { db: Db; key: K };

export interface CreatedInvite { id: string; email: string; panel: Panel; role: string; link: string; emailed: boolean }

export interface Store extends Lookups {
  /** The company as screens show it: archived tickets left out of every board, list and count. */
  db: Db;
  /** Archived tickets (admins and managers only — developers never receive them): product Settings → Archived. */
  archivedTickets: Ticket[];
  me: Person;
  panel: Panel;
  /** "/products/AP" → "/dev/products/AP" for the signed-in panel. */
  href: (path: string) => string;
  can: (action: Action, ctx?: Ctx) => boolean;
  /** Run a named command as the signed-in person. Refusals and validation errors become toasts. */
  run: <N extends CommandName>(name: N, args: Tail<Parameters<Commands[N]>>, opts?: RunOptions) => KeyOf<ReturnType<Commands[N]>> | undefined;
  /** Compose several commands into one change (one server transaction, one Undo). Use commands from @/data/commands. */
  act: <K = never>(fn: (db: Db, me: Person) => ActResult<K>, opts?: RunOptions) => K | true | undefined;
  toast: (message: string, undo?: () => void, tone?: ToastTone) => void;
  signOut: () => void;
  /** Admins: make invite links. The server generates the secrets; each link is shown once. */
  createInvites: (invites: InviteInput[]) => Promise<CreatedInvite[]>;
  /** Your password, or (admins) a teammate's. Resolves to an error message, or null when it worked. */
  setPassword: (personId: string, password: string) => Promise<string | null>;
  /** Your email isn't confirmed yet (only when email is set up) — invites wait until it is. */
  emailUnverified: boolean;
  /** Emails you a new "confirm your email" link. Resolves to an error message, or null when it was sent. */
  sendVerification: () => Promise<string | null>;
  /** Uploads an image onto a ticket (after any changes still on their way). Resolves to an error message, or null. */
  uploadImage: (ticketKey: string, file: Blob, name: string) => Promise<string | null>;
  /** Uploads a (square, small) image as someone's photo; resolves to an error message, or null when it's theirs. */
  uploadPhoto: (personId: string, file: Blob) => Promise<string | null>;
  /** Makes a doc (and its first body) after any changes still on their way. Resolves to its id, or null (said in a toast). */
  createDoc: (input: NewDocInput) => Promise<string | null>;
  /** Adds someone already in the company to a product by their email. Resolves to their name, or null (said in a toast). */
  addMemberByEmail: (productKey: string, email: string) => Promise<string | null>;
}

export interface NewDocInput { title: string; productKey?: string; parentId?: string; groupId?: string; template?: string; icon?: string; body?: string; personal?: boolean }

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

interface View { db: Db; version: number; meId: string; panel: Panel; orgSlug: string; emailUnverified: boolean; build?: string }

const StoreCtx = createContext<{ store: Store | null; auth: Auth } | null>(null);
/** The commit this page was built from (set by the Docker build); the server says which one it runs. */
const BUILD = process.env.NEXT_PUBLIC_GIT_SHA ?? "dev";
const TOAST_MS = 5000;
const RECONNECT_MS = 1000; // live updates: the first wait before opening the connection again, doubling to
const RECONNECT_MAX_MS = 30_000;
const message = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong — please try again");


/** While a change is still on its way to the server, <html data-saving> says so (the e2e tests wait for it before leaving a page). */
const markSaving = (pending: number) => document.documentElement.toggleAttribute("data-saving", pending > 0);

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
  const toldNewVersion = useRef(false);

  const dismiss = useCallback((id: number) => setToasts((ts) => ts.filter((t) => t.id !== id)), []);
  const toast = useCallback((text: string, undo?: () => void, tone: ToastTone = "info") => {
    const id = ++toastId.current;
    setToasts((ts) => [...ts.slice(-2), { id, message: text, undo, tone }]);
    setTimeout(() => dismiss(id), TOAST_MS);
  }, [dismiss]);

  const show = useCallback((v: View | null) => { viewRef.current = v; setView(v); }, []);

  /** The server's view of the company. While changes are in flight it waits for them (they refetch when done). */
  const refresh = useCallback(async () => {
    try {
      const v = await api<View>("/api/org");
      // Two quick changes mean two fetches; if the older answer lands last, keep the newer view (else the page would sit
      // on stale data until the next change).
      const cur = viewRef.current;
      const older = !!cur && cur.db.org.id === v.db.org.id && v.version < cur.version;
      if (pending.current === 0 && !older) show(v);
      if (v.build && BUILD !== "dev" && v.build !== BUILD && !toldNewVersion.current) {
        toldNewVersion.current = true;
        toast("A new version of 1Fold is ready — refresh the page to get it");
      }
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) show(null); // signed out, or turned off
      else throw e;
    }
  }, [show, toast]);
  const refreshOrSay = useCallback(() => refresh().catch((e: unknown) => toast(message(e), undefined, "error")), [refresh, toast]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time load; state is set when the server answers
    refresh().catch((e: unknown) => toast(message(e), undefined, "error")).finally(() => setReady(true));
  }, [refresh, toast]);

  // Other people's changes: a live event with the new version, or coming back to the tab. The browser re-opens a
  // dropped connection itself, but an answer it can't use — a 502 while 1Fold restarts for a release, say — ends it for
  // good; so it's opened again here, a little later each time. Back after a gap, it catches up on what it missed.
  const orgId = view?.db.org.id;
  useEffect(() => {
    if (!orgId) return;
    let events: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let wait = RECONNECT_MS;
    let opened = false;
    let missed = false; // it failed since it last worked (or since the page loaded)
    const connect = () => {
      clearTimeout(retry);
      events?.close();
      const es = new EventSource("/api/org/events");
      events = es;
      es.onopen = () => {
        wait = RECONNECT_MS;
        if (opened || missed) void refreshOrSay(); // after a gap: whatever changed meanwhile
        opened = true;
        missed = false;
      };
      es.onerror = () => {
        missed = true;
        if (es.readyState !== EventSource.CLOSED) return; // the browser is trying again by itself
        retry = setTimeout(connect, wait);
        wait = Math.min(wait * 2, RECONNECT_MAX_MS);
      };
      es.addEventListener("version", (e) => {
        if (Number((e as MessageEvent).data) > (viewRef.current?.version ?? 0) && pending.current === 0) void refreshOrSay();
      });
      // A doc's body was saved, or who has a doc open changed: open doc pages listen for these (features/docs).
      for (const kind of ["doc", "presence"] as const) {
        es.addEventListener(kind, (e) => {
          try { window.dispatchEvent(new CustomEvent(`onefold:${kind}`, { detail: JSON.parse((e as MessageEvent).data) })); } catch { /* malformed: ignore */ }
        });
      }
    };
    connect();
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      void refreshOrSay();
      if (events?.readyState === EventSource.CLOSED) { wait = RECONNECT_MS; connect(); } // don't wait for the next try
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearTimeout(retry); events?.close(); document.removeEventListener("visibilitychange", onVisible); };
  }, [orgId, refreshOrSay]);

  // Leaving (reload, close, typed URL) while changes are still on their way would drop them: ask first.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (pending.current > 0) e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  // Moved to another panel by an admin (or opened a link to another panel): go to your own.
  useEffect(() => {
    if (!view || isPublicPath(pathname)) return;
    const panel = panelFromSlug(pathname.split("/")[1] ?? "");
    if (panel && panel !== view.panel) router.replace(panelHome(view.panel));
  }, [view, pathname, router]);

  /** Sends one change to the server, in order; a refusal puts the screen back to the server's version. */
  const send = useCallback((path: string, body: unknown) => {
    pending.current += 1; markSaving(pending.current);
    queue.current = queue.current.then(async () => {
      try {
        await api(path, body);
      } catch (e) {
        toast(message(e), undefined, "error");
      } finally {
        pending.current -= 1; markSaving(pending.current);
        if (pending.current === 0) await refreshOrSay();
      }
    });
  }, [refreshOrSay, toast]);

  const undo = useCallback(() => send("/api/org/undo", {}), [send]);

  // In the queue too: a product made a moment ago is on the server before someone's added to it.
  const addMemberByEmail = useCallback((productKey: string, email: string) => {
    const done = queue.current.then(async () => {
      try {
        const { name } = await api<{ name: string }>("/api/org/member-by-email", { productKey, email });
        await refreshOrSay();
        return name;
      } catch (e) {
        toast(message(e), undefined, "error");
        return null;
      }
    });
    queue.current = done.then(() => undefined);
    return done;
  }, [refreshOrSay, toast]);

  // In the same queue as changes, so an image added to a ticket made a moment ago arrives after that ticket.
  const createDoc = useCallback((input: NewDocInput) => {
    pending.current += 1; markSaving(pending.current);
    const done = queue.current.then(async () => {
      try {
        return (await api<{ id: string }>("/api/docs", input)).id;
      } catch (e) {
        toast(message(e), undefined, "error");
        return null;
      } finally {
        pending.current -= 1; markSaving(pending.current);
        if (pending.current === 0) await refreshOrSay();
      }
    });
    queue.current = done.then(() => undefined);
    return done;
  }, [refreshOrSay, toast]);

  const uploadPhoto = useCallback(async (personId: string, file: Blob) => {
    try {
      await upload(`/api/files?avatar=${encodeURIComponent(personId)}&name=photo.jpg`, file);
      await refreshOrSay();
      return null;
    } catch (e) {
      return message(e);
    }
  }, [refreshOrSay]);

  const uploadImage = useCallback((ticketKey: string, file: Blob, name: string) => {
    pending.current += 1; markSaving(pending.current);
    const done = queue.current.then(async () => {
      try {
        await upload(`/api/files?ticket=${encodeURIComponent(ticketKey)}&name=${encodeURIComponent(name)}`, file);
        return null;
      } catch (e) {
        return message(e);
      } finally {
        pending.current -= 1; markSaving(pending.current);
        if (pending.current === 0) await refreshOrSay();
      }
    });
    queue.current = done.then(() => undefined);
    return done;
  }, [refreshOrSay]);

  const act = useCallback(<K,>(fn: (db: Db, me: Person) => ActResult<K>, opts: RunOptions = {}) => {
    const cur = viewRef.current;
    const me = cur?.db.people.find((p) => p.id === cur.meId);
    if (!cur || !me) return undefined;
    let result: ActResult<K>;
    let steps: Step[];
    try {
      ({ result, steps } = record(() => fn(cur.db, me)));
    } catch (e) {
      if (e instanceof AccessError || e instanceof ValidationError) { toast(e.message, undefined, "error"); return undefined; }
      throw e;
    }
    if (!steps.length) {
      // A screen changed data without a recorded command, so the server would never hear of it.
      console.error("[store] change with no recorded commands — import commands from @/data/commands");
      toast("That change couldn't be saved — please refresh", undefined, "error");
      return undefined;
    }
    const isKeyed = "key" in result && "db" in result;
    const next = isKeyed ? (result as { db: Db }).db : (result as Db);
    show({ ...cur, db: next });
    // Only the latest change can be undone.
    setToasts((ts) => (ts.some((t) => t.undo) ? ts.map((t) => (t.undo ? { ...t, undo: undefined } : t)) : ts));
    // Something just got finished — a ticket reached Done, or a whole epic did: cheer instead of the usual toast.
    const party = cheer(finished(cur.db, next));
    if (party) {
      toast(party.message, opts.success && opts.undoable ? undo : undefined, "success");
      celebrate(party.big);
    } else if (opts.success) toast(opts.success, opts.undoable ? undo : undefined, "success");
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
      toast(`Couldn't sign out: ${message(e)}`, undefined, "error");
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

  const sendVerification = useCallback(async () => {
    try { await api("/api/org/verify-email", {}); return null; } catch (e) { return message(e); }
  }, []);

  const auth: Auth = useMemo(() => ({ ready, signIn, createCompany, checkSlug, lookupInvite, acceptInvite, signOut }),
    [ready, signIn, createCompany, checkSlug, lookupInvite, acceptInvite, signOut]);

  // Commands run on everything (so archived tickets can be restored or deleted); screens see only live tickets.
  const live = useMemo(() => view && ({
    db: { ...view.db, tickets: view.db.tickets.filter((t) => !t.archivedAt) },
    archived: view.db.tickets.filter((t) => t.archivedAt),
  }), [view]);
  const lookups = useMemo(() => (live ? makeLookups(live.db) : null), [live]);
  const store: Store | null = useMemo(() => {
    const me = view?.db.people.find((p) => p.id === view.meId);
    if (!view || !live || !me || !lookups) return null;
    return {
      ...lookups, db: live.db, archivedTickets: live.archived, me, panel: view.panel,
      href: (path: string) => `/${PANEL_SLUG[view.panel]}${path}`,
      can: (action, ctx = {}) => canFor(me, action, ctx),
      run, act, toast, signOut, createInvites, setPassword, emailUnverified: view.emailUnverified, sendVerification, uploadImage, uploadPhoto, createDoc,
      addMemberByEmail,
    };
  }, [view, live, lookups, run, act, toast, signOut, createInvites, setPassword, sendVerification, uploadImage, uploadPhoto, createDoc, addMemberByEmail]);

  return (
    <StoreCtx.Provider value={{ store, auth }}>
      {children}
      <Toaster items={toasts} ms={TOAST_MS} onDismiss={dismiss} />
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
