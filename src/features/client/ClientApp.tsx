"use client";

// The client space (/c): their dashboard — a card per project — and each project as its chats (the same screen as the
// team's Client tab, from what they receive), in the team app's frame: a bar on top, their projects down the side.
import Link from "next/link";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Bell, Check, ChevronsUpDown, ClipboardCheck, FolderOpen, Inbox, LayoutGrid, LogOut, Menu, Moon, Send, Sun, SunMoon } from "lucide-react";
import type { ClientView } from "@/domain/clientView";
import { clientRoom, needsMe } from "@/domain/selectors/room";
import type { Product } from "@/domain/types";
import { applyTheme, savedTheme, THEMES, type Theme } from "@/features/shell/themes";
import { Popover } from "@/ui/Popover";
import { EmptyState, HealthDot, ProductTile } from "@/ui/primitives";
import { ProgressRing } from "@/features/products/ProductsView";
import { STAGE_NAME } from "@/features/room/RoomCards";
import { Room } from "@/features/room/Room";
import type { RoomActions } from "@/features/room/roomActions";
import { RoomAvatar } from "@/features/room/roomUi";
import { useClientView } from "./useClientView";

const NOTICE_MS = 4000;

/** The client space's frame: one side, full height — who you work with on top, your projects (with what waits for you
 *  on each), and you at the bottom (your menu) — and the page beside it on white. No bar across the
 *  top; on a phone a slim one opens the side. */
function ClientShell({ view, current, onSignOut, children }: { view: ClientView; current?: string; onSignOut: () => void; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`client-shell${open ? " sidebar-open" : ""}`}>
      <header className="client-mobilebar">
        <button type="button" className="btn btn-tertiary btn-icon" aria-label="Your projects" aria-expanded={open} onClick={() => setOpen((o) => !o)}><Menu aria-hidden /></button>
        <span className="client-mobilebar-name">{view.company.name}</span>
      </header>
      {open && <div className="scrim is-light client-scrim" onClick={() => setOpen(false)} aria-hidden />}
      <aside className="app-sidebar" aria-label="Your projects">
        <div className="client-brand">
          <span className="workspace-avatar" aria-hidden>{view.company.name.trim().charAt(0).toUpperCase()}</span>
          <span><b>{view.company.name}</b><small>Client space</small></span>
        </div>
        <Link href="/c" onClick={() => setOpen(false)} className={`sidebar-item sidebar-all${current === "all" ? " is-active" : ""}`} aria-current={current === "all" ? "page" : undefined}>
          <LayoutGrid aria-hidden /> All projects
        </Link>
        <div className="sidebar-group">
          <div className="sidebar-group-head">
            <span className="sidebar-section sidebar-group-toggle client-group-head">
              <span className="sidebar-group-name">Your projects</span>
              <span className="sidebar-group-count">{view.projects.length}</span>
            </span>
          </div>
          {view.projects.map((p) => {
            const room = clientRoom(view, p.key)!;
            const waiting = room.threads.filter((t) => needsMe(room, t)).length;
            return (
              <Link key={p.key} href={`/c/p/${p.key}`} onClick={() => setOpen(false)} className={`sidebar-item${p.key === current ? " is-active" : ""}`} aria-current={p.key === current ? "page" : undefined}>
                <ProductTile product={{ name: p.name, color: p.color, icon: p.icon } as Product} />
                <span>{p.name}</span>
                {waiting > 0 && <span className="sidebar-item-end client-waiting" aria-label={`${waiting} waiting for you`}>{waiting}</span>}
              </Link>
            );
          })}
          {!view.projects.length && <p className="room-muted client-sidebar-none">No projects yet.</p>}
        </div>
        <ClientMenu view={view} onSignOut={onSignOut} />
      </aside>
      <main className="work-area" id="main"><div className="page client-page">{children}</div></main>
    </div>
  );
}

