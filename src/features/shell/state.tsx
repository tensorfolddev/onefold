"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createTicket, updateTicket as updateTicketAction, type TicketPatch } from "@/data/commands";
import { useDb } from "@/data/StoreProvider";
import type { Activity, Ticket } from "@/domain/types";
import { applyTheme, savedTheme, type Theme } from "./themes";

export type { Theme } from "./themes";

interface AppState {
  theme: Theme;
  setTheme: (t: Theme) => void;
  tickets: Ticket[];
  updateTicket: (key: string, patch: TicketPatch) => void;
  /** Creates a ticket in the product's first status; returns its key, or undefined when refused. */
  addTicket: (productKey: string, title: string) => string | undefined;
  activity: Activity[];
  openTicketKey: string | null;
  /** Section to scroll to in the open ticket (from a section link like /t/AP-12#test_plan). */
  openSection: string | null;
  openTicket: (key: string | null, section?: string) => void;
  notificationsOpen: boolean;
  setNotificationsOpen: (open: boolean) => void;
}

const Ctx = createContext<AppState | null>(null);

/** UI state (theme, open panels). Data lives in the store; ticket helpers here forward to it. */
export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const { db, me, act } = useDb();
  const [theme, setThemeState] = useState<Theme>(savedTheme); // the layout's script already painted it (FO-15)
  const meId = me.id;
  const [opened, setOpened] = useState<{ key: string; section: string | null } | null>(null);
  const openTicket = useCallback((key: string | null, section?: string) => setOpened(key ? { key, section: section ?? null } : null), []);
  const openTicketKey = opened?.key ?? null;
  const openSection = opened?.section ?? null;
  const prevMeId = useRef(meId);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  useEffect(() => {
    // Close the panel when the person changes — not on the first load, where a ticket link may have just opened one.
    if (prevMeId.current !== meId) setOpened(null);
    prevMeId.current = meId;
  }, [meId]);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    applyTheme(t);
  }, []);


  const updateTicket = useCallback(
    (key: string, patch: TicketPatch) => { act((d, m) => updateTicketAction(d, m, key, patch)); },
    [act],
  );

  const addTicket = useCallback(
    (productKey: string, title: string) => {
      const key = act((d, m) => createTicket(d, m, productKey, title));
      return typeof key === "string" ? key : undefined;
    },
    [act],
  );

  const value = useMemo<AppState>(
    () => ({
      theme, setTheme, tickets: db.tickets, updateTicket, addTicket, activity: db.activity,
      openTicketKey, openSection, openTicket, notificationsOpen, setNotificationsOpen,
    }),
    [theme, setTheme, db, updateTicket, addTicket, openTicketKey, openSection, openTicket, notificationsOpen],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppState() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAppState must be used inside <AppStateProvider>");
  return ctx;
}
