"use client";

// Inviting teammates: emails + a role → one-time links, made by the server (it stores only each link's hash, so a
// link is shown once). The server emails each person their link; the links are also shown once to copy, as a backup.
import { useEffect, useRef, useState } from "react";
import {
  Briefcase, Check, ClipboardPaste, Code2, Copy, Globe, Lock, Mail, MailCheck, MailWarning, Plus, RotateCw, Send, ShieldCheck, Undo2, X,
  type LucideIcon,
} from "lucide-react";
import { addDays } from "@/domain/clock";
import { INVITE_DAYS, inviteMembers, inviteState, revokeInvite, type InviteInput } from "@/data/commands";
import { ApiError } from "@/data/api";
import { relativeTime, shortDate } from "@/domain/status";
import { useMe, type CreatedInvite } from "@/data/StoreProvider";
import type { Panel } from "@/domain/types";
import { IconButton } from "@/ui/primitives";
import { errorOf, FormError } from "@/ui/fields";
import { PANEL_LABEL } from "@/features/shell/AppShell";

const PANELS: Panel[] = ["developer", "manager", "admin"];
const PANEL_HINT: Record<Panel, string> = {
  developer: "Works on their products: tickets, docs, the roadmap",
  manager: "Runs their products and team",
  admin: "Everything, including people and settings",
};

/** Stands in for a link's hash when checking the form here; the server makes the real one. */
const CHECK_ONLY_HASH = "0".repeat(64);

function useCopy() {
  const { toast } = useMe();
  const [copied, setCopied] = useState<string | null>(null);
  const copy = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      toast("Copied");
    } catch {
      toast("Couldn't copy — select the link instead");
    }
  };
  return { copied, copy };
}

interface Row { id: number; email: string; panel: Panel }

/** Invites wait for a confirmed email (so nobody invites people in the name of an address they don't own). */
function ConfirmEmailFirst() {
  const { me, sendVerification } = useMe();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const resend = async () => {
    setBusy(true);
    const problem = await sendVerification();
    setBusy(false);
    setNote(problem ? { ok: false, text: problem } : { ok: true, text: `Sent — check ${me.email}` });
  };
  return (
    <div className="inv-confirm" role="status">
      <span className="inv-confirm-icon" aria-hidden><MailWarning /></span>
      <span className="inv-confirm-text">
        <strong>Confirm your email to send invites.</strong>
        <span>We emailed a link to <b>{me.email}</b> — open it, then come back here.</span>
        {note && <span className={`inv-confirm-note${note.ok ? "" : " is-error"}`} role={note.ok ? undefined : "alert"}>{note.text}</span>}
      </span>
      <button type="button" className="btn btn-secondary inv-confirm-btn" onClick={() => void resend()} disabled={busy}>
        <RotateCw aria-hidden /> {busy ? "Sending…" : "Send it again"}
      </button>
    </div>
  );
}

const PANEL_ICON: Record<Panel, LucideIcon> = { developer: Code2, manager: Briefcase, admin: ShieldCheck };

