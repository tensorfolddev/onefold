"use client";

import { notFound } from "next/navigation";
import { UserMinus, UserPlus } from "lucide-react";
import { isOnProduct } from "@/domain/permissions";
import { setMember } from "@/domain/commands";
import { useMe } from "@/data/StoreProvider";
import type { Person } from "@/domain/types";
import { Avatar } from "@/ui/primitives";
import { Popover } from "@/ui/Popover";
import { PANEL_LABEL } from "@/features/shell/AppShell";

/** Members tab: PM + project manager (fixed here) and members, editable per row via members.edit. */
export function MembersList({ productKey }: { productKey: string }) {
  const { db, can, act, productByKey, personById } = useMe();
  const product = productByKey(productKey);
  if (!product) notFound(); // ProductSpace already 404s; this narrows the type
  const editable = (person: Person) => can("members.edit", { product, person });
  const candidates = db.people.filter((p) => p.active && p.panel && !isOnProduct(p.id, product) && editable(p));
  const rows: { person: Person; label: string; removable: boolean }[] = [
    { id: product.pmId, label: "PM" },
    { id: product.projectManagerId, label: "Project manager" },
    ...product.memberIds.map((id) => ({ id, label: "Member" })),
  ].flatMap(({ id, label }) => {
    const person = personById(id);
    return person ? [{ person, label, removable: label === "Member" && editable(person) }] : [];
  });

  const toggle = (p: Person, on: boolean) =>
    act((d, m) => setMember(d, m, product.key, p.id, on), { success: on ? `Added ${p.name}` : `Removed ${p.name}`, undoable: true });

  return (
    <section className="admin-members" aria-labelledby="members-title">
      <div className="toolbar">
        <h2 id="members-title" className="section-title">Members <span className="muted">{rows.length}</span></h2>
        <span className="spacer" />
        {candidates.length > 0 && (
          <Popover
            align="right"
            width={280}
            className="admin-picker"
            trigger={({ open, toggle: t }) => (
              <button type="button" className="btn btn-primary" aria-haspopup="menu" aria-expanded={open} onClick={t}>
                <UserPlus aria-hidden /> Add member
              </button>
            )}
          >
            {(close) => (
              <>
                <div className="menu-section-label">Add to {product.name}</div>
                {candidates.map((p) => (
                  <button key={p.id} type="button" role="menuitem" className="menu-item" onClick={() => { toggle(p, true); close(); }}>
                    <Avatar personId={p.id} size="sm" />
                    {p.name}
                    <span className="menu-item-end">{p.role}</span>
                  </button>
                ))}
              </>
            )}
          </Popover>
        )}
      </div>

      <table className="dash-table admin-table">
        <thead>
          <tr>
            <th scope="col">Person</th>
            <th scope="col">Job title</th>
            <th scope="col">Panel</th>
            <th scope="col">On this product</th>
            <th scope="col"><span className="visually-hidden">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ person: p, label, removable }) => (
            <tr key={`${label}-${p.id}`} className="dash-row">
              <th scope="row" className="dash-name"><span className="dash-person"><Avatar personId={p.id} />{p.name}</span></th>
              <td data-label="Job title">{p.role}</td>
              <td data-label="Panel">
                <span className="chip sm admin-panel-chip" data-panel={p.panel}>{p.panel ? PANEL_LABEL[p.panel] : "No access"}</span>
              </td>
              <td data-label="On this product">{label}</td>
              <td data-label="Actions" className="admin-actions">
                {removable && (
                  <button type="button" className="btn btn-tertiary" onClick={() => toggle(p, false)} aria-label={`Remove ${p.name}`}>
                    <UserMinus aria-hidden /> Remove
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
