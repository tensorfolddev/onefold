// Tiny UI sounds made with the Web Audio API — no audio files, no dependency.
// ponytail: one shared AudioContext, created on the first sound (browsers only allow audio after a user gesture).

export type Sound = "pickup" | "move" | "tick" | "drop" | "cancel" | "refuse"; // notifications: shell/noticeSounds.ts

const KEY = "onefold.sound";
let ctx: AudioContext | null = null;

export function isSoundOn() {
  try { return localStorage.getItem(KEY) !== "off"; } catch { return true; }
}
export function setSoundOn(on: boolean) {
  try { localStorage.setItem(KEY, on ? "on" : "off"); } catch { /* private mode: stays on for this visit */ }
}

/** The one shared audio engine (made on first use; browsers only allow audio after a click or key press). */
export function audioContext() {
  ctx ??= new AudioContext();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

/**
 * Starting the audio engine takes ~100 ms — doing that on the first drag made the drag stutter.
 * Instead, warm it up when the browser is idle after the person's first click or key press
 * (browsers only allow audio after a user gesture), so it's ready long before anything is dragged.
 */
function warmUp() {
  if (ctx || !isSoundOn()) return;
  const run = () => { try { noiseBuffer(audioContext()); } catch { /* no audio: sounds just stay off */ } };
  if ("requestIdleCallback" in window) window.requestIdleCallback(run, { timeout: 2000 }); else setTimeout(run, 200);
}
if (typeof window !== "undefined") {
  for (const type of ["pointerdown", "keydown"] as const) {
    window.addEventListener(type, warmUp, { once: true, passive: true, capture: true });
  }
}

let noise: AudioBuffer | null = null;
function noiseBuffer(c: AudioContext) {
  if (!noise) {
    noise = c.createBuffer(1, c.sampleRate * 0.2, c.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noise;
}

/** A filtered noise burst: the "physical" part of a click (paper/plastic tap). */
function tap(c: AudioContext, at: number, { freq, q, ms, volume, type = "bandpass" }: {
  freq: number; q: number; ms: number; volume: number; type?: BiquadFilterType;
}) {
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(c);
  const filter = c.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = freq;
  filter.Q.value = q;
  const gain = c.createGain();
  gain.gain.setValueAtTime(volume, at);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + ms / 1000);
  src.connect(filter).connect(gain).connect(c.destination);
  src.start(at);
  src.stop(at + ms / 1000 + 0.01);
}

/** A short pitched body under the tap, so it feels warm rather than hissy. */
function tone(c: AudioContext, at: number, { from, to, ms, volume, wave = "triangle" }: {
  from: number; to: number; ms: number; volume: number; wave?: OscillatorType;
}) {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = wave;
  osc.frequency.setValueAtTime(from, at);
  osc.frequency.exponentialRampToValueAtTime(to, at + ms / 1000);
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(volume, at + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + ms / 1000);
  osc.connect(gain).connect(c.destination);
  osc.start(at);
  osc.stop(at + ms / 1000 + 0.02);
}

const SOUNDS: Record<Sound, (c: AudioContext, t: number) => void> = {
  // weighty lift: a low knock with a short rising body
  pickup: (c, t) => {
    tap(c, t, { freq: 1400, q: 0.9, ms: 40, volume: 0.3, type: "lowpass" });
    tone(c, t, { from: 180, to: 300, ms: 90, volume: 0.12, wave: "sine" });
    tap(c, t, { freq: 2600, q: 1.4, ms: 14, volume: 0.07 });
  },
  // the gap jumps to another list: a slightly brighter tick
  move: (c, t) => { tap(c, t, { freq: 4200, q: 2.5, ms: 12, volume: 0.07 }); tone(c, t, { from: 1760, to: 1660, ms: 30, volume: 0.022, wave: "sine" }); },
  // passing a ticket (up or down, same sound): a heavy little thump with a click on top
  tick: (c, t) => {
    tone(c, t, { from: 160, to: 90, ms: 70, volume: 0.16, wave: "sine" });
    tap(c, t, { freq: 700, q: 0.8, ms: 45, volume: 0.22, type: "lowpass" });
    tap(c, t, { freq: 2400, q: 2, ms: 10, volume: 0.06 });
  },
  // set down: a deep, solid thud with a bit of sub-bass, like placing something heavy
  drop: (c, t) => {
    tone(c, t, { from: 130, to: 48, ms: 220, volume: 0.26, wave: "sine" });
    tap(c, t, { freq: 480, q: 0.7, ms: 140, volume: 0.42, type: "lowpass" });
    tap(c, t + 0.004, { freq: 1900, q: 1.2, ms: 22, volume: 0.09 });
  },
  // cancelled / nothing changed: muted, short
  cancel: (c, t) => tap(c, t, { freq: 700, q: 0.9, ms: 60, volume: 0.12, type: "lowpass" }),
  // not allowed: two quick low buzzes ("uh-uh")
  refuse: (c, t) => {
    tone(c, t, { from: 150, to: 130, ms: 70, volume: 0.07, wave: "square" });
    tone(c, t + 0.1, { from: 150, to: 120, ms: 90, volume: 0.07, wave: "square" });
  },
};

const MIN_TICK_GAP_MS = 40; // fast drags tick, they don't rattle
let lastTick = 0;

export function playSound(sound: Sound) {
  if (typeof window === "undefined" || !isSoundOn()) return;
  if (sound === "tick" || sound === "move") {
    const now = performance.now();
    if (sound !== "move" && now - lastTick < MIN_TICK_GAP_MS) return; // entering a list always sounds
    lastTick = now;
  }
  try {
    const c = audioContext();
    SOUNDS[sound](c, c.currentTime);
  } catch {
    // audio unavailable: silently skip, sound is decoration only
  }
}
