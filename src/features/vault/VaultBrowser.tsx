"use client";

import { useEffect, useRef, useState } from "react";
import {
  Check, ChevronDown, ChevronRight, Copy, ExternalLink, Eye, EyeOff, LayoutGrid, Maximize2, Pencil, Plus, Search, Share2, Table2, Trash2, UserRound,
  Users, WandSparkles, X,
} from "lucide-react";
import { PRODUCT_COLORS } from "@/data/db";
import { useMe } from "@/data/StoreProvider";
import { BRANDS, brandBySlug, brandForUrl, inkFor, type Brand } from "./brands";
import { relativeTime, shortDate } from "@/domain/status";
import type { VaultRecord } from "@/domain/types";
import { passwordStrength, type VaultItemData } from "./crypto";
import { PasswordGenerator } from "./PasswordGenerator";
import { useVault } from "./VaultProvider";
import { ConfirmDialog } from "@/ui/ConfirmDialog";
import { Popover } from "@/ui/Popover";
import { Avatar, IconButton } from "@/ui/primitives";

const CLEAR_CLIPBOARD_MS = 30_000;
const EMPTY: VaultItemData = { title: "", website: "", username: "", password: "", notes: "" };
type Row = { id: string; vaultId: string; data: VaultItemData; updatedBy: string; updatedAt: string };
/** Holders first (owner leading), then people invited who haven't set up their vault yet. */
const peopleOf = (v: VaultRecord) => [...new Set([v.createdBy, ...Object.keys(v.keys)])].filter((id) => v.keys[id]);

/** monday-style status cell for password strength. */
const STRENGTH: { label: string; tone: "stuck" | "working" | "done" }[] = [
  { label: "Weak", tone: "stuck" }, { label: "Weak", tone: "stuck" }, { label: "Okay", tone: "working" },
  { label: "Strong", tone: "done" }, { label: "Strong", tone: "done" },
];
const strengthOf = (pw: string) => (pw ? STRENGTH[passwordStrength(pw)] : null);

function useCopy() {
  const { toast } = useMe();
  return async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast(`${what} copied — clears in 30 s`);
      setTimeout(() => { void navigator.clipboard.writeText("").catch(() => undefined); }, CLEAR_CLIPBOARD_MS);
    } catch { toast("Couldn't copy"); }
  };
}

const STRENGTH_LABEL = ["Very weak", "Weak", "Okay", "Strong", "Very strong"];

/** One-line strength meter: four segments + a label (used under every password field). */
export function StrengthBar({ value }: { value: string }) {
  const score = passwordStrength(value);
  return (
    <div className="vault-strength4" data-score={value ? score : -1} aria-live="polite">
      <span className="vault-strength4-bars" aria-hidden>{[0, 1, 2, 3].map((i) => <span key={i} className={i < score ? "is-on" : ""} />)}</span>
      <span>{value ? STRENGTH_LABEL[score] : "Strength"}</span>
    </div>
  );
}