/** You, at the bottom of the side — your menu: the colour themes (the team's own list, kept in this browser), and Sign out. */
function ClientMenu({ view, onSignOut }: { view: ClientView; onSignOut: () => void }) {
  const [theme, setTheme] = useState<Theme>(savedTheme); // the layout's script already painted it
  const me = { id: view.me.id, name: view.me.name, initials: view.people[view.me.id]?.initials ?? "", color: view.people[view.me.id]?.color ?? "#579bfc", side: "client" as const };
  return (
    <Popover
      floating // it opens up from the bottom of the side
      width={240}
      anchorClassName="client-me-anchor"
      trigger={({ open, toggle }) => (
        <button type="button" className={`client-me${open ? " is-open" : ""}`} onClick={toggle} aria-label="Your menu" aria-expanded={open}>
          <RoomAvatar person={me} side="client" size={30} />
          <span className="client-menu-who"><b>{view.me.name}</b><small>{view.me.company || view.me.email}</small></span>
          <ChevronsUpDown aria-hidden />
        </button>
      )}
    >
      {(close) => (
        <>
          {[false, true].map((dark) => (
            <Fragment key={String(dark)}>
              <div className="menu-section-label">{dark ? "Dark themes" : "Light themes"}</div>
              {THEMES.filter((t) => t.dark === dark).map((t) => (
                <button key={t.id} type="button" role="menuitemradio" aria-checked={theme === t.id} className={`menu-item${theme === t.id ? " is-selected" : ""}`}
                  onClick={() => { setTheme(t.id); applyTheme(t.id); close(); }}>
                  {t.id === "night" ? <SunMoon aria-hidden /> : dark ? <Moon aria-hidden /> : <Sun aria-hidden />}
                  {t.label}
                  {theme === t.id && <Check className="menu-item-end" aria-hidden />}
                </button>
              ))}
            </Fragment>
          ))}
          <div className="menu-divider" />
          <button type="button" className="menu-item" onClick={() => { close(); onSignOut(); }}><LogOut aria-hidden /> Sign out</button>
        </>
      )}
    </Popover>
  );
}

function Notice({ text }: { text: string | null }) {
  return <p className={`client-notice${text ? " is-shown" : ""}`} role="status">{text}</p>;
}

function SuggestDialog({ onClose, onSend }: { onClose: () => void; onSend: (title: string, details: string) => Promise<boolean> }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { const d = ref.current; if (!d?.open) d?.showModal(); return () => d?.close(); }, []);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    if (await onSend(title, details)) onClose();
    setBusy(false);
  };
  return (
    <dialog ref={ref} className="confirm-dialog decision-dialog room-dialog" aria-labelledby="suggest-title" onCancel={(e) => { e.preventDefault(); onClose(); }}>
      <form onSubmit={(e) => void submit(e)} noValidate>
        <h2 id="suggest-title" className="confirm-title">Suggest a requirement</h2>
        <p className="decision-dialog-hint">The team looks at it, then takes it on — or tells you why not.</p>
        <label className="field"><span className="field-label">What do you need?</span>
          <span className="input"><input autoFocus value={title} maxLength={200} placeholder="e.g. Customers can pay with Apple Pay" onChange={(e) => setTitle(e.target.value)} /></span>
        </label>
        <label className="field"><span className="field-label">Why, and anything else the team should know <span className="muted">(optional)</span></span>
          <textarea className="room-textarea" rows={3} value={details} maxLength={4000} onChange={(e) => setDetails(e.target.value)} />
        </label>
        <div className="confirm-actions">
          <button type="button" className="btn btn-tertiary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy || !title.trim()}><Send aria-hidden /> Send to the team</button>
        </div>
      </form>
    </dialog>
  );
}

const Loading = () => <div className="app-loading" aria-busy="true" />;

/** /c — their dashboard, the team's "All products" for them: a card per project — where it is, how far it's built,
 *  what waits for them — straight into its chats. */
export function ClientHome() {
  const { view, error, signOut } = useClientView();
  if (error && !view) return <p className="client-error" role="alert">{error}</p>;
  if (!view) return <Loading />;
  const n = view.projects.length;
  return (
    <ClientShell view={view} current="all" onSignOut={() => void signOut()}>
      <header className="page-header">
        <div>
          <h1 className="page-title">Your projects</h1>
          <span className="page-subtitle">{n} {n === 1 ? "project" : "projects"} with {view.company.name}</span>
        </div>
      </header>
      {n ? <ul className="product-cards">{view.projects.map((p) => <li key={p.key}><ProjectCard view={view} p={p} /></li>)}</ul> : (
        <EmptyState icon={<FolderOpen aria-hidden />} title="You're not on a project right now">The team will add you when there&apos;s one to follow.</EmptyState>
      )}
    </ClientShell>
  );
}

const CONTACTS_SHOWN = 5;
type ProjectView = ClientView["projects"][number];
/** How much of what they confirmed is built, in % — null with nothing to build yet. */
function builtPct(p: ProjectView): number | null {
  const n = p.requirements.reduce((sum, r) => ({ done: sum.done + r.progress.done, total: sum.total + r.progress.total }), { done: 0, total: 0 });
  return n.total ? Math.round((n.done / n.total) * 100) : null;
}

/** One project, as the team's product card: its stage and health, how far what you confirmed is built, what waits
 *  for you, and the team you talk to. */
