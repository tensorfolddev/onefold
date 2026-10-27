"use client";

// A client's data: their view from the server (GET /api/client/view), fetched again whenever the company changes (a
// live event) or they come back to the tab. Actions go to the server and the view is fetched again — no local copy of
// anything to keep in step.
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError, message, upload } from "@/data/api";
import type { ClientView } from "@/domain/clientView";
import type { ClientActionName } from "@/domain/commands/clientActions";

/** Runs one client action; resolves to an error message, or null when it worked. */
export type ClientAct = (name: ClientActionName, ...args: unknown[]) => Promise<string | null>;

export function useClientView() {
  const router = useRouter();
  const [view, setView] = useState<ClientView | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setView(await api<ClientView>("/api/client/view"));
      setError(null);
    } catch (e) {
      // Signed out, switched off, or Client Space closed: end the session (its cookie would keep sending them back here).
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
        await api("/api/client/signout", {}).catch(() => {});
        router.replace("/c/signin");
      } else setError(message(e));
    }
  }, [router]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the first load; state is set when the server answers
    void load();
    const events = new EventSource("/api/client/events");
    events.addEventListener("version", () => void load());
    const onVisible = () => { if (document.visibilityState === "visible") void load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { events.close(); document.removeEventListener("visibilitychange", onVisible); };
  }, [load]);

  const act: ClientAct = useCallback(async (name, ...args) => {
    try {
      await api("/api/client/act", { name, args });
      await load();
      return null;
    } catch (e) {
      return message(e);
    }
  }, [load]);

  const signOut = useCallback(async () => {
    await api("/api/client/signout", {}).catch(() => {});
    router.replace("/c/signin");
  }, [router]);

  /** A file into a chat they can see; resolves to an error message, or null. */
  const sendFile = useCallback(async (subject: string, file: File) => {
    try {
      await upload(`/api/client/file?subject=${encodeURIComponent(subject)}&name=${encodeURIComponent(file.name)}`, file);
      await load();
      return null;
    } catch (e) {
      return message(e);
    }
  }, [load]);

  return { view, error, act, sendFile, signOut };
}

export const newId = () => crypto.randomUUID();
