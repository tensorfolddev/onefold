// The sound a new notification makes — an urgent (@@) one, and a new chat message in the Client tab (a tone only, never
// a notification) — each picked by the person (admin or developer alike):
// one of these, made live with the Web Audio API (no files), or their own sound file. Kept in this browser, beside the
// Sounds on/off switch; the volume is theirs too.
import { audioContext, isSoundOn } from "@/features/tickets/sounds";

export type NoticeKind = "notify" | "urgent" | "chat";
export const CUSTOM = "custom";
export const MAX_CUSTOM_BYTES = 1024 * 1024;

type Play = (c: AudioContext, at: number, out: AudioNode) => void;
export interface NoticeSound { id: string; label: string; play: Play }

/** One note: a quick attack, then a natural decay; `partials` add overtones (a bell, wood). */
function note(c: AudioContext, at: number, out: AudioNode, freq: number, { ms = 500, volume = 0.2, wave = "sine", partials = [] as [number, number][] } = {}) {
  for (const [ratio, level] of [[1, 1] as [number, number], ...partials]) {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = wave as OscillatorType;
    osc.frequency.setValueAtTime(freq * ratio, at);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(volume * level, at + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + (ms / 1000) * (ratio > 1 ? 0.6 : 1));
    osc.connect(gain).connect(out);
    osc.start(at);
    osc.stop(at + ms / 1000 + 0.05);
  }
}
/** A pitch sweep (a pop, a siren). */
function sweep(c: AudioContext, at: number, out: AudioNode, from: number, to: number, ms: number, volume: number, wave: OscillatorType = "sine") {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = wave;
  osc.frequency.setValueAtTime(from, at);
  osc.frequency.exponentialRampToValueAtTime(to, at + ms / 1000);
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(volume, at + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + ms / 1000);
  osc.connect(gain).connect(out);
  osc.start(at);
  osc.stop(at + ms / 1000 + 0.05);
}
const BELL: [number, number][] = [[2, 0.45], [2.76, 0.3], [5.4, 0.12]];

export const NOTIFY_SOUNDS: NoticeSound[] = [
  { id: "bloom", label: "Bloom", play: (c, t, o) => { [1047, 1319, 1568].forEach((f, i) => note(c, t + i * 0.07, o, f, { ms: 700, volume: 0.12 })); } },
  { id: "bell", label: "Bell", play: (c, t, o) => note(c, t, o, 880, { ms: 1300, volume: 0.16, partials: BELL }) },
  { id: "ding", label: "Ding", play: (c, t, o) => note(c, t, o, 1568, { ms: 800, volume: 0.15, partials: [[2, 0.25]] }) },
  { id: "pop", label: "Pop", play: (c, t, o) => { sweep(c, t, o, 380, 920, 70, 0.22); sweep(c, t + 0.09, o, 520, 1200, 60, 0.12); } },
  { id: "marimba", label: "Marimba", play: (c, t, o) => { note(c, t, o, 784, { ms: 260, volume: 0.22, partials: [[4, 0.18]] }); note(c, t + 0.11, o, 1047, { ms: 380, volume: 0.22, partials: [[4, 0.18]] }); } },
  { id: "knock", label: "Soft knock", play: (c, t, o) => { sweep(c, t, o, 220, 110, 90, 0.3); sweep(c, t + 0.16, o, 220, 110, 90, 0.26); } },
  { id: "chime", label: "Chime", play: (c, t, o) => { note(c, t, o, 784, { ms: 300, volume: 0.12 }); note(c, t + 0.13, o, 1175, { ms: 450, volume: 0.11 }); } },
];

export const URGENT_SOUNDS: NoticeSound[] = [
  { id: "alert", label: "Alert", play: (c, t, o) => { for (const k of [0, 0.62]) [988, 1319, 1760].forEach((f, i) => note(c, t + k + i * 0.15, o, f, { ms: 260, volume: 0.15, wave: "triangle" })); } },
  { id: "siren", label: "Siren", play: (c, t, o) => { for (const k of [0, 0.7]) { sweep(c, t + k, o, 700, 1400, 340, 0.14, "triangle"); sweep(c, t + k + 0.34, o, 1400, 700, 340, 0.14, "triangle"); } } },
  { id: "alarm", label: "Alarm", play: (c, t, o) => { for (let i = 0; i < 4; i += 1) note(c, t + i * 0.18, o, 1046, { ms: 130, volume: 0.13, wave: "square" }); } },
  { id: "bells", label: "Triple bell", play: (c, t, o) => { for (let i = 0; i < 3; i += 1) note(c, t + i * 0.32, o, 988, { ms: 900, volume: 0.15, partials: BELL }); } },
  { id: "rising", label: "Rising", play: (c, t, o) => { for (const k of [0, 0.55]) [784, 988, 1175, 1568, 1976].forEach((f, i) => note(c, t + k + i * 0.07, o, f, { ms: 200, volume: 0.12, wave: "triangle" })); } },
];

