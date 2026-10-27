"use client";

// Who's on a project's chats, in the project chat's details: the client's people and their roles (whoever manages
// the project adds them, changes roles, copies their link, sees what they see) and the team's leads.
import Link from "next/link";
import { useState } from "react";
import { Eye, Link2, UserMinus, UserPlus } from "lucide-react";
import { setProductClient } from "@/data/commands";
import { useMe } from "@/data/StoreProvider";
import type { ClientRole } from "@/domain/types";
import { Avatar } from "@/ui/primitives";
import { AnyAvatar } from "./AnyAvatar";
import { AddClientDialog, ClientLinkDialog, PreviewDialog, ROLE, ROLES } from "./ClientDialogs";

export function TeamPeople({ productKey }: { productKey: string }) {
  const { db, act, can, href, productByKey, clientById, personById } = useMe();
  const product = productByKey(productKey)!;
  const [dialog, setDialog] = useState<{ kind: "add" } | { kind: "link" | "preview"; id: string; name: string } | null>(null);
  const manages = can("client.people", { product }); // who the client's people are: managers and admins
  const leads = [...new Set([product.projectManagerId, product.pmId])].flatMap((id) => personById(id) ?? []);
  const setRole = (id: string, name: string, role: ClientRole | null) =>
    act((d, m) => setProductClient(d, m, product.key, id, role), { success: role ? `${name} is now ${ROLE[role].label}` : `${name} is off ${product.name}`, undoable: !role });
  const people = (product.clients ?? []).flatMap((pc) => { const c = clientById(pc.personId); return c ? [{ ...c, role: pc.role }] : []; });
  return (
    <>
      <section className="room-details-sec">
        <h4>{product.client || "Client"} {manages && db.org.clientSpace && product.type === "client" && <button type="button" className="btn btn-secondary btn-sm" onClick={() => setDialog({ kind: "add" })}><UserPlus aria-hidden /> Add</button>}</h4>
        {!db.org.clientSpace ? (
          <p className="room-muted">Client Space is off. {can("org.manage") ? <Link href={href("/settings#clients")}>Turn it on in Settings</Link> : "An admin can turn it on in Settings."}</p>
        ) : product.type !== "client" ? (
          <p className="room-muted">An internal project: everything here is between the team.</p>
        ) : !people.length ? (
          <p className="room-muted">Nobody from {product.client || "the client"} yet{manages ? " — add their Sponsor or Product owner to send them requirements." : "."}</p>
        ) : people.map((c) => (
          <div key={c.id} className="room-person" data-off={!c.active || undefined}>
            <AnyAvatar id={c.id} size="md" />
            <span className="room-person-text">
              {c.name}{!c.active && <em> · switched off</em>}
              <small>{c.email || c.company}</small>
              {manages ? (
                <select className="room-select is-small" aria-label={`${c.name}'s role`} value={c.role} onChange={(e) => setRole(c.id, c.name, e.target.value as ClientRole)}>
                  {ROLES.map((r) => <option key={r} value={r}>{ROLE[r].label}</option>)}
                </select>
              ) : <small>{ROLE[c.role].label}</small>}
            </span>
            {manages && (
              <span className="room-person-tools">
                <button type="button" className="room-icon-btn" aria-label={`See what ${c.name} sees`} data-tip="View as client" onClick={() => setDialog({ kind: "preview", id: c.id, name: c.name })}><Eye aria-hidden /></button>
                <button type="button" className="room-icon-btn" aria-label={`${c.name}'s link`} data-tip="Their link — copy it" onClick={() => setDialog({ kind: "link", id: c.id, name: c.name })}><Link2 aria-hidden /></button>
                <button type="button" className="room-icon-btn" aria-label={`Remove ${c.name} from ${product.name}`} data-tip="Remove from the project" onClick={() => setRole(c.id, c.name, null)}><UserMinus aria-hidden /></button>
              </span>
            )}
          </div>
        ))}
      </section>
      <section className="room-details-sec">
        <h4>{db.org.name}</h4>
        {leads.map((p) => <div key={p.id} className="room-person"><Avatar personId={p.id} /><span className="room-person-text">{p.name}<small>{p.id === product.projectManagerId ? "Project manager" : "Product manager"}</small></span></div>)}
        <p className="room-muted">Everyone on the project reads these chats and writes internal notes. Whoever manages it speaks to the client.</p>
      </section>
      {dialog?.kind === "add" && <AddClientDialog productKey={product.key} onClose={() => setDialog(null)} />}
      {dialog?.kind === "link" && <ClientLinkDialog personId={dialog.id} name={dialog.name} onClose={() => setDialog(null)} />}
      {dialog?.kind === "preview" && <PreviewDialog personId={dialog.id} productKey={product.key} onClose={() => setDialog(null)} />}
    </>
  );
}
