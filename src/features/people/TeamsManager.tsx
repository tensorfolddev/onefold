"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { membersOf } from "@/domain/selectors/dashboard";
import { addTeam, deleteTeam, updatePerson, updateTeam } from "@/data/commands";
import { useMe } from "@/data/StoreProvider";
import type { Team } from "@/domain/types";
import { Avatar } from "@/ui/primitives";
import { errorOf, FormError } from "@/ui/fields";

/** Admin-only: add teams, rename them, pick leads, and move people between teams. */
export function TeamsManager() {
  const { db, me, act } = useMe();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const people = db.people.filter((p) => p.active && p.panel);

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    const err = errorOf(() => addTeam(db, me, name));
    if (err) return setError(err);
    const teamId = `team-${crypto.randomUUID().slice(0, 8)}`; // named here, so the server's copy is the same team
    if (act((d, m) => addTeam(d, m, name, teamId), { success: `${name.trim()} team added` })) {
      setName("");
      setError(null);
    }
  };

  const rename = (t: Team, input: HTMLInputElement) => {
    const next = input.value.trim();
    if (next === t.name) return;
    if (!act((d, m) => updateTeam(d, m, t.id, { name: next }), { success: `Renamed to ${next}` })) input.value = t.name;
  };

  return (
    <div className="settings-stack">
      <div className="settings-card">
        <ul className="settings-rows" aria-label="Teams">
          {db.teams.map((t) => {
            const n = membersOf(db, t.id).length;
            return (
              <li key={t.id} className="settings-row is-team">
                <input key={t.name} className="settings-name" defaultValue={t.name} aria-label={`Rename ${t.name}`} maxLength={60}
                  onBlur={(e) => rename(t, e.currentTarget)} onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} />
                <select className="admin-input settings-kind" aria-label={`Lead of ${t.name}`} value={t.leadId}
                  onChange={(e) => act((d, m) => updateTeam(d, m, t.id, { leadId: e.target.value }), { success: "Lead updated" })}>
                  <option value="">No lead</option>
                  {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <span className="settings-row-count">{n} {n === 1 ? "person" : "people"}</span>
                <span className="settings-row-tools">
                  <button type="button" className="settings-icon-btn is-danger" aria-label={`Delete ${t.name} team`} data-tip="Delete"
                    onClick={() => act((d, m) => deleteTeam(d, m, t.id), { success: `${t.name} team deleted`, undoable: true })}>
                    <Trash2 aria-hidden />
                  </button>
                </span>
              </li>
            );
          })}
          {!db.teams.length && <li className="settings-row is-plain settings-row-empty">No teams yet — add your first below.</li>}
        </ul>
        <form className="settings-add" onSubmit={add} noValidate>
          <input value={name} placeholder="New team — e.g. Mobile" aria-label="New team" maxLength={60}
            onChange={(e) => { setName(e.target.value); setError(null); }} />
          <button type="submit" className="btn btn-secondary" disabled={!name.trim()}><Plus aria-hidden /> Add team</button>
        </form>
        {error && <div className="settings-pad"><FormError message={error} /></div>}
      </div>

      <h3 className="settings-subhead">Who&apos;s on which team</h3>
      <div className="settings-card">
        <ul className="settings-rows" aria-label="Who's on which team">
          {people.map((p) => (
            <li key={p.id} className="settings-row is-person">
              <span className="settings-person"><Avatar personId={p.id} size="sm" /><span className="settings-row-name">{p.name}</span></span>
              <span className="settings-row-count">{p.role || "—"}</span>
              <select className="admin-input settings-kind" aria-label={`Team for ${p.name}`} value={p.team}
                onChange={(e) => act((d, m) => updatePerson(d, m, p.id, { team: e.target.value }), { success: `${p.name} moved` })}>
                {db.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                <option value="leadership">Leadership</option>
              </select>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
