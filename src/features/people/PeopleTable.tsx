"use client";

import { useState } from "react";
import { Pencil, Search, UserPlus } from "lucide-react";
import { updatePerson } from "@/domain/commands";
import { useMe } from "@/data/StoreProvider";
import type { Person } from "@/domain/types";
import { Avatar, EmptyState, Tooltip } from "@/ui/primitives";
import { ConfirmDialog } from "@/ui/ConfirmDialog";
import { PANEL_LABEL } from "@/features/shell/AppShell";
import { InviteDialog, PendingInvites } from "./Invites";
import { OWN_ACCESS, PersonForm } from "./PersonForm";

export function PeopleTable() {
  const { db, me, can, act } = useMe();
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Person | null>(null);
  const [inviting, setInviting] = useState(false);
  const [confirming, setConfirming] = useState<Person | null>(null);
  const canManage = can("people.manage");
  const q = query.trim().toLowerCase();
  const people = db.people.filter((p) => !q || p.name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q));
  const teamName = (id: string) => (id === "leadership" ? "Leadership" : db.teams.find((t) => t.id === id)?.name ?? "—");
  const active = db.people.filter((p) => p.active).length;

  const toggleActive = (p: Person) => {
    setConfirming(null);
    act((d, m) => updatePerson(d, m, p.id, { active: !p.active }), { success: `${p.name} ${p.active ? "deactivated" : "reactivated"}` });
  };

  return (
    <div className="page admin-page">
      <header className="page-header">
        <div>
          <h1 className="page-title">People</h1>
          <span className="page-subtitle">{active} active of {db.people.length} · who can sign in, and where</span>
        </div>
        <span className="spacer" />
        {canManage && (
          <button type="button" className="btn btn-primary" onClick={() => setInviting(true)}><UserPlus aria-hidden /> Invite people</button>
        )}
      </header>

      <div className="toolbar">
        <label className="input admin-search">
          <Search aria-hidden />
          <input type="search" placeholder="Search name or email" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search people" />
        </label>
      </div>

      {people.length === 0 ? (
        <EmptyState icon={<Search aria-hidden />} title="No one matches">Try another name or email.</EmptyState>
      ) : (
        <table className="dash-table admin-table">
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Email</th>
              <th scope="col">Job title</th>
              <th scope="col">Panel</th>
              <th scope="col">Team</th>
              <th scope="col">Status</th>
              {canManage && <th scope="col"><span className="visually-hidden">Actions</span></th>}
            </tr>
          </thead>
          <tbody>
            {people.map((p) => {
              const isMe = p.id === me.id;
              const toggle = (
                <button
                  type="button"
                  className="btn btn-tertiary"
                  aria-disabled={isMe || undefined}
                  onClick={() => !isMe && (p.active ? setConfirming(p) : toggleActive(p))}
                >
                  {p.active ? "Deactivate" : "Reactivate"}
                </button>
              );
              return (
                <tr key={p.id} className={`dash-row${p.active ? "" : " is-inactive"}`}>
                  <th scope="row" className="dash-name">
                    <span className="dash-person"><Avatar personId={p.id} />{p.name}{isMe && <span className="muted">(you)</span>}</span>
                  </th>
                  <td data-label="Email" className="admin-email">{p.email}</td>
                  <td data-label="Job title">{p.role}</td>
                  <td data-label="Panel">
                    {p.panel
                      ? <span className="chip sm admin-panel-chip" data-panel={p.panel}>{PANEL_LABEL[p.panel]}</span>
                      : <span className="chip sm admin-panel-chip">No access</span>}
                  </td>
                  <td data-label="Team">{teamName(p.team)}</td>
                  <td data-label="Status">
                    <span className="admin-status" data-active={p.active}>{p.active ? "Active" : "Deactivated"}</span>
                  </td>
                  {canManage && (
                    <td data-label="Actions" className="admin-actions">
                      <button type="button" className="btn btn-tertiary" onClick={() => setEditing(p)} aria-label={`Edit ${p.name}`}>
                        <Pencil aria-hidden /> Edit
                      </button>
                      {isMe ? <Tooltip label={OWN_ACCESS}>{toggle}</Tooltip> : toggle}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <PendingInvites />
      {editing && <PersonForm key={editing.id} person={editing} onClose={() => setEditing(null)} />}
      {inviting && <InviteDialog onClose={() => setInviting(false)} />}
      {confirming && (
        <ConfirmDialog
          title={`Deactivate ${confirming.name}?`}
          body="They can't sign in until reactivated."
          confirmLabel="Deactivate"
          onConfirm={() => toggleActive(confirming)}
          onCancel={() => setConfirming(null)}
        />
      )}
    </div>
  );
}
