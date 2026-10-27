"use client";

// The team's dialogs for Client Space: add a client person (with their own link, to copy), a client's link (or, for an
// admin, a new one), and "View as client" — the client's own page, exactly as they see it, with nothing that acts.
import { useEffect, useRef, useState } from "react";
import { Check, Copy, UserPlus } from "lucide-react";
import { api, message } from "@/data/api";
import { useMe } from "@/data/StoreProvider";
import type { ClientView } from "@/domain/clientView";
import { clientRoom } from "@/domain/selectors/room";
import type { ClientRole } from "@/domain/types";
import { Room } from "../Room";

export const ROLE: Record<ClientRole, { label: string; hint: string }> = {
  sponsor: { label: "Sponsor", hint: "Confirms requirements, sees every request" },
  owner: { label: "Product owner", hint: "Confirms requirements and suggests new ones" },
  tester: { label: "Tester", hint: "Follows the work and answers what's asked of them" },
};
export const ROLES = Object.keys(ROLE) as ClientRole[];
export interface MadeLink { personId: string; link: string; emailed: boolean }

/** A dialog that opens as a modal when it mounts. */
function useModalRef() {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d?.open) d?.showModal();
    return () => d?.close();
  }, []);
  return ref;
}
const cancel = (onClose: () => void) => (e: React.SyntheticEvent) => { e.preventDefault(); onClose(); };

/** Their own link, to copy and send another way (WhatsApp): it keeps working until an admin makes a new one. */
function LinkBox({ made, name, fresh }: { made: MadeLink; name: string; fresh?: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = () => navigator.clipboard.writeText(made.link).then(() => setCopied(true), () => {});
  return (
    <div className="client-linkbox">
      <p className="decision-dialog-hint">
        {made.emailed ? `We emailed ${name} their link — you can send it on WhatsApp too.` : `Send ${name} this link — on WhatsApp, or however you talk.`}{" "}
        {fresh ? "Their old link no longer works. " : ""}It&apos;s theirs: it signs them in, no password, every time — until an admin makes a new one in Settings → Clients.
      </p>
      <div className="client-linkbox-row">
        <code className="client-link-text" aria-label="Their link">{made.link}</code>
        <button type="button" className="btn btn-primary client-btn-sm" onClick={() => void copy()}>{copied ? <><Check aria-hidden /> Copied</> : <><Copy aria-hidden /> Copy link</>}</button>
      </div>
    </div>
  );
}

/** Add someone from the client's side: name, email, company and role on this project. */
export function AddClientDialog({ productKey, onClose }: { productKey: string; onClose: () => void }) {
  const { productByKey } = useMe();
  const product = productByKey(productKey);
  const ref = useModalRef();
  const [form, setForm] = useState({ name: "", email: "", company: product?.client ?? "", role: "sponsor" as ClientRole });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [made, setMade] = useState<MadeLink | null>(null);
  const set = (patch: Partial<typeof form>) => { setForm((f) => ({ ...f, ...patch })); setError(null); };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try { setMade(await api<MadeLink>("/api/org/client-invite", { productKey, ...form })); } catch (err) { setError(message(err)); }
    setBusy(false);
  };
  return (
    <dialog ref={ref} className="confirm-dialog decision-dialog room-dialog client-dialog" aria-labelledby="add-client-title" onCancel={cancel(onClose)}>
      {made ? (
        <div>
          <h2 id="add-client-title" className="confirm-title">{form.name.trim()} is on {product?.name}</h2>
          <LinkBox made={made} name={form.name.trim()} />
          <div className="confirm-actions"><button type="button" className="btn btn-primary" onClick={onClose}>Done</button></div>
        </div>
      ) : (
        <form onSubmit={(e) => void submit(e)} noValidate>
          <h2 id="add-client-title" className="confirm-title">Add a client to {product?.name}</h2>
          <p className="decision-dialog-hint">They see this project&apos;s health, the requirements you send them, what you ask of them, and the conversations about those — nothing else.</p>
          <label className="field"><span className="field-label">Name</span>
            <span className="input"><input autoFocus value={form.name} maxLength={80} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Ali Raza" /></span></label>
          <label className="field"><span className="field-label">Email</span>
            <span className="input"><input type="email" value={form.email} maxLength={200} onChange={(e) => set({ email: e.target.value })} placeholder="ali@client.com" /></span></label>
          <label className="field"><span className="field-label">Company</span>
            <span className="input"><input value={form.company} maxLength={80} onChange={(e) => set({ company: e.target.value })} /></span></label>
          <fieldset className="client-role-pick">
            <legend className="field-label">Role on this project</legend>
            {ROLES.map((r) => (
              <label key={r} className="client-role-option">
                <input type="radio" name="client-role" checked={form.role === r} onChange={() => set({ role: r })} />
                <span><strong>{ROLE[r].label}</strong><span>{ROLE[r].hint}</span></span>
              </label>
            ))}
          </fieldset>
          {error && <p className="field-error" role="alert">{error}</p>}
          <div className="confirm-actions">
            <button type="button" className="btn btn-tertiary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={busy || !form.name.trim() || !form.email.trim()}><UserPlus aria-hidden /> Add and make link</button>
          </div>
        </form>
      )}
    </dialog>
  );
}