/** One row per person. Pasting a list ("a@x.io, b@x.io") splits it into rows. Hands back the invites it created. */
export function InviteForm({ onInvited, onCancel, cancelLabel = "Cancel" }: {
  onInvited: (invites: CreatedInvite[]) => void; onCancel?: () => void; cancelLabel?: string;
}) {
  const { db, me, createInvites, toast, emailUnverified } = useMe();
  const nextId = useRef(1);
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<Row[]>([{ id: 0, email: "", panel: "developer" }]);
  const [error, setError] = useState<string | null>(null);
  const domain = db.org.domainLock ? db.org.emailDomain : null;

  const update = (id: number, patch: Partial<Row>) => { setError(null); setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r))); };
  const add = (emails: string[], panel: Panel) =>
    setRows((rs) => [...rs, ...emails.map((email) => ({ id: nextId.current++, email, panel }))]);
  const remove = (id: number) => setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.id !== id) : [{ ...rs[0], email: "" }]));
  const onPaste = (row: Row, e: React.ClipboardEvent<HTMLInputElement>) => {
    const parts = e.clipboardData.getData("text").split(/[\s,;]+/).filter(Boolean);
    if (parts.length < 2) return;
    e.preventDefault();
    update(row.id, { email: parts[0] });
    add(parts.slice(1), row.panel);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const list: InviteInput[] = rows.filter((r) => r.email.trim()).map((r) => ({ email: r.email, panel: r.panel }));
    // Same checks as the server, right away; the server checks again and makes the links.
    const err = errorOf(() => inviteMembers(db, me, list.map((i) => ({ ...i, tokenHash: CHECK_ONLY_HASH }))));
    if (err) return setError(err);
    setBusy(true);
    try {
      const created = await createInvites(list);
      const allEmailed = created.every((i) => i.emailed);
      toast(created.length === 1 ? (allEmailed ? "Invite sent" : "Invite ready — copy the link")
        : allEmailed ? `${created.length} invites sent` : `${created.length} invites ready — copy the links`);
      onInvited(created);
    } catch (problem) {
      setError(problem instanceof ApiError ? problem.message : "Couldn't create the invites — please try again");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="inv-form" onSubmit={submit} noValidate>
      {emailUnverified && <ConfirmEmailFirst />}
      <div className="inv-rows">
        {rows.map((r, i) => (
          <div key={r.id} className="inv-row">
            <span className={`inv-avatar${r.email.trim() ? " is-filled" : ""}`} aria-hidden>{r.email.trim() ? r.email.trim()[0].toUpperCase() : <Mail />}</span>
            <input
              className="inv-email" type="email" inputMode="email" autoComplete="off" spellCheck={false} autoFocus={i === 0}
              placeholder={domain ? `teammate@${domain}` : "teammate@company.com"} aria-label={`Email ${i + 1}`}
              value={r.email} onChange={(e) => update(r.id, { email: e.target.value })} onPaste={(e) => onPaste(r, e)}
            />
            <select className="inv-panel" aria-label={`Role for email ${i + 1}`} value={r.panel}
              onChange={(e) => update(r.id, { panel: e.target.value as Panel })}>
              {PANELS.map((p) => <option key={p} value={p}>{PANEL_LABEL[p]}</option>)}
            </select>
            <button type="button" className="inv-remove" aria-label={`Remove email ${i + 1}`} onClick={() => remove(r.id)}><X aria-hidden /></button>
          </div>
        ))}
      </div>
      <div className="inv-tools">
        <button type="button" className="btn btn-tertiary inv-add" onClick={() => add([""], rows[rows.length - 1].panel)}>
          <Plus aria-hidden /> Add another
        </button>
        <span className="inv-tip"><ClipboardPaste aria-hidden /> Paste a list to add several at once</span>
      </div>
      <ul className="inv-roles" aria-label="What each role can do">
        {PANELS.map((p) => {
          const Icon = PANEL_ICON[p];
          return (
            <li key={p} className="inv-role" data-panel={p}>
              <span className="inv-role-icon" aria-hidden><Icon /></span>
              <span><strong>{PANEL_LABEL[p]}</strong><span>{PANEL_HINT[p]}</span></span>
            </li>
          );
        })}
      </ul>
      <p className="inv-domain">
        {domain
          ? <><Lock aria-hidden /> <span>Only @{domain} emails can join (admins can change this in Settings).</span></>
          : <><Globe aria-hidden /> <span>Any email can join.</span></>}
      </p>
      <FormError message={error} />
      <div className="inv-foot">
        {onCancel && <button type="button" className="btn btn-tertiary" onClick={onCancel}>{cancelLabel}</button>}
        <button type="submit" className="btn btn-primary" disabled={busy} aria-busy={busy}><Send aria-hidden /> {busy ? "Creating…" : "Create invite links"}</button>
      </div>
    </form>
  );
}

