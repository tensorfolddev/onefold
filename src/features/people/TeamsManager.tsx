"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { membersOf } from "@/domain/selectors/dashboard";
import { addTeam, deleteTeam, updatePerson, updateTeam } from "@/data/commands";
import { useMe } from "@/data/StoreProvider";
import type { Team } from "@/domain/types";
import { Avatar, IconButton } from "@/ui/primitives";
import { errorOf, Field, FormError } from "@/ui/fields";

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
    if (act((d, m) => addTeam(d, m, name), { success: `${name.trim()} team added` })) {
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
    <section className="admin-teams" aria-labelledby="manage-teams">
      <header className="team-header">
        <h2 id="manage-teams" className="team-title">Manage teams</h2>
      </header>

      <form className="admin-inline-form" onSubmit={add} noValidate>
        <Field label="New team">
          <input className="admin-input" value={name} placeholder="e.g. Mobile" onChange={(e) => setName(e.target.value)} />
        </Field>
        <button type="submit" className="btn btn-secondary"><Plus aria-hidden /> Add team</button>
        <FormError message={error} />
      </form>

      <ul className="admin-team-list">
        {db.teams.map((t) => (
          <li key={t.id} className="card admin-team-card">
            <Field label="Team name">
              <input
                key={t.name}
                className="admin-input"
                defaultValue={t.name}
                onBlur={(e) => rename(t, e.currentTarget)}
                onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
              />
            </Field>
            <Field label="Lead">
              <select
                className="admin-input"
                value={t.leadId}
                onChange={(e) => act((d, m) => updateTeam(d, m, t.id, { leadId: e.target.value }), { success: "Lead updated" })}
              >
                <option value="">No lead</option>
                {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
            <span className="admin-team-foot">
              <span className="muted admin-team-count">{membersOf(db, t.id).length} people</span>
              <IconButton
                label={`Delete ${t.name} team`}
                onClick={() => act((d, m) => deleteTeam(d, m, t.id), { success: `${t.name} team deleted`, undoable: true })}
              >
                <Trash2 />
              </IconButton>
            </span>
          </li>
        ))}
      </ul>

      <h3 className="section-title admin-subtitle">Who is on which team</h3>
      <table className="dash-table admin-table">
        <thead>
          <tr>
            <th scope="col">Person</th>
            <th scope="col">Job title</th>
            <th scope="col">Team</th>
          </tr>
        </thead>
        <tbody>
          {people.map((p) => (
            <tr key={p.id} className="dash-row">
              <th scope="row" className="dash-name"><span className="dash-person"><Avatar personId={p.id} />{p.name}</span></th>
              <td data-label="Job title">{p.role}</td>
              <td data-label="Team">
                <select
                  className="admin-input admin-cell-select"
                  aria-label={`Team for ${p.name}`}
                  value={p.team}
                  onChange={(e) => act((d, m) => updatePerson(d, m, p.id, { team: e.target.value }), { success: `${p.name} moved` })}
                >
                  {db.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  <option value="leadership">Leadership</option>
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