const hostOf = (url: string) => url.replace(/^https?:\/\//, "").replace(/\/.*$/, "");

function BrandGlyph({ brand }: { brand: Brand }) {
  return brand.path
    ? <svg viewBox="0 0 24 24" aria-hidden><path d={brand.path} fill="currentColor" /></svg>
    : <span className="vb-mono">{brand.mono}</span>;
}

/** Item icon: the chosen brand logo on its brand colour, else a letter tile in the chosen colour. */
function ItemIcon({ data, size = "sm" }: { data: VaultItemData; size?: "sm" | "lg" }) {
  const brand = brandBySlug(data.icon);
  if (brand) {
    return (
      <span className={`vb-icon is-${size} is-brand`} style={{ background: `#${brand.hex}`, color: inkFor(brand.hex) }} title={brand.title} aria-hidden>
        <BrandGlyph brand={brand} />
      </span>
    );
  }
  return (
    <span className={`vb-icon is-${size}`} style={data.color ? { background: data.color, color: "#fff" } : undefined} aria-hidden>
      {(data.title[0] ?? "?").toUpperCase()}
    </span>
  );
}

/** Picker: suggested logo from the website, every popular brand (searchable), and letter-tile colours. */
function IconPicker({ data, onPick, onDone }: { data: VaultItemData; onPick: (p: { icon?: string; color?: string }) => void; onDone: () => void }) {
  const [q, setQ] = useState("");
  const suggested = data.website ? brandForUrl(data.website) : undefined;
  const list = BRANDS.filter((b) => !q.trim() || b.title.toLowerCase().includes(q.trim().toLowerCase()));
  const cell = (b: Brand) => (
    <button key={b.slug} type="button" className={`vb-brand${data.icon === b.slug ? " is-current" : ""}`} title={b.title} aria-label={b.title}
      onClick={() => { onPick({ icon: b.slug }); onDone(); }}>
      <span className="vb-icon is-sm is-brand" style={{ background: `#${b.hex}`, color: inkFor(b.hex) }}><BrandGlyph brand={b} /></span>
    </button>
  );
  return (
    <div className="vb-picker">
      <label className="input"><Search aria-hidden /><input autoFocus placeholder="Search GitHub, Google, OpenAI…" aria-label="Search logos" value={q} onChange={(e) => setQ(e.target.value)} /></label>
      {suggested && !q && (
        <div className="vb-picker-suggest">
          <span className="menu-section-label">Suggested for {hostOf(data.website)}</span>
          <button type="button" className="vb-suggest" onClick={() => { onPick({ icon: suggested.slug }); onDone(); }}>
            <span className="vb-icon is-sm is-brand" style={{ background: `#${suggested.hex}`, color: inkFor(suggested.hex) }}><BrandGlyph brand={suggested} /></span>
            {suggested.title}
          </button>
        </div>
      )}
      <span className="menu-section-label">Logos</span>
      <div className="vb-brands">{list.map(cell)}</div>
      {list.length === 0 && <p className="vb-picker-empty">No logo for “{q}” — use a colour below.</p>}
      <span className="menu-section-label">Letter tile colour</span>
      <div className="vb-colors" role="radiogroup" aria-label="Letter tile colour">
        {PRODUCT_COLORS.map((c) => (
          <button key={c} type="button" role="radio" aria-checked={!data.icon && data.color === c} aria-label={c.replace(/var\(--color-|\)/g, "").replace(/[-_]/g, " ")}
            className="vb-color" style={{ background: c }} onClick={() => { onPick({ icon: "", color: c }); onDone(); }} />
        ))}
      </div>
    </div>
  );
}

/** One board row = one secret. Click anywhere to open the side panel. */
function ItemRow({ row, shared, open, onOpen }: { row: Row; shared?: VaultRecord; open: boolean; onOpen: () => void }) {
  const { me, personById } = useMe();
  const canShare = !shared || shared.createdBy === me.id; // only whoever shared it decides who else gets it
  const copy = useCopy();
  const [show, setShow] = useState(false);
  const s = strengthOf(row.data.password);
  return (
    <div role="row" className={`grid-row vb-row${open ? " is-open" : ""}`} onClick={onOpen}>
      <span className="grid-cell col-item" role="cell">
        <ItemIcon data={row.data} />
        <button type="button" className="ticket-title vb-title" onClick={(e) => { e.stopPropagation(); onOpen(); }}>{row.data.title}</button>
        <span className="row-expand"><IconButton label={`Open ${row.data.title}`} onClick={onOpen}><Maximize2 /></IconButton></span>
      </span>
      <span className="grid-cell col-user" role="cell">
        <span className="vb-ellipsis">{row.data.username || <span className="muted">—</span>}</span>
        {row.data.username && (
          <span className="vb-cell-action"><IconButton label="Copy username" onClick={() => copy(row.data.username, "Username")}><Copy /></IconButton></span>
        )}
      </span>
      <span className="grid-cell col-pass" role="cell" onClick={(e) => e.stopPropagation()}>
        <span className="vb-ellipsis admin-mono">{row.data.password ? (show ? row.data.password : "••••••••••") : <span className="muted">—</span>}</span>
        {row.data.password && (
          <span className="vb-cell-action is-always">
            <IconButton label={show ? "Hide password" : "Show password"} onClick={() => setShow(!show)}>{show ? <EyeOff /> : <Eye />}</IconButton>
            <IconButton label="Copy password" onClick={() => copy(row.data.password, "Password")}><Copy /></IconButton>
          </span>
        )}
      </span>
      <span className="grid-cell col-site" role="cell" onClick={(e) => e.stopPropagation()}>
        {row.data.website ? <a className="vb-link" href={row.data.website} target="_blank" rel="noreferrer noopener">{hostOf(row.data.website)}</a> : <span className="muted">—</span>}
      </span>
      <span className="grid-cell col-shared" role="cell" onClick={(e) => e.stopPropagation()}>
        {shared ? <SharedWith vault={shared} names={(id) => personById(id)?.name ?? "Someone"} /> : <span className="muted vb-only-you">Only you</span>}
        {canShare && <ShareButton row={row} shared={shared} />}
      </span>
      <span className="grid-cell col-strength" role="cell">
        {s ? <span className="status-cell is-readonly" data-tone={s.tone}>{s.label}</span> : <span className="muted">—</span>}
      </span>
      <span className="grid-cell col-updated" role="cell">
        <Avatar personId={row.updatedBy} size="sm" /><span className="vb-date">{shortDate(row.updatedAt.slice(0, 10))}</span>
      </span>
    </div>
  );
}

/** Cards view: one card per secret — its logo and name, the password a click from shown or copied. */
function ItemCard({ row, shared, open, onOpen }: { row: Row; shared?: VaultRecord; open: boolean; onOpen: () => void }) {
  const { personById } = useMe();
  const copy = useCopy();
  const [show, setShow] = useState(false);
  const s = strengthOf(row.data.password);
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  return (
    <article role="listitem" className={`vb-card${open ? " is-open" : ""}`} onClick={onOpen}>
      <header className="vb-card-head">
        <ItemIcon data={row.data} size="lg" />
        <span className="vb-card-name">
          <button type="button" className="vb-card-title" onClick={(e) => { stop(e); onOpen(); }}>{row.data.title}</button>
          <span className="vb-card-user">{row.data.username || "No username"}</span>
        </span>
        {s && <span className="vb-card-strength" data-tone={s.tone}>{s.label}</span>}
      </header>
      <div className="vb-card-secret" onClick={stop}>
        <span className="admin-mono vb-ellipsis">{row.data.password ? (show ? row.data.password : "••••••••••••") : <span className="muted">No password</span>}</span>
        {row.data.password && <IconButton label={show ? "Hide password" : "Show password"} onClick={() => setShow(!show)}>{show ? <EyeOff /> : <Eye />}</IconButton>}
      </div>
      <div className="vb-card-meta" onClick={stop}>
        {row.data.website ? <a className="vb-link vb-ellipsis" href={row.data.website} target="_blank" rel="noreferrer noopener">{hostOf(row.data.website)}</a> : <span className="muted">No website</span>}
        {shared ? <SharedWith vault={shared} names={(id) => personById(id)?.name ?? "Someone"} /> : <span className="muted vb-only-you">Only you</span>}
      </div>
      <footer className="vb-card-actions" onClick={stop}>
        <button type="button" className="vb-card-btn" disabled={!row.data.username} onClick={() => copy(row.data.username, "Username")}><Copy aria-hidden /> Copy username</button>
        <button type="button" className="vb-card-btn is-main" disabled={!row.data.password} onClick={() => copy(row.data.password, "Password")}><Copy aria-hidden /> Copy password</button>
      </footer>
    </article>
  );
}

function SharedWith({ vault, names }: { vault: VaultRecord; names: (id: string) => string }) {
  const people = peopleOf(vault);
  const invited = vault.invited ?? [];
  const title = [...people.map((id, i) => `${names(id)}${i === 0 ? " (owner)" : ""}`), ...invited.map((id) => `${names(id)} (invited)`)].join(", ");
  return (
    <span className="vb-shared" title={title}>
      <span className="avatar-stack">
        {people.slice(0, 4).map((id) => <Avatar key={id} personId={id} size="sm" />)}
        {invited.slice(0, Math.max(0, 4 - people.length)).map((id) => <span key={id} className="vb-invited-avatar"><Avatar personId={id} size="sm" /></span>)}
      </span>
      <span className="vb-shared-count">{people.length + invited.length}</span>
    </span>
  );
}

/** The row's Share button and its menu: search people, tick one or more, Share. */
function ShareButton({ row, shared }: { row: Row; shared?: VaultRecord }) {
  return (
    <Popover
      align="right" width={380} className="vb-share-pop"
      trigger={({ open, toggle }) => (
        <button type="button" className={`vb-share-btn${shared ? "" : " is-personal"}`} aria-haspopup="dialog" aria-expanded={open} onClick={toggle}
          aria-label={`Share ${row.data.title}`}>
          <Share2 aria-hidden /><span>Share</span>
        </button>
      )}
    >
      {(close) => <SharePicker row={row} shared={shared} onDone={close} />}
    </Popover>
  );
}

function SharePicker({ row, shared, onDone }: { row: Row; shared?: VaultRecord; onDone: () => void }) {
  const { db, me } = useMe();
  const vault = useVault();
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const has = (pid: string) => !!shared?.keys[pid];
  const invited = (pid: string) => !!shared?.invited?.includes(pid);
  const needle = q.trim().toLowerCase();
  const people = db.people
    .filter((p) => p.active && p.panel && p.id !== me.id)
    .filter((p) => !needle || `${p.name} ${p.role} ${p.email}`.toLowerCase().includes(needle))
    .sort((a, b) => Number(has(b.id) || invited(b.id)) - Number(has(a.id) || invited(a.id)) || a.name.localeCompare(b.name));
  const toggle = (pid: string) => setPicked((cur) => { const n = new Set(cur); if (n.has(pid)) n.delete(pid); else n.add(pid); return n; });
  const submit = async () => {
    setBusy(true);
    const ok = await vault.share([row.id], [...picked]);
    setBusy(false);
    if (ok) onDone();
  };
  return (
    <div className="vb-sp">
      <header className="vb-sp-head">
        <ItemIcon data={row.data} />
        <span>
          <strong>Share “{row.data.title}”</strong>
          <small>{shared ? "Add people. Only you decide who has it." : "It moves to Shared. Only the people you pick can open it."}</small>
        </span>
      </header>
      <label className="input vb-sp-search"><Search aria-hidden /><input autoFocus placeholder="Search people" aria-label="Search people" value={q} onChange={(e) => setQ(e.target.value)} /></label>
      <ul className="vb-sp-list">
        {people.map((p) => {
          const already = has(p.id) || invited(p.id);
          const on = already || picked.has(p.id);
          return (
            <li key={p.id}>
              <label className={`vb-sp-person${on ? " is-on" : ""}${already ? " is-locked" : ""}`}>
                <input type="checkbox" className="checkbox" checked={on} disabled={already} onChange={() => toggle(p.id)} />
                <Avatar personId={p.id} />
                <span className="vb-sp-who">
                  <strong>{p.name}</strong>
                  <span>{has(p.id) ? "Has access" : invited(p.id) ? "Invited — sets up their vault first" : `${p.role}${db.vaultAccounts[p.id] ? "" : " · gets it after setting up their vault"}`}</span>
                </span>
                {on && <Check className="vb-sp-check" aria-hidden />}
              </label>
            </li>
          );
        })}
        {!people.length && <li className="vb-sp-empty">Nobody matches “{q}”.</li>}
      </ul>
      <footer className="vb-sp-foot">
        <span className="vb-sp-picked">
          {picked.size > 0 && <span className="avatar-stack">{[...picked].slice(0, 4).map((id) => <Avatar key={id} personId={id} size="sm" />)}</span>}
          {picked.size ? `${picked.size} ${picked.size === 1 ? "person" : "people"}` : "Pick one or more people"}
        </span>
        <button type="button" className="btn btn-primary" disabled={!picked.size || busy} onClick={submit}>
          <Share2 aria-hidden /> {busy ? "Encrypting…" : "Share"}
        </button>
      </footer>
    </div>
  );
}

/** "+ Add item" row at the end of a group (monday): opens the side panel, or the share dialog in Shared. */
function AddRow({ label, icon, onAdd }: { label: string; icon: React.ReactNode; onAdd: () => void }) {
  return (
    <div className="grid-row vb-add">
      <span className="grid-cell col-item">
        <button type="button" className="vb-add-btn" onClick={onAdd}>{icon} {label}</button>
      </span>
    </div>
  );
}

const COLUMNS = [["item", "Item"], ["user", "Username"], ["pass", "Password"], ["site", "Website"], ["shared", "Shared with"], ["strength", "Strength"], ["updated", "Last updated"]];

type View = "table" | "cards";
const VIEW_KEY = "onefold.vault.view"; // this browser remembers Table or Cards

function VaultGroup({ id, label, icon, color, rows, sharedOf, openId, onOpen, onAdd, view }: {
  id: string; label: string; icon: React.ReactNode; color: string; rows: Row[]; sharedOf?: (vaultId: string) => VaultRecord | undefined;
  openId: string | null; onOpen: (row: Row) => void; onAdd: () => void; view: View;
}) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <section id={id} className="grid-group" style={{ "--group": color } as React.CSSProperties}>
      <header className="group-header">
        <button type="button" className="group-toggle" aria-expanded={!collapsed} aria-label={`${collapsed ? "Expand" : "Collapse"} ${label}`} onClick={() => setCollapsed(!collapsed)}>
          {collapsed ? <ChevronRight aria-hidden /> : <ChevronDown aria-hidden />}
        </button>
        <span className="vb-group-icon" aria-hidden>{icon}</span>
        <h2 className="group-title">{label}</h2>
        <span className="group-count">{rows.length} {rows.length === 1 ? "item" : "items"}</span>
      </header>
      {!collapsed && view === "cards" && (
        <div className="vb-cards" role="list" aria-label={label}>
          {rows.map((r) => <ItemCard key={r.id} row={r} shared={sharedOf?.(r.vaultId)} open={openId === r.id} onOpen={() => onOpen(r)} />)}
          <button type="button" className="vb-card-add" onClick={onAdd}><Plus aria-hidden /> Add item</button>
        </div>
      )}
      {!collapsed && view === "table" && (
        <div className="group-body">
          <span className="group-bar" aria-hidden />
          <div className="grid-table" role="table" aria-label={label}>
            <div className="grid-row grid-head" role="row">
              {COLUMNS.map(([k, h]) => <span key={k} className={`grid-cell col-${k}`} role="columnheader">{h}</span>)}
            </div>
            {rows.map((r) => <ItemRow key={r.id} row={r} shared={sharedOf?.(r.vaultId)} open={openId === r.id} onOpen={() => onOpen(r)} />)}
            <AddRow label="Add item" icon={<Plus aria-hidden />} onAdd={onAdd} />
          </div>
        </div>
      )}
    </section>
  );
}

