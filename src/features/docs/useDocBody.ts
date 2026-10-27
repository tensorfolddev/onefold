"use client";

// One open doc's body: loads it, autosaves what's typed (see autosave.ts), and never overwrites someone else's newer
// save — that becomes a `conflict` to resolve. Other people's saves load quietly when nothing is unsaved here, or show
// as `staleBy` when something is. Tells the server who has the doc open and who's typing.
import { useCallback, useEffect, useRef, useState } from "react";
import { message } from "@/data/api";
import { getDoc, pingPresence, saveDoc, type DocLink, type DocSaved, type Latest, type OpenDoc, type Presence, type PresenceChanged } from "./api";
import { nextSaveDelay } from "./autosave";

const PRESENCE_EVERY_MS = 15_000;
const TYPING_RECENT_MS = 20_000; // "is editing" for this long after the last keystroke
const RETRY_MS = 5000;

export interface DocBody {
  status: "loading" | "ready" | "error";
  error: string;
  body: string;
  /** Changes when the editor must take a new body from outside (someone else's save, "use theirs"). */
  reloadKey: number;
  saving: boolean;
  unsaved: boolean;
  savedAt: number | null;
  conflict: Latest | null;
  presence: Presence[];
  /** Docs that link to this one (that you can see). */
  backlinks: DocLink[];
  /** Someone saved while there were unsaved changes here: their id, until reloaded. */
  staleBy: string | null;
  setDraft: (markdown: string) => void;
  resolveConflict: (keep: "theirs" | "mine") => Promise<void>;
  reload: () => Promise<void>;
}

/**
 * This tab's last copy of each doc it opened (or a link to it was pointed at): shown at once, no loading, while the
 * latest is fetched. Saving still sends the revision it started from, so a stale copy can't overwrite a newer save.
 */
const copies = new Map<string, OpenDoc>();
const fetching = new Set<string>();
export function prefetchDoc(id: string) {
  if (copies.has(id) || fetching.has(id)) return;
  fetching.add(id);
  getDoc(id).then((d) => { copies.set(id, d); }, () => { /* opening it fetches again and shows the error */ }).finally(() => fetching.delete(id));
}
const keepCopy = (id: string, body: string, rev: number) => { const kept = copies.get(id); if (kept) copies.set(id, { ...kept, body, rev }); };