function ProjectCard({ view, p }: { view: ClientView; p: ProjectView }) {
  const room = clientRoom(view, p.key)!;
  const waiting = room.threads.filter((t) => needsMe(room, t)).length;
  const confirmed = p.requirements.filter((r) => r.status === "confirmed").length;
  const open = p.asks.filter((a) => a.state === "open").length;
  return (
    <Link href={`/c/p/${p.key}`} className="pc" style={{ "--product": p.color } as React.CSSProperties}>
      <div className="pc-head">
        <ProductTile product={{ name: p.name, color: p.color, icon: p.icon } as Product} size="lg" />
        <div className="pc-title">
          <h2 className="pc-name">{p.name}</h2>
          <span className="pc-meta"><span>{STAGE_NAME[p.stage]}</span><HealthDot health={p.health} /></span>
        </div>
        <ProgressRing pct={builtPct(p)} color={p.color} />
      </div>
      <div className="pc-chips">
        <span className={`pc-chip${waiting ? " is-mine" : ""}`}><Bell aria-hidden /><strong>{waiting}</strong> waiting for you</span>
        <span className="pc-chip"><ClipboardCheck aria-hidden /><strong>{confirmed}</strong> of {p.requirements.length} confirmed</span>
        <span className="pc-chip"><Inbox aria-hidden /><strong>{open}</strong> open {open === 1 ? "request" : "requests"}</span>
      </div>
      <footer className="pc-foot">
        <span className="avatar-stack" aria-label={`${p.contacts.length} people from ${view.company.name}`}>
          {p.contacts.slice(0, CONTACTS_SHOWN).map((id) => <RoomAvatar key={id} person={room.people[id]} side="client" size={24} />)}
        </span>
        <span className="pc-cta"><span>Open project</span><span className="pc-cta-arrow" aria-hidden><ArrowRight /></span></span>
      </footer>
    </Link>
  );
}

/** /c/p/<key> — one project's chats. */
export function ClientProjectPage({ productKey }: { productKey: string }) {
  const { view, error, act, sendFile, signOut } = useClientView();
  const router = useRouter();
  const pathname = usePathname();
  const subject = useSearchParams().get("t");
  const [notice, setNotice] = useState<string | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const say = (text: string) => { setNotice(text); clearTimeout(timer.current); timer.current = setTimeout(() => setNotice(null), NOTICE_MS); };
  const open = (s: string | null) => router.replace(s ? `${pathname}?t=${encodeURIComponent(s)}` : pathname, { scroll: false }); // null: the chat closed
  const room = useMemo(() => (view ? clientRoom(view, productKey) : null), [view, productKey]);
  const done = async (p: Promise<string | null>, success?: string) => { const problem = await p; if (problem) say(problem); else if (success) say(success); return !problem; };
  const actions: RoomActions = {
    fileUrl: (id, download) => `/api/client/file?id=${encodeURIComponent(id)}${download ? "&download=1" : ""}`,
    send: (s, body, opts) => done(act("postMessage", s, body, crypto.randomUUID(), opts.replyTo ?? null)),
    deleteMessage: (id, everyone) => void done(act("deleteMessage", id, everyone), everyone ? "Deleted for everyone" : "Deleted for you"),
    star: (id, on) => void done(act("starMessage", id, on), on ? "Starred — only you see it" : "Unstarred"),
    pin: (id, on) => void done(act("pinMessage", id, on), on ? "Pinned for everyone" : "Unpinned"),
    markRead: (s, at) => void act("readChat", s, at), // quiet: unread counts and ticks only
    upload: (s, file) => done(sendFile(s, file), "Sent"),
    confirm: (id) => done(act("confirmRequirement", id), "Confirmed — the team has been told"),
    askChanges: (id, body) => done(act("requestRequirementChanges", id, body, crypto.randomUUID()), "Sent to the team"),
    answer: (id, body) => done(act("answerAsk", id, body, crypto.randomUUID()), "Answered"),
    markDone: (id) => done(act("completeAsk", id), "Marked done"),
    suggest: () => setSuggesting(true),
  };
  if (error && !view) return <p className="client-error" role="alert">{error}</p>;
  if (!view) return <Loading />;
  return (
    <ClientShell view={view} current={productKey} onSignOut={() => void signOut()}>
      {room ? <Room room={room} actions={actions} subject={subject} onSubject={open} />
        : <p className="room-muted">This project isn&apos;t shared with you. <Link href="/c">See your projects</Link></p>}
      {suggesting && (
        <SuggestDialog onClose={() => setSuggesting(false)} onSend={async (title, details) => {
          const id = crypto.randomUUID();
          const ok = await done(act("proposeRequirement", productKey, { title, details }, id), "Sent to the team");
          if (ok) open(`req:${id}`);
          return ok;
        }} />
      )}
      <Notice text={notice} />
    </ClientShell>
  );
}