/** A client's own link, to copy — or, `fresh` (an admin, in Settings), a new one: the old one stops working. */
export function ClientLinkDialog({ personId, name, fresh, onClose }: { personId: string; name: string; fresh?: boolean; onClose: () => void }) {
  const ref = useModalRef();
  const [made, setMade] = useState<MadeLink | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<MadeLink>("/api/org/client-link", { personId, fresh: !!fresh }).then(setMade, (e: unknown) => setError(message(e)));
  }, [personId, fresh]);
  return (
    <dialog ref={ref} className="confirm-dialog decision-dialog room-dialog client-dialog" aria-labelledby="client-link-title" onCancel={cancel(onClose)}>
      <h2 id="client-link-title" className="confirm-title">{fresh ? `A new link for ${name}` : `${name}'s link`}</h2>
      {error ? <p className="field-error" role="alert">{error}</p> : made ? <LinkBox made={made} name={name} fresh={fresh} /> : <div className="app-loading" aria-busy="true" />}
      <div className="confirm-actions"><button type="button" className="btn btn-primary" onClick={onClose}>Done</button></div>
    </dialog>
  );
}

const PREVIEW_ACTIONS = { fileUrl: (id: string, download?: boolean) => `/api/files/${id}${download ? "?download=1" : ""}` };

/** "View as client": their chats for this project, from the server's own client view — what they'd really see. */
export function PreviewDialog({ personId, productKey, onClose }: { personId: string; productKey: string; onClose: () => void }) {
  const ref = useModalRef();
  const [view, setView] = useState<ClientView | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [subject, setSubject] = useState<string | null>(null);
  useEffect(() => {
    api<{ view: ClientView | null }>("/api/org/client-preview", { personId }).then((r) => setView(r.view), (e: unknown) => setError(message(e)));
  }, [personId]);
  const room = view ? clientRoom(view, productKey) : null;
  return (
    <dialog ref={ref} className="room-preview-dialog" aria-labelledby="client-preview-title" onCancel={cancel(onClose)}>
      <div className="room-preview-bar">
        <strong id="client-preview-title">{view ? `What ${view.me.name} sees` : "What the client sees"}</strong>
        <span className="room-muted">A preview — nothing here can be changed.</span>
        <span className="spacer" />
        <button type="button" className="btn btn-primary btn-sm" onClick={onClose} autoFocus>Close</button>
      </div>
      {error ? <p className="field-error" role="alert">{error}</p>
        : view === undefined ? <div className="app-loading" aria-busy="true" />
          : !room ? <p className="tpl-hint">They can&apos;t see this project right now — Client Space is off, or they&apos;re switched off.</p>
            : <Room room={room} actions={PREVIEW_ACTIONS} subject={subject} onSubject={setSubject} preview />}
    </dialog>
  );
}
