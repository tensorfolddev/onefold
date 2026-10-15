"use client";

// The Images section: paste, drop or pick; thumbnails open full size. Bytes go to the browser file store.
import { useEffect, useRef, useState } from "react";
import { Download, ImageOff, ImagePlus, Trash2, X } from "lucide-react";
import { IMAGE_TYPES, prepareImage, putFile, useFileUrl } from "@/features/tickets/files";
import { addAttachment, removeAttachment } from "@/data/commands";
import { useDb } from "@/data/StoreProvider";
import type { SectionDef } from "@/domain/templates";
import type { Attachment, Ticket } from "@/domain/types";
import { IconButton } from "@/ui/primitives";

const kb = (bytes: number) => (bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

export function ImagesSection({ def, ticket, editable }: { def: SectionDef; ticket: Ticket; editable: boolean }) {
  const { act, toast } = useDb();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(0);
  const [over, setOver] = useState(false);
  const [viewing, setViewing] = useState<Attachment | null>(null);
  const images = ticket.attachments ?? [];

  const addFiles = async (files: File[]) => {
    if (!files.length) return;
    const ok = files.filter((f) => IMAGE_TYPES.test(f.type));
    if (ok.length < files.length) toast("Only PNG, JPG, WebP or GIF images");
    for (const f of ok) {
      setBusy((n) => n + 1);
      try {
        const { blob, width, height } = await prepareImage(f);
        const id = `img-${crypto.randomUUID().slice(0, 8)}`;
        await putFile(id, blob);
        act((d, m) => addAttachment(d, m, ticket.key, { id, name: f.name || "pasted-image.png", type: blob.type, size: blob.size, width, height }));
      } catch (e) {
        toast(e instanceof Error && e.message.startsWith("Only") ? e.message : `Couldn't add ${f.name || "that image"}`);
      } finally {
        setBusy((n) => n - 1);
      }
    }
  };

  if (!editable && !images.length) return <p className="tpl-empty">No images</p>;
  return (
    <div
      className={`tpl-images${over ? " is-over" : ""}`}
      onDragOver={editable ? (e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setOver(true); } } : undefined}
      onDragLeave={editable ? () => setOver(false) : undefined}
      onDrop={editable ? (e) => { e.preventDefault(); setOver(false); void addFiles([...e.dataTransfer.files]); } : undefined}
    >
      <ul className="tpl-thumbs">
        {images.map((a) => <li key={a.id}><Thumb att={a} onOpen={() => setViewing(a)} /></li>)}
        {editable && (
          <li>
            <button
              type="button" className="tpl-thumb-add" onClick={() => input.current?.click()} aria-label="Add images"
              onPaste={(e) => { const files = [...e.clipboardData.files]; if (files.length) { e.preventDefault(); void addFiles(files); } }}
            >
              <ImagePlus aria-hidden />
              <span>{busy ? "Adding…" : "Add image"}</span>
              <small>Paste, drop or pick</small>
            </button>
          </li>
        )}
      </ul>
      {editable && images.length === 0 && <p className="tpl-hint">{def.hint}</p>}
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple hidden
        onChange={(e) => { void addFiles([...(e.target.files ?? [])]); e.target.value = ""; }} />
      {viewing && (
        <Lightbox
          att={viewing} onClose={() => setViewing(null)}
          onRemove={editable ? () => {
            const id = viewing.id;
            setViewing(null);
            act((d, m) => removeAttachment(d, m, ticket.key, id), { success: "Image removed", undoable: true });
          } : undefined}
        />
      )}
    </div>
  );
}

function Thumb({ att, onOpen }: { att: Attachment; onOpen: () => void }) {
  const url = useFileUrl(att.id);
  return (
    <button type="button" className="tpl-thumb" onClick={onOpen} title={`${att.name} · ${att.width}×${att.height} · ${kb(att.size)}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- local blob: URL, nothing for next/image to optimise */}
      {url ? <img src={url} alt={att.name} width={att.width} height={att.height} loading="lazy" decoding="async" />
        : url === null ? <span className="tpl-thumb-missing"><ImageOff aria-hidden />Not on this device</span>
        : <span className="tpl-thumb-loading" aria-label="Loading" />}
      <span className="tpl-thumb-name">{att.name}</span>
    </button>
  );
}

/** Full-size view. Native <dialog>: focus stays inside, Esc closes. */
function Lightbox({ att, onClose, onRemove }: { att: Attachment; onClose: () => void; onRemove?: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const url = useFileUrl(att.id);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    return () => d?.close();
  }, []);
  return (
    <dialog ref={ref} className="tpl-lightbox" aria-label={att.name}
      onCancel={(e) => { e.preventDefault(); onClose(); }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={(e) => { if (e.key === "Escape") e.stopPropagation(); }}>
      <header className="tpl-lightbox-head">
        <strong>{att.name}</strong>
        <span className="muted">{att.width}×{att.height} · {kb(att.size)}</span>
        <span className="spacer" />
        {url && <a className="btn btn-tertiary" href={url} download={att.name}><Download aria-hidden /> Download</a>}
        {onRemove && <button type="button" className="btn btn-tertiary is-danger" onClick={onRemove}><Trash2 aria-hidden /> Remove</button>}
        <IconButton label="Close" onClick={onClose}><X /></IconButton>
      </header>
      <div className="tpl-lightbox-body">
        {/* eslint-disable-next-line @next/next/no-img-element -- local blob: URL */}
        {url ? <img src={url} alt={att.name} width={att.width} height={att.height} />
          : <p className="tpl-empty">{url === null ? "This image isn't stored in this browser." : "Loading…"}</p>}
      </div>
    </dialog>
  );
}
