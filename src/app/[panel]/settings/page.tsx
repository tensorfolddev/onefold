"use client";

import { useState } from "react";
import { notFound } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { addJobTitle, deleteJobTitle, isFreeMail, renameJobTitle, updateOrg } from "@/domain/commands";
import { useMe } from "@/data/StoreProvider";
import { IconButton } from "@/ui/primitives";
import { TeamsManager } from "@/features/people/TeamsManager";
import { errorOf, Field, FormError } from "@/ui/fields";

/** Admin Settings: the company itself, and the company-wide lists every picker in the app uses. */
export default function SettingsPage() {
  const { panel } = useMe();
  if (panel !== "admin") notFound();
  return (
    <div className="page admin-page">
      <header className="page-header">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-subtitle">Your company, job titles and teams</p>
        </div>
      </header>
      <Company />
      <JobTitles />
      <TeamsManager />
    </div>
  );
}

function Company() {
  const { db, me, act } = useMe();
  const { org } = db;
  const [name, setName] = useState(org.name);
  const [error, setError] = useState<string | null>(null);
  const canLock = !isFreeMail(org.emailDomain);

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const err = errorOf(() => updateOrg(db, me, { name }));
    if (err) return setError(err);
    if (name.trim() !== org.name && act((d, m) => updateOrg(d, m, { name }), { success: "Company renamed" })) setError(null);
  };

  return (
    <section className="admin-teams" aria-labelledby="company-title">
      <header className="team-header">
        <h2 id="company-title" className="team-title">Company</h2>
        <span className="muted">Short name: {org.slug}</span>
      </header>
      <form className="admin-inline-form" onSubmit={save} noValidate>
        <Field label="Company name">
          <input className="admin-input" value={name} onChange={(e) => { setName(e.target.value); setError(null); }} />
        </Field>
        <button type="submit" className="btn btn-secondary" disabled={name.trim() === org.name}>Save name</button>
        <FormError message={error} />
      </form>
      {canLock && (
        <label className="settings-toggle">
          <input
            type="checkbox" role="switch" checked={org.domainLock}
            onChange={(e) => act((d, m) => updateOrg(d, m, { domainLock: e.target.checked }), {
              success: e.target.checked ? `Invites limited to @${org.emailDomain}` : "Invites open to any email",
            })}
          />
          <span>
            <strong>Only @{org.emailDomain} emails can join</strong>
            <span className="muted">Turn off to invite contractors or clients with other email addresses.</span>
          </span>
        </label>
      )}
    </section>
  );
}

function JobTitles() {
  const { db, me, act } = useMe();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const usage = (t: string) => db.people.filter((p) => p.role === t).length;

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    const err = errorOf(() => addJobTitle(db, me, name));
    if (err) return setError(err);
    if (act((d, m) => addJobTitle(d, m, name), { success: `${name.trim()} added` })) { setName(""); setError(null); }
  };

  const rename = (from: string, input: HTMLInputElement) => {
    const to = input.value.trim();
    if (to === from) return;
    if (!act((d, m) => renameJobTitle(d, m, from, to), { success: `Renamed to ${to}` })) input.value = from;
  };

  return (
    <section className="admin-teams" aria-labelledby="job-titles">
      <header className="team-header">
        <h2 id="job-titles" className="team-title">Job titles</h2>
        <span className="muted">{db.jobTitles.length} titles · renaming one updates everyone who has it</span>
      </header>
      <form className="admin-inline-form" onSubmit={add} noValidate>
        <Field label="New job title">
          <input className="admin-input" value={name} placeholder="e.g. Data Scientist" onChange={(e) => setName(e.target.value)} />
        </Field>
        <button type="submit" className="btn btn-secondary"><Plus aria-hidden /> Add job title</button>
        <FormError message={error} />
      </form>
      <ul className="admin-titles">
        {db.jobTitles.map((t) => {
          const n = usage(t);
          return (
            <li key={t} className="admin-title-row">
              <input
                key={t} className="admin-input" defaultValue={t} aria-label={`Rename ${t}`}
                onBlur={(e) => rename(t, e.currentTarget)}
                onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
              />
              <span className="admin-title-count">{n} {n === 1 ? "person" : "people"}</span>
              <IconButton
                label={n ? `${t} is in use` : `Delete ${t}`}
                onClick={() => act((d, m) => deleteJobTitle(d, m, t), { success: `${t} deleted`, undoable: true })}
              >
                <Trash2 />
              </IconButton>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
