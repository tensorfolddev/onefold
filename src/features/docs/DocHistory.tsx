"use client";

// A doc's history: every version (who, when, how much changed), newest first. Open one to read it or see what changed
// against the current text, and restore it — what it replaces is kept as a version too, so nothing is ever lost.
import { ArchiveRestore, X } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { api, message } from "@/data/api";
import { useDb } from "@/data/StoreProvider";
import { Avatar } from "@/ui/primitives";
import type { VersionInfo } from "@/server/docs";
import { lineDiff } from "./lineDiff";

const DocEditor = dynamic(() => import("./editor/DocEditor"), { ssr: false, loading: () => <div className="doc-skeleton" aria-busy="true" /> });
const NO_LINKS = { people: [], tickets: [], docs: [] };
const dayOf = (iso: string) => new Date(iso).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

export function DocHistory({ docId, current, canRestore, onClose, onRestored }: {
  docId: string; current: string; canRestore: boolean; onClose: () => void; onRestored: () => void;
}) {
  const { personById, toast } = useDb();
  const [versions, setVersions] = useState<VersionInfo[] | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<(VersionInfo & { body: string }) | null>(null);
  const [mode, setMode] = useState<"read" | "changes">("changes");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<VersionInfo[]>(`/api/docs/${encodeURIComponent(docId)}/versions`).then(setVersions).catch((e: unknown) => setError(message(e)));
  }, [docId]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const show = (v: VersionInfo) => {
    api<VersionInfo & { body: string }>(`/api/docs/${encodeURIComponent(docId)}/versions/${encodeURIComponent(v.id)}`).then(setOpen).catch((e: unknown) => toast(message(e), undefined, "error"));
  };
  const restore = async () => {
    if (!open) return;
    setBusy(true);
    try {
      await api(`/api/docs/${encodeURIComponent(docId)}/versions/${encodeURIComponent(open.id)}`, {});
      toast(`Restored the version from ${dayOf(open.at)}, ${timeOf(open.at)}`, undefined, "success");
      onRestored();
      onClose();
    } catch (e) {
      toast(message(e), undefined, "error");
    } finally {
      setBusy(false);
    }
  };
  const diff = useMemo(() => (open ? lineDiff(open.body, current) : null), [open, current]);
  const days = useMemo(() => {
    const out: { day: string; items: VersionInfo[] }[] = [];
    for (const v of versions ?? []) {
      const day = dayOf(v.at);
      if (out.at(-1)?.day !== day) out.push({ day, items: [] });
      out.at(-1)!.items.push(v);
    }
    return out;
  }, [versions]);

  return (
    <>
      <div className="scrim is-light" onClick={onClose} aria-hidden />
      <aside className="doc-history" role="dialog" aria-modal="true" aria-label="Version history">
        <header className="doc-history-head">
          <h2>Version history</h2>
          <button type="button" className="docs-topbar-btn" aria-label="Close history" data-tip="Close" onClick={onClose}><X aria-hidden /></button>
        </header>
        <div className="doc-history-body">
          <nav className="doc-history-list" aria-label="Versions">
            {error && <p className="sidebar-empty">{error}</p>}
            {!versions && !error && <p className="sidebar-empty" aria-busy="true">Loading history…</p>}
            {versions?.length === 0 && <p className="sidebar-empty">No versions yet — they appear as people edit.</p>}
            {days.map((d) => (
              <section key={d.day}>
                <h3 className="doc-history-day">{d.day}</h3>
                {d.items.map((v, i) => {
                  const prev = d.items[i + 1] ?? versions![versions!.indexOf(v) + 1];
                  const delta = prev ? v.words - prev.words : v.words;
                  const who = personById(v.authorId ?? undefined);
                  return (
                    <button key={v.id} type="button" className={`doc-history-item${open?.id === v.id ? " is-active" : ""}`} onClick={() => show(v)}>
                      <Avatar personId={v.authorId ?? undefined} size="sm" />
                      <span className="doc-history-who">{who?.name ?? "Someone"}<span className="doc-history-when">{timeOf(v.at)}{v === versions![0] ? " · latest" : ""}</span></span>
                      <span className={`doc-history-delta${delta > 0 ? " is-up" : delta < 0 ? " is-down" : ""}`}>{delta > 0 ? `+${delta}` : delta} words</span>
                    </button>
                  );
                })}
              </section>
            ))}
          </nav>
          <div className="doc-history-view">
            {!open ? <p className="docs-empty" style={{ margin: 24 }}>Pick a version to read it, or to see what changed since.</p> : (
              <>
                <div className="doc-history-bar">
                  <div className="doc-history-tabs" role="tablist">
                    <button type="button" role="tab" aria-selected={mode === "changes"} onClick={() => setMode("changes")}>Changes since</button>
                    <button type="button" role="tab" aria-selected={mode === "read"} onClick={() => setMode("read")}>Read this version</button>
                  </div>
                  <span className="spacer" />
                  {canRestore && <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void restore()}><ArchiveRestore aria-hidden /> Restore this version</button>}
                </div>
                {mode === "read" ? (
                  <div className="doc-history-read"><DocEditor key={open.id} body={open.body} editable={false} onChange={() => {}} links={NO_LINKS} /></div>
                ) : diff ? (
                  <ol className="doc-diff" aria-label="Changes from this version to now">
                    {diff.every((l) => l.kind === "same") && <li className="is-same">No changes since this version.</li>}
                    {diff.map((l, i) => <li key={i} className={`is-${l.kind}`}><span aria-hidden>{l.kind === "added" ? "+" : l.kind === "removed" ? "−" : " "}</span>{l.text || " "}</li>)}
                  </ol>
                ) : <p className="sidebar-empty">This doc is too long to compare line by line — read the version instead.</p>}
              </>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
