"use client";

// The team's two dialogs in the Client tab: a request to the client (access, a file, a question), and the weekly
// update. Each becomes a card in a chat, and the client is emailed.
import { useEffect, useRef, useState } from "react";
import { Megaphone, Send, Wand2 } from "lucide-react";
import { createAsk, postUpdate } from "@/data/commands";
import { useMe } from "@/data/StoreProvider";
import { ASK_KINDS, MAX_UPDATE, nextAskCode, weekDraft } from "@/domain/commands/clients";
import { HEALTH } from "@/domain/status";
import type { AskKind } from "@/domain/types";
import { KIND, KindIcon } from "../roomUi";

function useModal() {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d?.open) d?.showModal();
    return () => d?.close();
  }, []);
  return ref;
}
const cancel = (onClose: () => void) => (e: React.SyntheticEvent) => { e.preventDefault(); onClose(); };
const PLACEHOLDER: Record<AskKind, string> = {
  access: "e.g. Access to your Stripe account", file: "e.g. Your logo as an SVG", question: "e.g. Which countries do you ship to?", other: "e.g. Sign the design off",
};

export function NewRequestDialog({ productKey, kind: first = "access", title: firstTitle = "", onClose, onCreated }: {
  productKey: string; kind?: AskKind; title?: string; onClose: () => void; onCreated: (askId: string) => void;
}) {
  const { db, act, productByKey, clientById } = useMe();
  const product = productByKey(productKey)!;
  const ref = useModal();
  const [form, setForm] = useState({ kind: first, title: firstTitle, invite: "", details: "", assigneeId: "", due: "" });
  const [error, setError] = useState<string>();
  const set = (patch: Partial<typeof form>) => { setForm((f) => ({ ...f, ...patch })); setError(undefined); };
  const code = nextAskCode(db, productKey);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) { setError("Say what you need."); return; }
    const id = crypto.randomUUID();
    const input = { kind: form.kind, title: form.title, details: form.details, invite: form.kind === "access" ? form.invite : null, assigneeId: form.assigneeId || null, due: form.due || null };
    if (act((d, m) => createAsk(d, m, productKey, input, id), { success: `${code} sent to ${product.client || "the client"}` })) onCreated(id);
  };
  return (
    <dialog ref={ref} className="confirm-dialog decision-dialog room-dialog" aria-labelledby="new-request-title" onCancel={cancel(onClose)}>
      <form onSubmit={submit} noValidate>
        <h2 id="new-request-title" className="confirm-title">Ask {product.client || "the client"} for something <span className="key">{code}</span></h2>
        <div className="room-kind-pick" role="radiogroup" aria-label="What kind">
          {ASK_KINDS.map((k) => (
            <button key={k} type="button" role="radio" aria-checked={form.kind === k} style={{ "--c": KIND[k].color } as React.CSSProperties} onClick={() => set({ kind: k })}>
              <KindIcon kind={k} /> {KIND[k].label}
            </button>
          ))}
        </div>
        <label className="field"><span className="field-label">What you need</span>
          <span className="input"><input autoFocus value={form.title} maxLength={200} placeholder={PLACEHOLDER[form.kind]} onChange={(e) => set({ title: e.target.value })} aria-invalid={!!error} /></span>
          {error && <span className="field-error" role="alert">{error}</span>}
        </label>
        {form.kind === "access" && (
          <label className="field"><span className="field-label">Who should they invite?</span>
            <span className="input"><input value={form.invite} maxLength={200} placeholder="e.g. payments@yourcompany.com" onChange={(e) => set({ invite: e.target.value })} /></span>
          </label>
        )}
        <label className="field"><span className="field-label">{form.kind === "access" ? "Why you need it" : "Details"} <span className="muted">(optional)</span></span>
          <textarea className="room-textarea is-fixed" value={form.details} maxLength={4000} onChange={(e) => set({ details: e.target.value })} />
        </label>
        <div className="room-dialog-row">
          <label className="field"><span className="field-label">For</span>
            <select className="room-select" value={form.assigneeId} onChange={(e) => set({ assigneeId: e.target.value })}>
              <option value="">Anyone at {product.client || "the client"}</option>
              {(product.clients ?? []).map((c) => <option key={c.personId} value={c.personId}>{clientById(c.personId)?.name}</option>)}
            </select>
          </label>
          <label className="field"><span className="field-label">By <span className="muted">(optional)</span></span>
            <span className="input"><input type="date" value={form.due} onChange={(e) => set({ due: e.target.value })} /></span>
          </label>
        </div>
        <div className="confirm-actions">
          <button type="button" className="btn btn-tertiary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary"><Send aria-hidden /> Send request</button>
        </div>
      </form>
    </dialog>
  );
}

export function WeeklyUpdateDialog({ productKey, onClose, onPosted }: { productKey: string; onClose: () => void; onPosted: () => void }) {
  const { db, act, productByKey } = useMe();
  const product = productByKey(productKey)!;
  const ref = useModal();
  const [form, setForm] = useState({ week: "", next: "", needs: "" });
  const [error, setError] = useState<string>();
  const [drafted, setDrafted] = useState(false);
  const set = (patch: Partial<typeof form>) => { setForm((f) => ({ ...f, ...patch })); setError(undefined); };
  const client = product.client || "the client";
  const draft = () => { set(weekDraft(db, productKey, new Date().toISOString())); setDrafted(true); };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.week.trim()) { setError("Say what happened this week."); return; }
    if (act((d, m) => postUpdate(d, m, productKey, form, crypto.randomUUID()), { success: `Update sent to ${client}` })) onPosted();
  };
  const part = (key: keyof typeof form, label: string, placeholder: string, first?: boolean) => (
    <label className="field"><span className="field-label">{label}{!first && <span className="muted"> (optional)</span>}<span className="room-count">{form[key].length}/{MAX_UPDATE}</span></span>
      <textarea className="room-textarea is-fixed" autoFocus={first} value={form[key]} maxLength={MAX_UPDATE} placeholder={placeholder}
        onChange={(e) => set({ [key]: e.target.value })} aria-invalid={first && !!error} />
      {first && error && <span className="field-error" role="alert">{error}</span>}
    </label>
  );
  return (
    <dialog ref={ref} className="confirm-dialog decision-dialog room-dialog room-update-dialog" aria-labelledby="weekly-update-title" onCancel={cancel(onClose)}>
      <form onSubmit={submit} noValidate>
        <h2 id="weekly-update-title" className="confirm-title"><Megaphone aria-hidden /> This week&apos;s update for {client}</h2>
        <p className="decision-dialog-hint">It goes in the project chat with the project&apos;s health ({HEALTH[product.health].label.toLowerCase()}) and stage, and everyone on their side gets an email. Lists and **bold** show as you write them.</p>
        <div className="room-update-draft">
          <button type="button" className="btn btn-secondary btn-sm" onClick={draft}><Wand2 aria-hidden /> {drafted ? "Draft again" : "Draft from this week"}</button>
          <span className="room-muted">{drafted ? `Check the words — ${client} sees exactly this, ticket titles included.` : "Fills it in from what was confirmed, finished and asked for this week."}</span>
        </div>
        {part("week", "This week", "e.g. Card payments are in testing.", true)}
        {part("next", "Next", "e.g. The beta goes out on Nov 3.")}
        {part("needs", "Needs from them", "e.g. Stripe access, by Oct 30.")}
        <div className="confirm-actions">
          <button type="button" className="btn btn-tertiary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary"><Send aria-hidden /> Send update</button>
        </div>
      </form>
    </dialog>
  );
}
