"use client";

import { useState } from "react";
import { notFound } from "next/navigation";
import { Archive, Building2, IdCard, Plus, Trash2, Users } from "lucide-react";
import { addJobTitle, deleteJobTitle, isFreeMail, renameJobTitle, updateOrg } from "@/data/commands";
import { useMe } from "@/data/StoreProvider";
import { TeamsManager } from "@/features/people/TeamsManager";
import { ArchivedDocsBucket } from "@/features/docs/ArchivedDocs";
import { ArchivedProductsBucket } from "@/features/products/ArchiveControls";
import { ArchivedDecisionsBucket } from "@/features/products/ArchivedDecisions";
import { ArchivedTicketsBucket } from "@/features/products/ArchivedTickets";
import { errorOf, FormError } from "@/ui/fields";
import { SettingsLayout, type SettingsSection } from "@/ui/SettingsLayout";

/** Admin Settings: the company itself, and the company-wide lists every picker in the app uses. */
export default function SettingsPage() {
  const { panel } = useMe();
  if (panel !== "admin") notFound();
  const sections: SettingsSection[] = [
    { id: "company", label: "Company", icon: Building2, hint: "Its name, and who can join it.", body: <Company /> },
    { id: "job-titles", label: "Job titles", icon: IdCard, hint: "The titles people pick from. Renaming one updates everyone who has it.", body: <JobTitles /> },
    { id: "teams", label: "Teams", icon: Users, hint: "Your teams and their leads, and who's on which.", body: <TeamsManager /> },
    { id: "archived", label: "Archived", icon: Archive, hint: "Everything archived across the company: bring it back, or delete it for good.",
      body: <div className="buckets"><ArchivedProductsBucket /><ArchivedTicketsBucket /><ArchivedDocsBucket productKey="" /><ArchivedDecisionsBucket /></div> },
  ];
  return (
    <div className="page admin-page settings-page">
      <header className="page-header">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-subtitle">Your company, its job titles and teams</p>
        </div>
      </header>
      <SettingsLayout sections={sections} />
    </div>
  );
}

function Company() {
  const { db, me, act } = useMe();
  const { org } = db;
  const [name, setName] = useState(org.name);
  const [error, setError] = useState<string | null>(null);
  const canLock = !isFreeMail(org.emailDomain);
  const changed = name.trim() !== org.name;

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const err = errorOf(() => updateOrg(db, me, { name }));
    if (err) return setError(err);
    if (changed && act((d, m) => updateOrg(d, m, { name }), { success: "Company renamed" })) setError(null);
  };
  const lock = (on: boolean) => act((d, m) => updateOrg(d, m, { domainLock: on }), {
    success: on ? `Invites limited to @${org.emailDomain}` : "Invites open to any email",
  });

  return (
    <div className="settings-card">
      <form className="settings-line" onSubmit={save} noValidate>
        <span className="settings-line-text">
          <label htmlFor="company-name">Company name</label>
          <span>On every page, and in the emails 1Fold sends</span>
        </span>
        <span className="settings-line-control">
          <input id="company-name" className="admin-input" value={name} maxLength={100} onChange={(e) => { setName(e.target.value); setError(null); }} />
          {changed && <button type="submit" className="btn btn-primary">Save</button>}
        </span>
        {error && <span className="settings-line-error"><FormError message={error} /></span>}
      </form>
      <div className="settings-line">
        <span className="settings-line-text">
          <strong>Short name</strong>
          <span>Picked when the company was made; it doesn&apos;t change</span>
        </span>
        <code className="settings-slug">{org.slug}</code>
      </div>
      {canLock && (
        <div className="settings-line">
          <span className="settings-line-text">
            <strong id="domain-lock">Only @{org.emailDomain} emails can join</strong>
            <span>Turn off to invite contractors or clients with other email addresses</span>
          </span>
          <button type="button" role="switch" aria-checked={org.domainLock} aria-labelledby="domain-lock" className="switch" onClick={() => lock(!org.domainLock)} />
        </div>
      )}
    </div>
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
    <div className="settings-card">
      <ul className="settings-rows" aria-label="Job titles">
        {db.jobTitles.map((t) => {
          const n = usage(t);
          return (
            <li key={t} className="settings-row is-plain">
              <input key={t} className="settings-name" defaultValue={t} aria-label={`Rename ${t}`} maxLength={60}
                onBlur={(e) => rename(t, e.currentTarget)} onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} />
              <span className="settings-row-count">{n ? `${n} ${n === 1 ? "person" : "people"}` : "Nobody yet"}</span>
              <span className="settings-row-tools">
                <button type="button" className="settings-icon-btn is-danger" disabled={n > 0}
                  aria-label={n ? `${t} is in use` : `Delete ${t}`} data-tip={n ? "In use — rename it instead" : "Delete"}
                  onClick={() => act((d, m) => deleteJobTitle(d, m, t), { success: `${t} deleted`, undoable: true })}>
                  <Trash2 aria-hidden />
                </button>
              </span>
            </li>
          );
        })}
      </ul>
      <form className="settings-add" onSubmit={add} noValidate>
        <input value={name} placeholder="New job title — e.g. Data Scientist" aria-label="New job title" maxLength={60}
          onChange={(e) => { setName(e.target.value); setError(null); }} />
        <button type="submit" className="btn btn-secondary" disabled={!name.trim()}><Plus aria-hidden /> Add</button>
      </form>
      {error && <div className="settings-pad"><FormError message={error} /></div>}
    </div>
  );
}
