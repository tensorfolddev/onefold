"use client";

// Inviting teammates: emails + a role → one-time links. Until there's an email service (backend), admins copy and send them.
import { useEffect, useRef, useState } from "react";
import { Check, Copy, Plus, Send, Undo2, X } from "lucide-react";
import { addDays } from "@/domain/clock";
import { INVITE_DAYS, inviteMembers, inviteState, revokeInvite, type InviteInput } from "@/domain/commands";
import { relativeTime, shortDate } from "@/domain/status";
import { useMe } from "@/data/StoreProvider";
import type { Invite, Panel } from "@/domain/types";
import { IconButton } from "@/ui/primitives";
import { errorOf, FormError } from "@/ui/fields";
import { PANEL_LABEL } from "@/features/shell/AppShell";

const PANELS: Panel[] = ["developer", "manager", "admin"];
const PANEL_HINT: Record<Panel, string> = {
  developer: "works tickets on their products",
  manager: "runs their products and team",
  admin: "everything, including people and settings",
};

export const inviteLink = (token: string) => `${typeof window === "undefined" ? "" : window.location.origin}/invite/${token}`;

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

/** One row per person. Pasting a list ("a@x.io, b@x.io") splits it into rows. Hands back the invites it created. */
export function InviteForm({ onInvited, onCancel, cancelLabel = "Cancel" }: {
  onInvited: (invites: Invite[]) => void; onCancel?: () => void; cancelLabel?: string;
}) {
  const { db, me, act } = useMe();
  const nextId = useRef(1);
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

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const list: InviteInput[] = rows.filter((r) => r.email.trim()).map((r) => ({ email: r.email, panel: r.panel }));
    const err = errorOf(() => inviteMembers(db, me, list));
    if (err) return setError(err);
    const created = act(
      (d, m) => {
        const next = inviteMembers(d, m, list);
        return { db: next, key: next.invites.slice(-list.length) };
      },
      { success: list.length === 1 ? "Invite ready — copy the link" : `${list.length} invites ready — copy the links` },
    );
    if (Array.isArray(created)) onInvited(created);
  };

  return (
    <form className="inv-form" onSubmit={submit} noValidate>
      <div className="inv-rows">
        {rows.map((r, i) => (
          <div key={r.id} className="inv-row">
            <label className="input inv-email">
              <input
                type="email" inputMode="email" autoComplete="off" spellCheck={false} autoFocus={i === 0}
                placeholder={domain ? `teammate@${domain}` : "teammate@company.com"} aria-label={`Email ${i + 1}`}
                value={r.email} onChange={(e) => update(r.id, { email: e.target.value })} onPaste={(e) => onPaste(r, e)}
              />
            </label>
            <select className="admin-input inv-panel" aria-label={`Role for email ${i + 1}`} value={r.panel}
              onChange={(e) => update(r.id, { panel: e.target.value as Panel })}>
              {PANELS.map((p) => <option key={p} value={p}>{PANEL_LABEL[p]}</option>)}
            </select>
            <IconButton label={`Remove email ${i + 1}`} onClick={() => remove(r.id)}><X /></IconButton>
          </div>
        ))}
      </div>
      <button type="button" className="btn btn-tertiary inv-add" onClick={() => add([""], rows[rows.length - 1].panel)}>
        <Plus aria-hidden /> Add another
      </button>
      <ul className="inv-roles" aria-label="What each role can do">
        {PANELS.map((p) => <li key={p}><strong>{PANEL_LABEL[p]}</strong> — {PANEL_HINT[p]}</li>)}
      </ul>
      <p className="inv-hint">
        {domain ? `Only @${domain} emails can join (admins can change this in Settings).` : "Any email can join."}{" "}
        Paste a list to add several at once.
      </p>
      <FormError message={error} />
      <div className="inv-foot">
        {onCancel && <button type="button" className="btn btn-tertiary" onClick={onCancel}>{cancelLabel}</button>}
        <button type="submit" className="btn btn-primary"><Send aria-hidden /> Create invite links</button>
      </div>
    </form>
  );
}

/** The links to send after inviting. */
export function InviteLinks({ invites }: { invites: Invite[] }) {
  const { copied, copy } = useCopy();
  return (
    <div className="inv-links">
      <p className="inv-hint">
        Send each person their link. It works once, for that email, for {INVITE_DAYS} days. (Email delivery arrives with the backend.)
      </p>
      <ul className="inv-link-list">
        {invites.map((i) => (
          <li key={i.token} className="inv-link-row">
            <span className="inv-link-who">
              <strong>{i.email}</strong>
              <span className="chip sm admin-panel-chip" data-panel={i.panel}>{PANEL_LABEL[i.panel]}</span>
            </span>
            <code className="inv-link-url">{inviteLink(i.token)}</code>
            <button type="button" className="btn btn-secondary" onClick={() => copy(inviteLink(i.token), i.token)}>
              {copied === i.token ? <Check aria-hidden /> : <Copy aria-hidden />} {copied === i.token ? "Copied" : "Copy link"}
            </button>
          </li>
        ))}
      </ul>
      {invites.length > 1 && (
        <button type="button" className="btn btn-tertiary" onClick={() => copy(invites.map((i) => `${i.email}: ${inviteLink(i.token)}`).join("\n"), "all")}>
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
  const [created, setCreated] = useState<Invite[] | null>(null);

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

/** Invites nobody has used yet: copy the link again, or cancel it. */
export function PendingInvites() {
  const { db, act, can, personById } = useMe();
  const { copied, copy } = useCopy();
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
            <tr key={i.token} className="dash-row">
              <th scope="row" className="dash-name admin-email">{i.email}</th>
              <td data-label="Role"><span className="chip sm admin-panel-chip" data-panel={i.panel}>{PANEL_LABEL[i.panel]}</span> {i.role}</td>
              <td data-label="Invited">{relativeTime(i.createdAt)} · {personById(i.invitedBy)?.name ?? "—"}</td>
              <td data-label="Expires">{shortDate(addDays(i.createdAt, INVITE_DAYS).slice(0, 10))}</td>
              {canManage && (
                <td data-label="Actions" className="admin-actions">
                  <button type="button" className="btn btn-tertiary" onClick={() => copy(inviteLink(i.token), i.token)}>
                    {copied === i.token ? <Check aria-hidden /> : <Copy aria-hidden />} Copy link
                  </button>
                  <button
                    type="button" className="btn btn-tertiary"
                    onClick={() => act((d, m) => revokeInvite(d, m, i.token), { success: `Invite for ${i.email} cancelled`, undoable: true })}
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
