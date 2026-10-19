"use client";

// Account menu → Notifications & sounds, for everyone: sounds on or off, how loud, and the sound a new notification
// makes — and an urgent (@@) one: one of 1FOLD's (tap one to hear it), or your own file. Kept in this browser.
import { Check, Play, Upload, Volume2, VolumeX, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useMe } from "@/data/StoreProvider";
import { isSoundOn, setSoundOn } from "@/features/tickets/sounds";
import { IconButton } from "@/ui/primitives";
import {
  choose, chosen, CUSTOM, customSound, MAX_CUSTOM_BYTES, NOTIFY_SOUNDS, previewNotice, setCustomSound, setVolume, URGENT_SOUNDS, volume,
  type NoticeKind, type NoticeSound,
} from "./noticeSounds";

export function SoundSettings({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [on, setOn] = useState(isSoundOn);
  const [level, setLevel] = useState(volume);
  useEffect(() => {
    const d = ref.current;
    if (!d?.open) d?.showModal();
    return () => d?.close();
  }, []);

  return (
    <dialog ref={ref} className="pf-dialog snd-dialog" aria-labelledby="snd-title" onCancel={(e) => { e.preventDefault(); onClose(); }}>
      <header className="pf-dialog-head">
        <div>
          <h2 id="snd-title" className="pf-dialog-title">Notifications &amp; sounds</h2>
          <p className="muted">How 1Fold sounds for you, in this browser</p>
        </div>
        <IconButton label="Close" onClick={onClose}><X /></IconButton>
      </header>
      <div className="snd-body">
        <div className="snd-card">
          <div className="snd-row">
            <div><strong>Sounds</strong><span>New notifications, and moving tickets on the board</span></div>
            <button type="button" role="switch" aria-checked={on} aria-label="Sounds" className="switch" onClick={() => { setSoundOn(!on); setOn(!on); }} />
          </div>
          <div className={`snd-row${on ? "" : " is-off"}`}>
            <div><strong>Volume</strong><span>{Math.round(level * 100)}%</span></div>
            <div className="snd-volume">
              <VolumeX aria-hidden />
              <input type="range" min={0} max={1} step={0.05} value={level} aria-label="Volume" disabled={!on}
                onChange={(e) => { const v = Number(e.target.value); setLevel(v); setVolume(v); }}
                onPointerUp={() => previewNotice("notify")} onKeyUp={() => previewNotice("notify")} />
              <Volume2 aria-hidden />
            </div>
          </div>
        </div>
        <SoundPicker kind="notify" title="New notification" hint="A mention, an assignment — anything new for you" sounds={NOTIFY_SOUNDS} disabled={!on} />
        <SoundPicker kind="urgent" title="Urgent (@@)" hint="When someone @@mentions you — made to be heard from another tab" sounds={URGENT_SOUNDS} disabled={!on} />
      </div>
      <footer className="inv-foot snd-foot">
        <button type="button" className="btn btn-primary" onClick={onClose}>Done</button>
      </footer>
    </dialog>
  );
}

function SoundPicker({ kind, title, hint, sounds, disabled }: { kind: NoticeKind; title: string; hint: string; sounds: NoticeSound[]; disabled: boolean }) {
  const { toast } = useMe();
  const [pick, setPick] = useState(() => chosen(kind));
  const [hasCustom, setHasCustom] = useState(() => !!customSound(kind));
  const file = useRef<HTMLInputElement>(null);
  const select = (id: string) => { choose(kind, id); setPick(id); previewNotice(kind, id); };

  const upload = (f: File) => {
    if (!f.type.startsWith("audio/")) { toast("Pick a sound file — MP3, WAV or OGG", undefined, "error"); return; }
    if (f.size > MAX_CUSTOM_BYTES) { toast("Keep your sound under 1 MB — a second or two is plenty", undefined, "error"); return; }
    const reader = new FileReader();
    reader.onload = () => {
      if (!setCustomSound(kind, String(reader.result))) { toast("This browser couldn't keep that sound — try a smaller file", undefined, "error"); return; }
      setHasCustom(true);
      setPick(CUSTOM);
      previewNotice(kind, CUSTOM);
    };
    reader.readAsDataURL(f);
  };

  return (
    <section className={`snd-section${disabled ? " is-off" : ""}`} aria-labelledby={`snd-${kind}`}>
      <div className="snd-section-head"><strong id={`snd-${kind}`}>{title}</strong><span>{hint}</span></div>
      <div className="snd-grid" role="radiogroup" aria-labelledby={`snd-${kind}`}>
        {sounds.map((s) => (
          <button key={s.id} type="button" role="radio" aria-checked={pick === s.id} disabled={disabled} className="snd-option" onClick={() => select(s.id)}>
            <span className="snd-play" aria-hidden>{pick === s.id ? <Check /> : <Play />}</span>{s.label}
          </button>
        ))}
        {hasCustom && (
          <button type="button" role="radio" aria-checked={pick === CUSTOM} disabled={disabled} className="snd-option" onClick={() => select(CUSTOM)}>
            <span className="snd-play" aria-hidden>{pick === CUSTOM ? <Check /> : <Play />}</span>Your sound
          </button>
        )}
        <button type="button" className="snd-option is-upload" disabled={disabled} onClick={() => file.current?.click()}>
          <span className="snd-play" aria-hidden><Upload /></span>{hasCustom ? "Replace" : "Upload"}
        </button>
        <input ref={file} type="file" accept="audio/*" hidden aria-label={`Your own ${title.toLowerCase()} sound`}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }} />
      </div>
    </section>
  );
}