/** One Share button for everything: pick one, several or all of your passwords, then anyone in the company. */
function ShareDialog({ rows, initial, onDone, onClose }: { rows: Row[]; initial: string[]; onDone: () => void; onClose: () => void }) {
  const { db, me, personById } = useMe();
  const vault = useVault();
  const ref = useRef<HTMLDialogElement>(null);
  const [picked, setPicked] = useState(() => new Set(initial));
  const [people, setPeople] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    return () => d?.close();
  }, []);
  const toggle = (set: Set<string>, id: string) => { const n = new Set(set); if (n.has(id)) n.delete(id); else n.add(id); return n; };
  const all = rows.length > 0 && rows.every((r) => picked.has(r.id));
  const needle = q.trim().toLowerCase();
  const candidates = db.people
    .filter((p) => p.active && p.panel && p.id !== me.id)
    .filter((p) => !needle || `${p.name} ${p.email} ${p.role}`.toLowerCase().includes(needle))
    .sort((a, b) => a.name.localeCompare(b.name));
  const vaultOf = (r: Row) => db.vaults.find((v) => v.id === r.vaultId && v.kind === "shared");
  const n = picked.size;
  const submit = async () => {
    setBusy(true);
    const ok = await vault.share([...picked], [...people]);
    setBusy(false);
    if (ok) onDone();
  };

  return (
    <dialog
      ref={ref} className="pf-dialog vs-dialog" aria-labelledby="vs-title"
      onCancel={(e) => { e.preventDefault(); onClose(); }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <header className="pf-dialog-head">
        <div>
          <h2 id="vs-title" className="pf-dialog-title">Share passwords</h2>
          <p className="muted">Each password is encrypted for exactly the people you pick — nobody else can open it.</p>
        </div>
        <IconButton label="Close" onClick={onClose}><X /></IconButton>
      </header>
      <div className="vs-body">
        <section className="vs-pane" aria-labelledby="vs-pw">
          <header className="vs-pane-head">
            <h3 id="vs-pw">1. Passwords</h3>
            <label className="vs-all">
              <input type="checkbox" checked={all} disabled={!rows.length} onChange={() => setPicked(all ? new Set() : new Set(rows.map((r) => r.id)))} />
              All ({rows.length})
            </label>
          </header>
          <ul className="vs-list">
            {rows.map((r) => {
              const v = vaultOf(r);
              return (
                <li key={r.id}>
                  <label className={`vs-option${picked.has(r.id) ? " is-on" : ""}`}>
                    <input type="checkbox" checked={picked.has(r.id)} onChange={() => setPicked((cur) => toggle(cur, r.id))} />
                    <ItemIcon data={r.data} />
                    <span className="vs-option-text"><strong>{r.data.title}</strong><span>{r.data.username || hostOf(r.data.website) || "—"}</span></span>
                    {v ? <SharedWith vault={v} names={(id) => personById(id)?.name ?? "Someone"} /> : <span className="vs-tag">Personal</span>}
                  </label>
                </li>
              );
            })}
            {!rows.length && <li className="vs-empty">Add a password to your Personal vault first.</li>}
          </ul>
        </section>
        <section className="vs-pane" aria-labelledby="vs-people">
          <header className="vs-pane-head">
            <h3 id="vs-people">2. People</h3>
            {people.size > 0 && <span className="vs-picked">{people.size} selected</span>}
          </header>
          <label className="input vs-search"><Search aria-hidden /><input placeholder="Search people" aria-label="Search people" value={q} onChange={(e) => setQ(e.target.value)} /></label>
          <ul className="vs-list">
            {candidates.map((p) => (
              <li key={p.id}>
                <label className={`vs-option${people.has(p.id) ? " is-on" : ""}`}>
                  <input type="checkbox" checked={people.has(p.id)} onChange={() => setPeople((cur) => toggle(cur, p.id))} />
                  <Avatar personId={p.id} size="md" />
                  <span className="vs-option-text">
                    <strong>{p.name}</strong>
                    <span>{p.role}{!db.vaultAccounts[p.id] && " · gets it once they set up their vault"}</span>
                  </span>
                  {people.has(p.id) && <Check className="vs-check" aria-hidden />}
                </label>
              </li>
            ))}
            {!candidates.length && <li className="vs-empty">Nobody matches “{q}”.</li>}
          </ul>
        </section>
      </div>
      <footer className="vs-foot">
        <span className="vb-panel-note">Personal passwords move to <strong>Shared</strong>. Only you can change who has them.</span>
        <span className="spacer" />
        <button type="button" className="btn btn-tertiary" onClick={onClose}>Cancel</button>
        <button type="button" className="btn btn-primary" disabled={busy || !n || !people.size} onClick={submit}>
          <Share2 aria-hidden />
          {busy ? "Encrypting…" : `Share ${n || ""} ${n === 1 ? "password" : "passwords"}${people.size ? ` with ${people.size} ${people.size === 1 ? "person" : "people"}` : ""}`}
        </button>
      </footer>
    </dialog>
  );
}

