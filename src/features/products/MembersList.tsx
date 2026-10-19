"use client";

// A project's people: its two leads (product manager, project manager) up top, then everyone else on it as cards —
// job title, access, and what they carry here (open and done). Search them; add someone (searchable); remove a
// member (Undo in the toast). Leads change in Settings → General.
import { notFound } from "next/navigation";
import { Mail, Search, UserMinus, UserPlus, Users } from "lucide-react";
import { useState } from "react";
import { isOnProduct } from "@/domain/permissions";
import { projectOverview } from "@/domain/selectors/overview";
import { setMember } from "@/data/commands";
import { useMe } from "@/data/StoreProvider";
import type { Person } from "@/domain/types";
import { Avatar, EmptyState } from "@/ui/primitives";
import { Popover } from "@/ui/Popover";
import { PANEL_LABEL } from "@/features/shell/AppShell";

const FULL_LOAD = 8; // open tickets for a full bar: plenty on their plate
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const has = (p: Person, q: string) => `${p.name} ${p.role} ${p.email}`.toLowerCase().includes(q);

function PersonCard({ person, lead, load, onRemove }: { person: Person; lead?: string; load?: { open: number; done: number }; onRemove?: () => void }) {
  const open = load?.open ?? 0;
  return (
    <li className={`member-card${lead ? " is-lead" : ""}`}>
      <Avatar personId={person.id} size={lead ? "lg" : "md"} />
      <div className="member-main">
        <p className="member-name">{person.name}</p>
        <p className="member-role">{person.role || "—"}</p>
        <p className="member-tags">
          {lead && <span className="member-lead">{lead}</span>}
          <span className="chip sm admin-panel-chip" data-panel={person.panel}>{person.panel ? PANEL_LABEL[person.panel] : "No access"}</span>
        </p>
      </div>
      <div className="member-load" aria-label={`${open} open, ${load?.done ?? 0} done on this project`}>
        <span className="member-load-bar" aria-hidden><span style={{ width: `${Math.min(100, (open / FULL_LOAD) * 100)}%` }} /></span>
        <span className="member-load-text"><strong>{open}</strong> open · {load?.done ?? 0} done</span>
      </div>
      {onRemove && (
        <button type="button" className="member-remove" onClick={onRemove} aria-label={`Remove ${person.name}`} data-tip="Remove" data-tip-pos="top"><UserMinus aria-hidden /></button>
      )}
    </li>
  );
}

/** Add someone: search the company by name — or type a teammate's email (`onAddEmail`), since not everyone sees emails. */
function AddMember({ candidates, projectName, onAdd, onAddEmail }: {
  candidates: Person[]; projectName: string; onAdd: (p: Person) => void; onAddEmail: (email: string) => void;
}) {
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const shown = candidates.filter((p) => !needle || has(p, needle));
  const email = EMAIL_RE.test(needle) && !shown.some((p) => p.email.toLowerCase() === needle) ? needle : null;
  return (
    <Popover align="right" width={300} className="admin-picker member-picker" trigger={({ open, toggle }) => (
      <button type="button" className="btn btn-primary" aria-haspopup="menu" aria-expanded={open} onClick={() => { setQ(""); toggle(); }}>
        <UserPlus aria-hidden /> Add member
      </button>
    )}>
      {(close) => (
        <>
          <label className="input member-picker-search"><input autoFocus placeholder="Name or email" aria-label="Search people to add" value={q} onChange={(e) => setQ(e.target.value)} /></label>
          <div className="menu-section-label">Add to {projectName}</div>
          <div className="member-picker-list">
            {shown.map((p) => (
              <button key={p.id} type="button" role="menuitem" className="menu-item" onClick={() => { onAdd(p); close(); }}>
                <Avatar personId={p.id} size="sm" />
                <span className="member-picker-name">{p.name}</span>
                <span className="menu-item-end">{p.role}</span>
              </button>
            ))}
            {email && (
              <button type="button" role="menuitem" className="menu-item" onClick={() => { onAddEmail(email); close(); }}>
                <Mail aria-hidden /><span className="member-picker-name">Add {email}</span>
              </button>
            )}
            {!shown.length && !email && <p className="member-picker-empty">Nobody matches “{q}” — or type their email</p>}
          </div>
        </>
      )}
    </Popover>
  );
}

export function MembersList({ productKey }: { productKey: string }) {
  const { db, can, act, productByKey, personById, addMemberByEmail, toast } = useMe();
  const [q, setQ] = useState("");
  const product = productByKey(productKey);
  if (!product) notFound(); // ProductSpace already 404s; this narrows the type
  const editable = (person: Person) => can("members.edit", { product, person });
  const candidates = db.people.filter((p) => p.active && p.panel && !isOnProduct(p.id, product) && editable(p));
  const load = new Map(projectOverview(db, product.key).team.map((m) => [m.person.id, m]));
  const leadIds = [...new Set([product.pmId, product.projectManagerId])];
  const leads = leadIds.flatMap((id) => {
    const person = personById(id);
    const roles = [id === product.pmId && "Product manager", id === product.projectManagerId && "Project manager"].filter(Boolean).join(" · ");
    return person ? [{ person, roles }] : [];
  });
  const members = product.memberIds.filter((id) => !leadIds.includes(id)).flatMap((id) => personById(id) ?? []);
  const needle = q.trim().toLowerCase();
  const shownMembers = members.filter((p) => !needle || has(p, needle));
  const total = leads.length + members.length;
  const toggle = (p: Person, on: boolean) =>
    act((d, m) => setMember(d, m, product.key, p.id, on), { success: on ? `Added ${p.name}` : `Removed ${p.name}`, undoable: true });

  return (
    <section className="members" aria-labelledby="members-title">
      <header className="members-head">
        <div>
          <h2 id="members-title" className="members-title">Members <span className="muted">{total}</span></h2>
          <p className="members-sub">{product.ownerId
            ? <>Everyone who can open {product.name} — it&apos;s personal: nobody else sees it, not even admins.</>
            : <>Everyone who can open {product.name}. Admins see every project.</>}</p>
        </div>
        <div className="members-actions">
          {members.length > 3 && (
            <label className="docs-search members-search">
              <Search aria-hidden />
              <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search members" aria-label="Search members" />
            </label>
          )}
          {can("members.edit", { product }) && (
            <AddMember candidates={candidates} projectName={product.name} onAdd={(p) => toggle(p, true)}
              onAddEmail={(email) => void addMemberByEmail(product.key, email).then((name) => name && toast(`Added ${name}`, undefined, "success"))} />
          )}
        </div>
      </header>

      <h3 className="members-group">Leads</h3>
      <ul className="members-grid is-leads" aria-label="Leads">
        {leads.map(({ person, roles }) => <PersonCard key={person.id} person={person} lead={roles} load={load.get(person.id)} />)}
      </ul>

      <h3 className="members-group">Team <span className="muted">{members.length}</span></h3>
      {members.length ? (
        shownMembers.length ? (
          <ul className="members-grid" aria-label="Team">
            {shownMembers.map((p) => (
              <PersonCard key={p.id} person={p} load={load.get(p.id)} onRemove={editable(p) ? () => toggle(p, false) : undefined} />
            ))}
          </ul>
        ) : <p className="members-empty">Nobody matches “{q}”.</p>
      ) : (
        <EmptyState icon={<Users aria-hidden />} title="Only the leads so far">
          {candidates.length ? "Add the people who'll work on this project — they'll see its board, docs and decisions." : "Invite people to the company first, then add them here."}
        </EmptyState>
      )}
    </section>
  );
}