export function useDocBody(id: string, meId: string, editable: boolean): DocBody {
  const [copy] = useState(() => copies.get(id));
  const [status, setStatus] = useState<DocBody["status"]>(copy ? "ready" : "loading");
  const [error, setError] = useState("");
  const [body, setBody] = useState(copy?.body ?? "");
  const [reloadKey, setReloadKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [unsaved, setUnsaved] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [conflict, setConflict] = useState<Latest | null>(null);
  const [presence, setPresence] = useState<Presence[]>(copy?.presence ?? []);
  const [backlinks, setBacklinks] = useState<DocLink[]>(copy?.backlinks ?? []);
  const [staleBy, setStaleBy] = useState<string | null>(null);

  const rev = useRef(copy?.rev ?? 0);
  const draft = useRef<string | null>(null);
  const firstUnsaved = useRef(0);
  const lastChange = useRef(0);
  const inFlight = useRef(false);
  const blocked = useRef(false); // a conflict is open: don't save until it's resolved
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    const open = await getDoc(id);
    copies.set(id, open);
    rev.current = open.rev;
    draft.current = null;
    setBody(open.body);
    setPresence(open.presence);
    setBacklinks(open.backlinks);
    setUnsaved(false);
    setStaleBy(null);
    setReloadKey((k) => k + 1);
    setStatus("ready");
  }, [id]);

  // Mounted once per doc (keyed by id): "loading" — or, with a copy from before, that copy until the latest answers.
  useEffect(() => {
    if (!copy) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- loads from the server; state is set when it answers
      load().catch((e: unknown) => { setError(message(e)); setStatus("error"); });
      return;
    }
    getDoc(id).then((open) => {
      copies.set(id, open);
      setPresence(open.presence);
      setBacklinks(open.backlinks);
      if (open.rev === rev.current || draft.current !== null || inFlight.current) return; // same text — or typing: saving finds out
      rev.current = open.rev;
      setBody(open.body);
      setReloadKey((k) => k + 1);
    }, () => { /* the copy stays; the next save still checks its revision */ });
  }, [copy, id, load]);

  const saveSoon = useRef<(delay: number) => void>(() => {});

  const flush = useCallback(async (keepalive = false): Promise<void> => {
    if (inFlight.current || blocked.current || draft.current === null) return;
    const text = draft.current;
    draft.current = null;
    inFlight.current = true;
    setSaving(true);
    try {
      if (keepalive) { // leaving the page: best effort, the browser finishes it after we're gone
        copies.delete(id); // no answer to keep: next time, fetch it fresh
        void fetch(`/api/docs/${encodeURIComponent(id)}`, {
          method: "POST", keepalive: true, credentials: "same-origin", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: text, baseRev: rev.current }),
        });
        return;
      }
      const r = await saveDoc(id, text, rev.current);
      if ("conflict" in r) {
        draft.current ??= text;
        blocked.current = true;
        setConflict(r.conflict);
        return;
      }
      rev.current = r.rev;
      keepCopy(id, text, r.rev);
      setSavedAt(Date.now());
      setError("");
    } catch (e) {
      draft.current ??= text; // keep it; try again shortly
      setError(message(e));
      saveSoon.current(RETRY_MS);
    } finally {
      inFlight.current = false;
      setSaving(false);
      setUnsaved(draft.current !== null);
      if (draft.current !== null && !blocked.current && !timer.current) saveSoon.current(nextSaveDelay(lastChange.current, firstUnsaved.current, Date.now()));
    }
  }, [id]);
  useEffect(() => {
    saveSoon.current = (delay) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => { timer.current = null; void flush(); }, delay);
    };
  }, [flush]);

  const setDraft = useCallback((markdown: string) => {
    if (!editable) return;
    const now = Date.now();
    if (draft.current === null) firstUnsaved.current = now;
    draft.current = markdown;
    lastChange.current = now;
    setUnsaved(true);
    if (!blocked.current) saveSoon.current(nextSaveDelay(now, firstUnsaved.current, now));
  }, [editable]);

  const resolveConflict = useCallback(async (keep: "theirs" | "mine") => {
    const latest = conflict;
    if (!latest) return;
    if (keep === "theirs") {
      if (draft.current) await navigator.clipboard?.writeText(draft.current).catch(() => {});
      draft.current = null;
      rev.current = latest.rev;
      keepCopy(id, latest.body, latest.rev);
      setBody(latest.body);
      setReloadKey((k) => k + 1);
    } else {
      const mine = draft.current ?? "";
      const r = await saveDoc(id, mine, rev.current, true);
      if ("rev" in r) { keepCopy(id, mine, r.rev); rev.current = r.rev; draft.current = null; setSavedAt(Date.now()); }
    }
    blocked.current = false;
    setConflict(null);
    setUnsaved(draft.current !== null);
    setStaleBy(null);
  }, [conflict, id]);

  // Other people's saves and who's here.
  useEffect(() => {
    const onSaved = (e: Event) => {
      const d = (e as CustomEvent<DocSaved>).detail;
      if (d.docId !== id || d.rev <= rev.current) return;
      if (draft.current === null && !inFlight.current) load().catch(() => {});
      else if (d.personId !== meId) setStaleBy(d.personId);
    };
    const onPresence = (e: Event) => {
      const d = (e as CustomEvent<PresenceChanged>).detail;
      if (d.docId === id) setPresence(d.people);
    };
    window.addEventListener("onefold:doc", onSaved);
    window.addEventListener("onefold:presence", onPresence);
    return () => { window.removeEventListener("onefold:doc", onSaved); window.removeEventListener("onefold:presence", onPresence); };
  }, [id, meId, load]);

  // Presence: now, every 15 s, and "left" when the doc closes.
  useEffect(() => {
    const ping = () => pingPresence(id, editable && Date.now() - lastChange.current < TYPING_RECENT_MS).then((r) => setPresence(r.presence)).catch(() => {});
    void ping();
    const every = setInterval(ping, PRESENCE_EVERY_MS);
    return () => { clearInterval(every); void pingPresence(id, false, false).catch(() => {}); };
  }, [id, editable]);

  // Tell others "typing" right away on the first keystroke after a pause, not 15 s later.
  const typingSent = useRef(0);
  useEffect(() => {
    if (!unsaved || !editable || Date.now() - typingSent.current < PRESENCE_EVERY_MS) return;
    typingSent.current = Date.now();
    void pingPresence(id, true).then((r) => setPresence(r.presence)).catch(() => {});
  }, [unsaved, editable, id]);

  // Leaving: save what's unsaved.
  useEffect(() => {
    const onHide = () => void flush(true);
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      if (timer.current) clearTimeout(timer.current);
      void flush();
    };
  }, [flush]);

  /** Takes the latest saved version; anything unsaved here is put on the clipboard first, so nothing is lost. */
  const reload = useCallback(async () => {
    if (draft.current) await navigator.clipboard?.writeText(draft.current).catch(() => {});
    await load();
  }, [load]);

  return { status, error, body, reloadKey, saving, unsaved, savedAt, conflict, presence, backlinks, staleBy, setDraft, resolveConflict, reload };
}