/** Inside a shared item's panel: who has it. The owner can remove people (re-encrypts) or cancel invites. */
function SharedAccess({ shared, onAddPeople }: { shared: VaultRecord; onAddPeople?: () => void }) {
  const { me, personById } = useMe();
  const v = useVault();
  const [busy, setBusy] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const isOwner = shared.createdBy === me.id;
  const run = async (id: string, fn: () => Promise<unknown> | unknown) => { setBusy(id); await fn(); setBusy(null); };
  const rows = [...peopleOf(shared).map((id) => ({ id, invited: false })), ...(shared.invited ?? []).map((id) => ({ id, invited: true }))];
  return (
    <section className="vb-sharing" aria-labelledby="vb-sharing-title">
      <header className="vb-sharing-head">
        <h3 id="vb-sharing-title"><Users aria-hidden /> Shared with {rows.length} {rows.length === 1 ? "person" : "people"}</h3>
        {isOwner && onAddPeople && <button type="button" className="btn btn-secondary vb-sharing-add" onClick={onAddPeople}><Plus aria-hidden /> Add people</button>}
      </header>
      <ul className="vb-access-list">
        {rows.map(({ id, invited }) => {
          const p = personById(id);
          const owner = id === shared.createdBy;
          return (
            <li key={id} className="vb-access-row">
              <Avatar personId={id} size="md" />
              <span className="vb-access-who">
                <strong>{p?.name ?? "Someone"}{id === me.id && <span className="muted"> (you)</span>}</strong>
                <span>{p?.role}</span>
              </span>
              <span className={`vb-access-state is-${owner ? "owner" : invited ? "invited" : "on"}`}>{owner ? "Owner" : invited ? "Invited" : "Can view & edit"}</span>
              {isOwner && !owner && (invited
                ? <button type="button" className="btn btn-tertiary vb-access-btn" disabled={busy !== null} onClick={() => run(id, () => v.cancelInvite(shared.id, id))}>Cancel</button>
                : <button type="button" className="btn btn-tertiary vb-access-btn" disabled={busy !== null} onClick={() => setRemoving(id)}>{busy === id ? "Re-encrypting…" : "Remove"}</button>)}
            </li>
          );
        })}
      </ul>
      {!isOwner && <p className="vb-sharing-note">Shared by {personById(shared.createdBy)?.name ?? "someone"} — only they can change who has it.</p>}
      {removing && (
        <ConfirmDialog
          title={`Remove ${personById(removing)?.name ?? "their"} access?`} confirmLabel="Remove access"
          body="This password gets a new key and is re-encrypted, so they can't open it again — not even an old copy."
          onCancel={() => setRemoving(null)}
          onConfirm={() => { const pid = removing; setRemoving(null); void run(pid, () => v.removeAccess(shared.id, pid)); }}
        />
      )}
    </section>
  );
}