/** After inviting: who got their link by email, and every link to copy (shown this once). */
export function InviteLinks({ invites }: { invites: CreatedInvite[] }) {
  const { copied, copy } = useCopy();
  const allEmailed = invites.every((i) => i.emailed);
  return (
    <div className="inv-links">
      <p className="inv-hint">
        {allEmailed ? "We emailed each person their link. You can also copy it below — " : "Send each person their link now — "}
        for security it isn&apos;t shown again. It works once, for that email, for {INVITE_DAYS} days.
      </p>
      <ul className="inv-link-list">
        {invites.map((i) => (
          <li key={i.id} className="inv-link-row">
            <span className="inv-link-who">
              <strong>{i.email}</strong>
              <span className="chip sm admin-panel-chip" data-panel={i.panel}>{PANEL_LABEL[i.panel]}</span>
              {i.emailed
                ? <span className="inv-sent"><MailCheck aria-hidden /> Emailed</span>
                : <span className="inv-sent is-off"><MailWarning aria-hidden /> Not emailed — copy the link</span>}
            </span>
            <code className="inv-link-url">{i.link}</code>
            <button type="button" className="btn btn-secondary" onClick={() => copy(i.link, i.id)}>
              {copied === i.id ? <Check aria-hidden /> : <Copy aria-hidden />} {copied === i.id ? "Copied" : "Copy link"}
            </button>
          </li>
        ))}
      </ul>
      {invites.length > 1 && (
        <button type="button" className="btn btn-tertiary" onClick={() => copy(invites.map((i) => `${i.email}: ${i.link}`).join("\n"), "all")}>
          {copied === "all" ? <Check aria-hidden /> : <Copy aria-hidden />} Copy all links
        </button>
      )}
    </div>
  );
}

/** Modal: invite form, then the links. Render only while open. */
export function InviteDialog({ onClose }: { onClose: () => void }) {
  const { db } = useMe();
  const ref = useRef<HTMLDialogElement>(null);
  const [created, setCreated] = useState<CreatedInvite[] | null>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d?.open) d?.showModal();
    return () => d?.close();
  }, []);

  return (
    <dialog ref={ref} className="pf-dialog inv-dialog" aria-labelledby="inv-title" onCancel={(e) => { e.preventDefault(); onClose(); }}>
      <header className="pf-dialog-head">
        <div>
          <h2 id="inv-title" className="pf-dialog-title">{created ? "Send the invite links" : `Invite people to ${db.org.name}`}</h2>
          {!created && <p className="muted">They choose their own name and password when they open the link.</p>}
        </div>
        <IconButton label="Close" onClick={onClose}><X /></IconButton>
      </header>
      <div className="inv-body">
        {created ? (
          <>
            <InviteLinks invites={created} />
            <div className="inv-foot">
              <button type="button" className="btn btn-tertiary" onClick={() => setCreated(null)}>Invite more</button>
              <button type="button" className="btn btn-primary" onClick={onClose}>Done</button>
            </div>
          </>
        ) : (
          <InviteForm onInvited={setCreated} onCancel={onClose} />
        )}
      </div>
    </dialog>
  );
}

/** Invites nobody has used yet. A lost link can't be shown again (only its hash is kept): cancel and invite again. */
export function PendingInvites() {
  const { db, act, can, personById } = useMe();
  const pending = db.invites.filter((i) => inviteState(i) === "pending").sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (!pending.length) return null;
  const canManage = can("people.manage");

  return (
    <section className="inv-pending" aria-labelledby="inv-pending-title">
      <h2 id="inv-pending-title" className="inv-pending-title">Pending invites <span className="muted">{pending.length}</span></h2>
      <table className="dash-table admin-table">
        <thead>
          <tr>
            <th scope="col">Email</th>
            <th scope="col">Role</th>
            <th scope="col">Invited</th>
            <th scope="col">Expires</th>
            {canManage && <th scope="col"><span className="visually-hidden">Actions</span></th>}
          </tr>
        </thead>
        <tbody>
          {pending.map((i) => (
            <tr key={i.id} className="dash-row">
              <th scope="row" className="dash-name admin-email">{i.email}</th>
              <td data-label="Role"><span className="chip sm admin-panel-chip" data-panel={i.panel}>{PANEL_LABEL[i.panel]}</span> {i.role}</td>
              <td data-label="Invited">{relativeTime(i.createdAt)} · {personById(i.invitedBy)?.name ?? "—"}</td>
              <td data-label="Expires">{shortDate(addDays(i.createdAt, INVITE_DAYS).slice(0, 10))}</td>
              {canManage && (
                <td data-label="Actions" className="admin-actions">
                  <button
                    type="button" className="btn btn-tertiary"
                    onClick={() => act((d, m) => revokeInvite(d, m, i.id), { success: `Invite for ${i.email} cancelled`, undoable: true })}
                  >
                    <Undo2 aria-hidden /> Cancel invite
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
