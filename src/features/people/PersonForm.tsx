"use client";

import { useEffect, useState } from "react";
import { Copy, Eye, EyeOff, RefreshCw, X } from "lucide-react";
import { MIN_PASSWORD, updatePerson } from "@/data/commands";
import { useMe } from "@/data/StoreProvider";
import type { Panel, Person, Role } from "@/domain/types";
import { Avatar, IconButton, Tooltip } from "@/ui/primitives";
import { PhotoDialog } from "./PhotoDialog";
import { PANEL_LABEL } from "@/features/shell/AppShell";
import { errorOf, Field, FormError } from "@/ui/fields";

const PANELS = Object.keys(PANEL_LABEL) as Panel[];
export const OWN_ACCESS = "You can't change your own access";

/** Readable random password: two 4-letter chunks + digits (no look-alike characters). */
function generatePassword() {
  const chars = "abcdefghjkmnpqrstuvwxyz";
  const pick = (n: number) => Array.from(crypto.getRandomValues(new Uint32Array(n)), (v) => chars[v % chars.length]).join("");
  const digits = String(crypto.getRandomValues(new Uint32Array(1))[0] % 90 + 10);
  return `${pick(4)}-${pick(4)}-${digits}`;
}

/** Slide-over to edit someone. New people join through an invite (InviteDialog), never with a password set for them. */
export function PersonForm({ person, onClose }: { person: Person; onClose: () => void }) {
  const { db, me, act, toast, setPassword: savePassword } = useMe();
  const [name, setName] = useState(person.name);
  const [role, setRole] = useState<Role>(person.role);
  const [panel, setPanel] = useState<Panel | "">(person.panel ?? "");
  const [team, setTeam] = useState(person.team);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ email: string; password: string } | null>(null);
  const [photo, setPhoto] = useState(false);
  const isMe = person.id === me.id;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password && password.length < MIN_PASSWORD) return setError(`Passwords need at least ${MIN_PASSWORD} characters`);
    const patch = { name, role, panel: panel || undefined, team };
    const err = errorOf(() => updatePerson(db, me, person.id, patch));
    if (err) return setError(err);
    if (!act((d, m) => updatePerson(d, m, person.id, patch), { success: `${name.trim()} updated` })) return;
    if (!password) return onClose();
    // The server hashes the new password (Argon2id) and signs them out everywhere else.
    setBusy(true);
    const problem = await savePassword(person.id, password);
    setBusy(false);
    if (problem) return setError(problem);
    setSaved({ email: person.email, password }); // show the new login to send
  };

  const copy = async () => {
    if (!saved) return;
    const text = `Your 1Fold login for ${db.org.name}\nEmail: ${saved.email}\nPassword: ${saved.password}\nSign in: ${window.location.origin}/signin`;
    try { await navigator.clipboard.writeText(text); toast("Login details copied"); } catch { toast("Couldn't copy — select the text instead"); }
  };

  const panelSelect = (
    <select className="admin-input" value={panel} disabled={isMe} onChange={(e) => setPanel(e.target.value as Panel | "")}>
      {PANELS.map((p) => <option key={p} value={p}>{PANEL_LABEL[p]}</option>)}
      <option value="">No access</option>
    </select>
  );

  return (
    <>
      <div className="scrim is-light" onClick={onClose} aria-hidden />
      <section className="slide-over" role="dialog" aria-modal="true" aria-labelledby="person-form-title">
        <div className="panel-header admin-panel-header">
          <h2 id="person-form-title" className="panel-title">{saved ? "Send their new login" : `Edit ${person.name}`}</h2>
          <span className="spacer" />
          <IconButton label="Close" onClick={onClose}><X /></IconButton>
        </div>
        {saved ? (
          <div className="admin-credentials">
            <p className="muted">Send these to {name.trim().split(/\s+/)[0]} so they can sign in. The password isn&apos;t shown again.</p>
            <dl>
              <div><dt>Email</dt><dd>{saved.email}</dd></div>
              <div><dt>Password</dt><dd className="admin-mono">{saved.password}</dd></div>
            </dl>
            <div className="admin-form-actions">
              <button type="button" className="btn btn-tertiary" onClick={onClose}>Done</button>
              <button type="button" className="btn btn-primary" onClick={copy}><Copy aria-hidden /> Copy login details</button>
            </div>
          </div>
        ) : (
          <form className="admin-form is-single" onSubmit={save} noValidate>
            <div className="person-photo">
              <Avatar personId={person.id} size="xl" />
              <button type="button" className="btn btn-secondary" onClick={() => setPhoto(true)}>Change photo</button>
            </div>
            <Field label="Full name">
              <input className="admin-input" value={name} onChange={(e) => setName(e.target.value)} autoFocus autoComplete="off" />
            </Field>
            <Field label="Email">
              <input className="admin-input" type="email" value={person.email} readOnly title="This is their login — they change it themselves" />
            </Field>
            <Field label="Job title">
              <select className="admin-input" value={role} onChange={(e) => setRole(e.target.value)}>
                {db.jobTitles.map((r) => <option key={r}>{r}</option>)}
              </select>
            </Field>
            <Field label="Panel">
              {isMe ? <Tooltip label={OWN_ACCESS}>{panelSelect}</Tooltip> : panelSelect}
            </Field>
            <Field label="Team">
              <select className="admin-input" value={team} onChange={(e) => setTeam(e.target.value)}>
                <option value="">No team</option>
                {db.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                <option value="leadership">Leadership</option>
              </select>
            </Field>
            <Field label="New password (leave empty to keep the current one)">
              <span className="admin-input-group">
                <input
                  className="admin-input admin-mono" type={showPassword ? "text" : "password"} value={password}
                  autoComplete="new-password" spellCheck={false} placeholder="••••••••"
                  onChange={(e) => setPassword(e.target.value)}
                />
                <IconButton label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword((v) => !v)}>
                  {showPassword ? <EyeOff /> : <Eye />}
                </IconButton>
                <button type="button" className="btn btn-secondary" onClick={() => { setPassword(generatePassword()); setShowPassword(true); }}>
                  <RefreshCw aria-hidden /> Generate
                </button>
              </span>
            </Field>
            <FormError message={error} />
            <div className="admin-form-actions">
              <button type="button" className="btn btn-tertiary" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={busy} aria-busy={busy}>{busy ? "Saving…" : "Save"}</button>
            </div>
          </form>
        )}
      </section>
      {photo && <PhotoDialog personId={person.id} onClose={() => setPhoto(false)} />}
    </>
  );
}