/** monday-style item side panel: title, fields, show / copy / generate, save. */
function ItemPanel({ vaultLabel, row, shared, onSave, onDelete, onShare, onClose }: {
  vaultLabel: string; row?: Row; shared?: VaultRecord;
  onSave: (d: VaultItemData) => Promise<boolean>; onDelete?: () => void; onShare?: () => void; onClose: () => void;
}) {
  const { personById } = useMe();
  const copy = useCopy();
  const [d, setD] = useState<VaultItemData>(row?.data ?? EMPTY);
  const [iconTouched, setIconTouched] = useState(!!row?.data.icon || !!row?.data.color);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const panelRef = useRef<HTMLElement>(null);
  const dirty = JSON.stringify(d) !== JSON.stringify(row?.data ?? EMPTY);
  const set = (k: keyof VaultItemData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setD({ ...d, [k]: e.target.value });

  useEffect(() => {
    // Keep focus where autoFocus put it (the name, for new items); otherwise focus the panel itself.
    if (!panelRef.current?.contains(document.activeElement)) panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !document.querySelector(".menu") && onClose(); // a popover open: Escape closes just it
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const save = async () => {
    if (!d.title.trim()) return;
    setBusy(true);
    const ok = await onSave({ ...d, title: d.title.trim() });
    setBusy(false);
    if (ok && !row) onClose();
  };

  return (
    <>
      <div className="scrim is-light" onClick={onClose} aria-hidden />
      <aside ref={panelRef} className="side-panel vb-panel" role="dialog" aria-modal="true" aria-labelledby="vb-panel-title" tabIndex={-1}>
        <header className="vb-panel-head">
          <IconButton label="Close" onClick={onClose}><X /></IconButton>
          <span className="vb-panel-crumb">{vaultLabel}</span>
          <span className="spacer" />
          {onShare && <button type="button" className="btn btn-secondary vb-panel-share" onClick={onShare}><Share2 aria-hidden /> Share</button>}
          {onDelete && <IconButton label="Delete item" onClick={onDelete}><Trash2 /></IconButton>}
        </header>
        <div className="vb-panel-title-row">
          <Popover
            width={340} className="vb-picker-pop"
            trigger={({ open, toggle }) => (
              <button type="button" className="vb-icon-btn" aria-label="Change icon and colour" aria-expanded={open} onClick={toggle}>
                <ItemIcon data={d} size="lg" />
                <span className="vb-icon-edit" aria-hidden><Pencil /></span>
              </button>
            )}
          >
            {(close) => <IconPicker data={d} onDone={close} onPick={(p) => { setIconTouched(true); setD((cur) => ({ ...cur, ...p })); }} />}
          </Popover>
          <input id="vb-panel-title" className="vb-panel-title" autoFocus={!row} value={d.title} onChange={set("title")} placeholder="Item name" aria-label="Item name" maxLength={80} />
        </div>

        <dl className="vb-fields">
          <div className="vb-field">
            <dt>Website</dt>
            <dd>
              <input
                value={d.website} placeholder="https://" inputMode="url" aria-label="Website"
                onChange={(e) => {
                  const website = e.target.value;
                  const auto = !iconTouched ? brandForUrl(website)?.slug : undefined; // github.com → GitHub logo
                  setD((cur) => ({ ...cur, website, ...(!iconTouched && { icon: auto ?? "" }) }));
                }}
              />
              {d.website && <a className="vb-field-btn" href={d.website} target="_blank" rel="noreferrer noopener" aria-label="Open website"><ExternalLink /></a>}
            </dd>
          </div>
          <div className="vb-field">
            <dt>Username</dt>
            <dd>
              <input value={d.username} onChange={set("username")} placeholder="Email or username" autoComplete="off" aria-label="Username" />
              {d.username && <IconButton label="Copy username" onClick={() => copy(d.username, "Username")}><Copy /></IconButton>}
            </dd>
          </div>
          <div className="vb-field">
            <dt>Password</dt>
            <dd>
              <input type={show ? "text" : "password"} className="admin-mono" value={d.password} onChange={set("password")} placeholder="Password" autoComplete="new-password" aria-label="Password" />
              <IconButton label={show ? "Hide password" : "Show password"} onClick={() => setShow(!show)}>{show ? <EyeOff /> : <Eye />}</IconButton>
              {d.password && <IconButton label="Copy password" onClick={() => copy(d.password, "Password")}><Copy /></IconButton>}
              <Popover
                align="right" width={360} floating className="vg-pop"
                trigger={({ open, toggle }) => (
                  <button type="button" className={`vb-gen-btn${open ? " is-open" : ""}`} aria-expanded={open} onClick={toggle}>
                    <WandSparkles aria-hidden /><span>Generate</span>
                  </button>
                )}
              >
                {(close) => <PasswordGenerator onCancel={close} onUse={(password) => { setD((cur) => ({ ...cur, password })); setShow(true); close(); }} />}
              </Popover>
            </dd>
          </div>
          <div className="vb-field vb-field-strength"><dt /><dd><StrengthBar value={d.password} /></dd></div>
          <div className="vb-field is-notes">
            <dt>Notes</dt>
            <dd><textarea rows={4} value={d.notes} onChange={set("notes")} placeholder="Recovery codes, who to ask, anything else" aria-label="Notes" /></dd>
          </div>
        </dl>

        {shared && <SharedAccess shared={shared} onAddPeople={onShare} />}
        {row && (
          <p className="vb-panel-meta"><Avatar personId={row.updatedBy} size="sm" /> Last changed by {personById(row.updatedBy)?.name ?? "someone"} · {relativeTime(row.updatedAt)} ago</p>
        )}
        <footer className="vb-panel-foot">
          <span className="vb-panel-note">🔒 Encrypted in this browser before saving</span>
          <span className="spacer" />
          <button type="button" className="btn btn-tertiary" onClick={onClose}>{dirty ? "Cancel" : "Close"}</button>
          <button type="button" className="btn btn-primary" disabled={busy || !d.title.trim() || (!!row && !dirty)} onClick={save}>
            {busy ? "Encrypting…" : row ? "Save changes" : "Save item"}
          </button>
        </footer>
      </aside>
    </>
  );
}

/** Unlocked vault as a monday board: Personal (only you) and Shared (passwords shared with specific people). */
const NEW_SHARED = "new-shared"; // the item panel is creating a shared password

export function VaultBrowser() {
  const { db, me } = useMe();
  const vault = useVault();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<{ vaultId: string; id?: string } | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [sharing, setSharing] = useState<string[] | null>(null);
  const [view, setView] = useState<View>(() => { try { return localStorage.getItem(VIEW_KEY) === "table" ? "table" : "cards"; } catch { return "cards"; } }); // Cards unless you picked Table
  const pickView = (v: View) => { setView(v); try { localStorage.setItem(VIEW_KEY, v); } catch { /* not remembered */ } };
  const personal = db.vaults.find((v) => v.kind === "personal" && v.ownerId === me.id);
  const shared = db.vaults.filter((v) => v.kind === "shared" && v.keys[me.id]);
  const sharedOf = (vaultId: string) => shared.find((v) => v.id === vaultId);
  const rowsIn = (vaultId: string): Row[] => (vault.items[vaultId] ?? []).map((i) => ({ ...i, vaultId }));
  const q = query.trim().toLowerCase();
  const visible = (rows: Row[]) => rows
    .filter((r) => !q || `${r.data.title} ${r.data.username} ${r.data.website}`.toLowerCase().includes(q))
    .sort((a, b) => a.data.title.localeCompare(b.data.title));
  const personalRows = personal ? rowsIn(personal.id) : [];
  const sharedRows = shared.flatMap((v) => rowsIn(v.id));
  // What I can share: my personal passwords + shared ones I own.
  const shareable = [...personalRows, ...sharedRows.filter((r) => sharedOf(r.vaultId)?.createdBy === me.id)]
    .sort((a, b) => a.data.title.localeCompare(b.data.title));
  const openShared = open ? sharedOf(open.vaultId) : undefined;
  const openRow = open?.id ? [...personalRows, ...sharedRows].find((r) => r.id === open.id) : undefined;
  const isMine = !openShared || openShared.createdBy === me.id;

  return (
    <div className="vb">
      <div className="board-toolbar vb-toolbar">
        {personal && <button type="button" className="btn btn-primary" onClick={() => setOpen({ vaultId: personal.id })}><Plus aria-hidden /> New item</button>}
        <label className="input board-search">
          <Search aria-hidden />
          <input type="text" placeholder="Search vault" aria-label="Search vault" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <span className="spacer" />
        <div className="docs-view-switch" role="tablist" aria-label="View">
          <button type="button" role="tab" aria-selected={view === "cards"} onClick={() => pickView("cards")}><LayoutGrid aria-hidden /> Cards</button>
          <button type="button" role="tab" aria-selected={view === "table"} onClick={() => pickView("table")}><Table2 aria-hidden /> Table</button>
        </div>
        <button type="button" className="btn btn-secondary" onClick={() => setSharing([])}><Share2 aria-hidden /> Share several</button>
      </div>

      <div className={`ticket-grid vb-board is-${view}`}>
        {personal && (
          <VaultGroup
            id="vault-personal" label="Personal" icon={<UserRound />} color="var(--color-bright-blue)" rows={visible(personalRows)}
            openId={open?.id ?? null} onOpen={(r) => setOpen({ vaultId: r.vaultId, id: r.id })} view={view}
            onAdd={() => setOpen({ vaultId: personal.id })}
          />
        )}
        <VaultGroup
          id="vault-shared" label="Shared" icon={<Users />} color="var(--color-done-green)" rows={visible(sharedRows)} sharedOf={sharedOf}
          openId={open?.id ?? null} onOpen={(r) => setOpen({ vaultId: r.vaultId, id: r.id })} view={view}
          onAdd={() => setOpen({ vaultId: NEW_SHARED })}
        />
      </div>

      {open && (open.vaultId === personal?.id || openShared || open.vaultId === NEW_SHARED) && (
        <ItemPanel
          key={`${open.vaultId}/${open.id ?? "new"}`}
          vaultLabel={openShared || open.vaultId === NEW_SHARED ? "Shared" : "Personal"} row={openRow} shared={openShared}
          onSave={(d) => (open.vaultId === NEW_SHARED ? vault.createShared(d) : vault.saveItem(open.vaultId, d, open.id))}
          onDelete={open.id && isMine ? () => setDeleting(open.id!) : undefined}
          onShare={open.id && isMine ? () => setSharing([open.id!]) : undefined}
          onClose={() => setOpen(null)}
        />
      )}
      {sharing && (
        <ShareDialog rows={shareable} initial={sharing} onClose={() => setSharing(null)} onDone={() => { setSharing(null); setOpen(null); }} />
      )}
      {deleting && (
        <ConfirmDialog
          title="Delete this item?"
          body={openShared ? "It's deleted for everyone it's shared with." : "It's removed from your vault for good."}
          onCancel={() => setDeleting(null)} onConfirm={() => { vault.removeItem(deleting); setDeleting(null); setOpen(null); }}
        />
      )}
    </div>
  );
}
