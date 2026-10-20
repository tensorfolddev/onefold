"use client";

// Settings → Archived: each kind of archived thing as a bucket — how many, and the latest — that opens into a window
// with all of them (searchable, select several), so hundreds of them never stretch the settings page.
import { useEffect, useRef, useState } from "react";
import { ChevronRight, X, type LucideIcon } from "lucide-react";
import { shortDate } from "@/domain/status";
import { IconButton } from "./primitives";

export function ArchiveBucket({ icon: Icon, title, count, latest, children }: {
  icon: LucideIcon; title: string; count: number; latest?: { name: string; at?: string };
  /** The full list; `close` shuts the window first (to open a ticket, say). */
  children: (close: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="bucket" aria-haspopup="dialog" onClick={() => setOpen(true)}>
        <span className="bucket-icon" aria-hidden><Icon /></span>
        <span className="bucket-main">
          <strong>{title}</strong>
          <span>{count && latest ? <>Latest: {latest.name}{latest.at && ` · ${shortDate(latest.at)}`}</> : "Nothing archived"}</span>
        </span>
        <span className="bucket-count">{count}</span>
        <ChevronRight className="bucket-go" aria-hidden />
      </button>
      {open && <BucketWindow title={title} count={count} onClose={() => setOpen(false)}>{children(() => setOpen(false))}</BucketWindow>}
    </>
  );
}

function BucketWindow({ title, count, onClose, children }: { title: string; count: number; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    return () => d?.close();
  }, []);
  return (
    <dialog ref={ref} className="pf-dialog bucket-dialog" aria-labelledby="bucket-title" onCancel={(e) => { e.preventDefault(); onClose(); }}>
      <header className="pf-dialog-head">
        <h2 id="bucket-title" className="pf-dialog-title">{title} <span className="muted">{count}</span></h2>
        <IconButton label="Close" onClick={onClose}><X /></IconButton>
      </header>
      <div className="bucket-body">{children}</div>
    </dialog>
  );
}
