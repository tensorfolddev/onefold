"use client";

// Someone's photo — your own, or (for an admin) anyone's: upload one from this device (cropped to a square and made
// small right here, so it's quick and light), pick a ready-made one, or go back to initials.
import { useEffect, useRef, useState } from "react";
import { Check, ImageUp, Trash2, X } from "lucide-react";
import { setPhoto } from "@/data/commands";
import { useMe } from "@/data/StoreProvider";
import { AVATAR_TEMPLATES } from "@/domain/avatars";
import { Avatar } from "@/ui/primitives";

const SIZE = 256;

/** The middle square of an image, SIZE px on a side, as a JPEG. */
async function squareJpeg(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("That file isn't a picture 1Fold can read — try a JPG or PNG"));
      i.src = url;
    });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Couldn't read that picture");
    ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, SIZE, SIZE);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't read that picture"))), "image/jpeg", 0.9));
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function PhotoDialog({ personId, onClose }: { personId: string; onClose: () => void }) {
  const { me, act, personById, toast, uploadPhoto } = useMe();
  const ref = useRef<HTMLDialogElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const person = personById(personId);
  useEffect(() => {
    const el = ref.current;
    if (el && !el.open) el.showModal();
    return () => el?.close();
  }, []);
  if (!person) return null;
  const mine = person.id === me.id;
  const pick = (photo: string | null, done: string) => act((d, m) => setPhoto(d, m, person.id, photo), { success: done });

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const problem = await uploadPhoto(person.id, await squareJpeg(file));
      if (problem) toast(problem, undefined, "error");
      else toast(mine ? "Your photo is up" : `${person.name.split(" ")[0]}'s photo is up`, undefined, "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't use that picture", undefined, "error");
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  return (
    <dialog ref={ref} className="pf-dialog photo-dialog" aria-labelledby="photo-title" onCancel={(e) => { e.preventDefault(); onClose(); }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <header className="pf-dialog-head">
        <h2 id="photo-title" className="pf-dialog-title">{mine ? "Your photo" : `${person.name}'s photo`}</h2>
        <button type="button" className="btn btn-tertiary btn-icon" aria-label="Close" onClick={onClose}><X aria-hidden /></button>
      </header>
      <div className="photo-body">
        <div className="photo-now">
          <Avatar personId={person.id} size="xl" />
          <div className="photo-now-actions">
            <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden aria-label="Photo file"
              onChange={(e) => void upload(e.target.files?.[0])} />
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => fileInput.current?.click()}>
              {busy ? <><span className="auth-spinner" aria-hidden /> Uploading…</> : <><ImageUp aria-hidden /> Upload from your device</>}
            </button>
            {person.photo && (
              <button type="button" className="btn btn-tertiary" disabled={busy} onClick={() => pick(null, "Back to initials")}>
                <Trash2 aria-hidden /> Remove photo
              </button>
            )}
            <span className="muted">A square from the middle of your picture is used.</span>
          </div>
        </div>
        <h3 className="photo-label">Or pick one</h3>
        <div className="photo-templates" role="radiogroup" aria-label="Ready-made photos">
          {AVATAR_TEMPLATES.map((t) => {
            const on = person.photo === `tpl:${t.id}`;
            return (
              <button key={t.id} type="button" role="radio" aria-checked={on} aria-label={t.id} className="photo-template" style={{ background: t.bg }}
                disabled={busy} onClick={() => pick(`tpl:${t.id}`, "Photo changed")}>
                <span aria-hidden>{t.emoji}</span>
                {on && <Check aria-hidden className="photo-template-on" />}
              </button>
            );
          })}
        </div>
      </div>
    </dialog>
  );
}
