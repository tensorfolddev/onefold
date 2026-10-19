"use client";

// Sharing a page in My docs. It's private until its owner shares it — with some people (to read, or to write too), with
// everyone at the company, or with anyone who has its public link (signed out, read-only). Sharing is set on the top
// page, and its subpages share with it. Anyone else it's shared with sees who owns it and who else can see it.
import { Building2, Copy, Globe, Lock, Search, Users, X } from "lucide-react";
import { useEffect, useState } from "react";
import { api, message } from "@/data/api";
import { shareDoc } from "@/data/commands";
import type { DocSharing } from "@/domain/commands/docs";
import { useDb } from "@/data/StoreProvider";
import { personalAccess, rootOf } from "@/domain/docAccess";
import type { Doc, DocShare } from "@/domain/types";
import { Popover } from "@/ui/Popover";
import { Avatar } from "@/ui/primitives";

const SUGGESTED = 6;
type Level = "none" | "view" | "edit";
const LEVELS: { value: Level; label: string }[] = [{ value: "view", label: "Can view" }, { value: "edit", label: "Can edit" }];

export function ShareDoc({ doc }: { doc: Doc }) {
  const { db, me, act, personById, toast } = useDb();
  const [query, setQuery] = useState("");
  const root = rootOf(db.docs, doc);
  const own = doc.ownerId === me.id;
  const people = root.sharedWith ?? [];
  const company = root.companyAccess;
  const shared = people.length > 0 || !!company || !!root.isPublic;
  const owner = personById(doc.ownerId);
  const share = (input: DocSharing, success: string) => act((d, m) => shareDoc(d, m, doc.id, input), { success });

  const q = query.trim().toLowerCase();
  const matches = q ? db.people.filter((p) => p.active && p.panel && p.id !== root.ownerId && !people.some((s) => s.personId === p.id)
    && `${p.name} ${p.email}`.toLowerCase().includes(q)).slice(0, SUGGESTED) : [];
  const setPeople = (next: DocShare[], success: string) => share({ people: next }, success);
  const access = personalAccess(db.docs, me, doc);

  return (
    <Popover width={380} align="right" floating className="share-menu" trigger={({ open, toggle }) => (
      <button type="button" className={`docs-topbar-btn share-btn${shared ? " is-shared" : ""}`} aria-expanded={open} onClick={toggle}
        data-tip={root.isPublic ? "Anyone with the link can read it" : shared ? "Who can see this page" : "Only you can see this page"}>
        {root.isPublic ? <Globe aria-hidden /> : shared ? <Users aria-hidden /> : <Lock aria-hidden />} {root.isPublic ? "Public" : shared ? "Shared" : "Private"}
      </button>
    )}>
      {() => (
        <div className="share-panel">
          <p className="share-title">{own ? "Share this page" : `${owner?.name ?? "Someone"} shared this with you`}</p>
          <p className="share-note">
            {root.id !== doc.id ? <>Shared with its top page, <strong>{root.title}</strong>, and everything in it.</>
              : own ? `${shared ? "Shared" : "Private until you share it"}. Everything inside it is shared with it.`
              : access === "edit" ? "You can view and edit it." : "You can view it."}
          </p>

          {own && (
            <label className="input share-search">
              <Search aria-hidden />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Add people by name or email" aria-label="Add people" />
            </label>
          )}
          {matches.length > 0 && (
            <ul className="share-matches" aria-label="People to add">
              {matches.map((p) => (
                <li key={p.id}>
                  <button type="button" className="share-match" onClick={() => { setQuery(""); setPeople([...people, { personId: p.id }], `Shared with ${p.name}`); }}>
                    <Avatar personId={p.id} size="sm" /> <span>{p.name}</span><span className="muted">Can view</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <ul className="share-list" aria-label="Who can see it">
            <li>
              <Avatar personId={doc.ownerId} size="sm" />
              <span className="share-name">{owner?.name ?? "Owner"}{doc.ownerId === me.id && <span className="muted"> (you)</span>}</span>
              <span className="share-level is-fixed">Owner</span>
            </li>
            {people.map((s) => {
              const p = personById(s.personId);
              return (
                <li key={s.personId}>
                  <Avatar personId={s.personId} size="sm" />
                  <span className="share-name">{p?.name ?? "Someone who left"}{s.personId === me.id && <span className="muted"> (you)</span>}</span>
                  {own ? (
                    <>
                      <select className="share-level" aria-label={`What ${p?.name ?? "they"} can do`} value={s.edit ? "edit" : "view"}
                        onChange={(e) => setPeople(people.map((x) => (x.personId === s.personId ? { personId: x.personId, ...(e.target.value === "edit" && { edit: true }) } : x)), "Sharing updated")}>
                        {LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                      </select>
                      <button type="button" className="doc-row-btn" aria-label={`Stop sharing with ${p?.name ?? "them"}`} data-tip="Remove"
                        onClick={() => setPeople(people.filter((x) => x.personId !== s.personId), `${p?.name ?? "They"} can't see it any more`)}>
                        <X aria-hidden />
                      </button>
                    </>
                  ) : <span className="share-level is-fixed">{s.edit ? "Can edit" : "Can view"}</span>}
                </li>
              );
            })}
          </ul>

          <div className="share-company">
            <span className="share-company-icon" aria-hidden><Building2 /></span>
            <span className="share-name">Everyone at {db.org.name}</span>
            {own ? (
              <select className="share-level" aria-label={`What everyone at ${db.org.name} can do`} value={company ?? "none"}
                onChange={(e) => {
                  const v = e.target.value as Level;
                  share({ company: v === "none" ? null : v }, v === "none" ? "Only the people listed can see it" : `Everyone at ${db.org.name} can ${v} it`);
                }}>
                <option value="none">No access</option>
                {LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
              </select>
            ) : <span className="share-level is-fixed">{company === "edit" ? "Can edit" : company === "view" ? "Can view" : "No access"}</span>}
          </div>
          {own && root.id === doc.id ? <PublicLink docId={doc.id} on={!!root.isPublic} toast={toast} />
            : root.isPublic && <p className="share-note"><Globe aria-hidden className="share-inline-icon" /> Anyone with its link can read it.</p>}
        </div>
      )}
    </Popover>
  );
}

/** "Anyone with the link": a switch, and — when on — the link to copy. The link comes from the server (it isn't in the
 * company's data), only for the page's owner. Off, it stops working at once; on again, it's the same link. */
function PublicLink({ docId, on, toast }: { docId: string; on: boolean; toast: ReturnType<typeof useDb>["toast"] }) {
  const [path, setPath] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!on) { setPath(null); return; } // eslint-disable-line react-hooks/set-state-in-effect -- turned off elsewhere
    let live = true;
    api<{ path: string | null }>(`/api/docs/${docId}/public`).then((r) => { if (live) setPath(r.path); }).catch(() => {});
    return () => { live = false; };
  }, [docId, on]);
  const url = path ? `${location.origin}${path}` : "";
  const flip = async () => {
    setBusy(true);
    try {
      const r = await api<{ path: string | null }>(`/api/docs/${docId}/public`, { on: !on });
      setPath(r.path);
      toast(r.path ? "Anyone with the link can now read it" : "The public link is off — it no longer works", undefined, "success");
    } catch (e) {
      toast(message(e), undefined, "error");
    } finally {
      setBusy(false);
    }
  };
  const copy = async () => {
    await navigator.clipboard.writeText(url).catch(() => {});
    toast("Link copied", undefined, "success");
  };
  return (
    <div className="share-public">
      <div className="share-company">
        <span className="share-company-icon" aria-hidden><Globe /></span>
        <span className="share-name">Anyone with the link<span className="share-sub">Can read it, without signing in</span></span>
        <button type="button" role="switch" aria-checked={on} aria-label="Anyone with the link can read it" className="switch" disabled={busy} onClick={() => void flip()} />
      </div>
      {on && url && (
        <div className="share-link">
          <input className="input" readOnly value={url} aria-label="Public link" onFocus={(e) => e.currentTarget.select()} />
          <button type="button" className="btn btn-secondary" onClick={() => void copy()}><Copy aria-hidden /> Copy</button>
        </div>
      )}
    </div>
  );
}
