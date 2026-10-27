"use client";

// Docs open without a loading screen: the editor's code is fetched while the app is idle, and a doc's text as soon as
// a link to it is pointed at (or focused) — any link, anywhere: lists, search, a ticket's linked docs.
import { useEffect } from "react";
import { prefetchDoc } from "./useDocBody";

const DOC_LINK = /\/docs\/(?:mine\/)?(?!mine$)([A-Za-z0-9_-]{6,})$/; // …/docs/<id>, …/docs/mine/<id>, a project's docs/<id>

export function useDocPrefetch() {
  useEffect(() => {
    const idle = window.requestIdleCallback ?? ((run: () => void) => window.setTimeout(run, 1500));
    idle(() => { void import("./editor/DocEditor"); });
    const near = (e: Event) => {
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      const id = a && new URL(a.href, location.href).pathname.match(DOC_LINK)?.[1];
      if (id) prefetchDoc(id);
    };
    document.addEventListener("pointerover", near, { passive: true });
    document.addEventListener("focusin", near);
    return () => { document.removeEventListener("pointerover", near); document.removeEventListener("focusin", near); };
  }, []);
}
