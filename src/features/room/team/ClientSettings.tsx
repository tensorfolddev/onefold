"use client";

// Settings → Clients (admins): Client Space on or off for the company, and every client person — their own link (copy
// it, or make a new one: the old stops working), and switch one off: they're shut out at once. The Client tab's phases
// and priorities, in the company's own words, are just below it (ClientLookSettings).
import { useState } from "react";
import { Link2, RefreshCw } from "lucide-react";
import { setClientActive, setClientSettings } from "@/data/commands";
import { useMe } from "@/data/StoreProvider";
import { ConfirmDialog } from "@/ui/ConfirmDialog";
import { AnyAvatar } from "./AnyAvatar";
import { ClientLinkDialog } from "./ClientDialogs";

type LinkStep = { id: string; name: string; step: "show" | "confirm" | "fresh" } | null;

export function ClientSettings() {
  const { db, act } = useMe();
  const [link, setLink] = useState<LinkStep>(null);
  const { org } = db;
  const projectsOf = (id: string) => db.products.filter((p) => !p.archivedAt && p.clients?.some((c) => c.personId === id)).map((p) => p.name);
  return (
    <div className="settings-card">
      <div className="settings-line">
        <span className="settings-line-text">
          <strong id="client-space">Client Space</strong>
          <span>Clients sign in with their own link and follow their projects: health, the requirements you send them, and what you ask of them</span>
        </span>
        <button type="button" role="switch" aria-checked={!!org.clientSpace} aria-labelledby="client-space" className="switch"
          onClick={() => act((d, m) => setClientSettings(d, m, { clientSpace: !org.clientSpace }), { success: org.clientSpace ? "Client Space is off — clients can't sign in" : "Client Space is on — add clients from a client project's Client tab" })} />
      </div>
      {db.clientPeople.length > 0 && (
        <ul className="settings-rows" aria-label="Client people">
          {db.clientPeople.map((c) => (
            <li key={c.id} className="settings-row is-plain client-settings-row">
              <AnyAvatar id={c.id} />
              <span className="client-settings-who"><strong>{c.name}</strong><span>{c.company ? `${c.company} · ` : ""}{c.email}</span></span>
              <span className="settings-row-count">{projectsOf(c.id).join(", ") || "No project"}</span>
              <button type="button" className="btn btn-tertiary btn-sm" disabled={!c.active} onClick={() => setLink({ id: c.id, name: c.name, step: "show" })}><Link2 aria-hidden /> Link</button>
              <button type="button" className="btn btn-tertiary btn-sm" disabled={!c.active} onClick={() => setLink({ id: c.id, name: c.name, step: "confirm" })}><RefreshCw aria-hidden /> New link</button>
              <button type="button" role="switch" aria-checked={c.active} aria-label={`${c.name} can sign in`} className="switch"
                onClick={() => act((d, m) => setClientActive(d, m, c.id, !c.active), { success: c.active ? `${c.name} is switched off` : `${c.name} can sign in again` })} />
            </li>
          ))}
        </ul>
      )}
      {link?.step === "confirm" && (
        <ConfirmDialog title={`Make a new link for ${link.name}?`} confirmLabel="Make a new link"
          body={`Their current link stops working at once. We email them the new one, and you can copy it to send on WhatsApp.`}
          onConfirm={() => setLink({ ...link, step: "fresh" })} onCancel={() => setLink(null)} />
      )}
      {link && link.step !== "confirm" && <ClientLinkDialog personId={link.id} name={link.name} fresh={link.step === "fresh"} onClose={() => setLink(null)} />}
    </div>
  );
}
