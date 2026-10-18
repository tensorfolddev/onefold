// When to save while someone types: 800 ms after the last keystroke, but unsaved text never waits more than 5 s.
export const IDLE_MS = 800;
export const MAX_WAIT_MS = 5000;

/** Milliseconds until the next save, given the last change, the first change not yet saved, and now. */
export function nextSaveDelay(lastChange: number, firstUnsaved: number, now: number): number {
  return Math.max(0, Math.min(lastChange + IDLE_MS, firstUnsaved + MAX_WAIT_MS) - now);
}