/** A new chat line from someone else: short and soft, like a messenger's — it comes often. */
export const CHAT_SOUNDS: NoticeSound[] = [
  { id: "bubble", label: "Bubble", play: (c, t, o) => { sweep(c, t, o, 600, 1100, 55, 0.18); note(c, t + 0.075, o, 1318, { ms: 160, volume: 0.09 }); } },
  { id: "tick", label: "Tick-tick", play: (c, t, o) => { note(c, t, o, 1760, { ms: 90, volume: 0.1, wave: "triangle" }); note(c, t + 0.1, o, 2093, { ms: 120, volume: 0.09, wave: "triangle" }); } },
  { id: "drop", label: "Drop", play: (c, t, o) => sweep(c, t, o, 1400, 520, 120, 0.16) },
  { id: "soft", label: "Soft bell", play: (c, t, o) => note(c, t, o, 1175, { ms: 450, volume: 0.09, partials: BELL }) },
  { id: "off", label: "Silent", play: () => {} },
];

const LIST: Record<NoticeKind, NoticeSound[]> = { notify: NOTIFY_SOUNDS, urgent: URGENT_SOUNDS, chat: CHAT_SOUNDS };
const KEY = (k: NoticeKind) => `onefold.sound.${k}`;
const CUSTOM_KEY = (k: NoticeKind) => `onefold.sound.custom.${k}`;
const VOLUME_KEY = "onefold.sound.volume";
const DEFAULT_VOLUME = 0.7;

const read = (key: string) => { try { return localStorage.getItem(key); } catch { return null; } };
const write = (key: string, value: string | null) => {
  try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); } catch { /* private mode: for this visit only */ }
};

/** The sound picked for this kind (the first one unless another was). */
export function chosen(kind: NoticeKind): string {
  const id = read(KEY(kind));
  return id === CUSTOM ? (read(CUSTOM_KEY(kind)) ? CUSTOM : LIST[kind][0].id) : LIST[kind].some((s) => s.id === id) ? id! : LIST[kind][0].id;
}
export const choose = (kind: NoticeKind, id: string) => write(KEY(kind), id);
export const customSound = (kind: NoticeKind) => read(CUSTOM_KEY(kind));
/** Keeps their own sound file (a data: URL) for this kind, and picks it. False if this browser couldn't keep it. */
export function setCustomSound(kind: NoticeKind, dataUrl: string): boolean {
  write(CUSTOM_KEY(kind), dataUrl);
  if (read(CUSTOM_KEY(kind)) !== dataUrl) return false;
  choose(kind, CUSTOM);
  return true;
}
export function volume(): number {
  const v = Number(read(VOLUME_KEY));
  return read(VOLUME_KEY) !== null && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : DEFAULT_VOLUME;
}
export const setVolume = (v: number) => write(VOLUME_KEY, String(Math.min(1, Math.max(0, v))));

/** Plays a sound now, at their volume — `id` to try one out, else the one they picked. */
export function previewNotice(kind: NoticeKind, id = chosen(kind)) {
  const level = volume();
  if (!level) return;
  try {
    if (id === CUSTOM) {
      const src = customSound(kind);
      if (!src) return;
      const a = new Audio(src);
      a.volume = level;
      void a.play().catch(() => {});
      return;
    }
    const c = audioContext();
    const out = c.createGain();
    out.gain.value = level * 1.4; // the presets are made quiet; this is "loud enough" at 70 %
    out.connect(c.destination);
    (LIST[kind].find((s) => s.id === id) ?? LIST[kind][0]).play(c, c.currentTime, out);
  } catch {
    // no audio here: the toast and the badge still say it
  }
}

/** A new notification's sound (if sounds are on). */
export function playNotice(kind: NoticeKind) {
  if (typeof window !== "undefined" && isSoundOn()) previewNotice(kind);
}
