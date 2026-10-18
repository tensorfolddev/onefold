// The docs API from the browser: bodies, autosave (with its 409 "someone saved since"), presence and search.
import { api, ApiError } from "@/data/api";
import type { DocHit, OpenDoc, Presence } from "@/server/docs";

export type { DocHit, OpenDoc, Presence };
export interface Latest { body: string; rev: number; updatedBy?: string; updatedAt: string }

export const getDoc = (id: string) => api<OpenDoc>(`/api/docs/${encodeURIComponent(id)}`);

/** Saves a body; resolves to the new revision, or `{ conflict }` when someone saved since `baseRev`. */
export async function saveDoc(id: string, body: string, baseRev: number, force = false): Promise<{ rev: number } | { conflict: Latest }> {
  try {
    return await api<{ rev: number }>(`/api/docs/${encodeURIComponent(id)}`, { body, baseRev, force });
  } catch (e) {
    if (e instanceof ApiError && e.status === 409) return { conflict: (e.data as { latest: Latest }).latest };
    throw e;
  }
}

export const pingPresence = (id: string, editing: boolean, open = true) =>
  api<{ presence: Presence[] }>(`/api/docs/${encodeURIComponent(id)}/presence`, { editing, open });

export const searchDocs = (q: string) => api<DocHit[]>(`/api/docs/search?q=${encodeURIComponent(q)}`);

/** Live doc events from the store's event stream (see StoreProvider). */
export interface DocSaved { docId: string; rev: number; personId: string }
export interface PresenceChanged { docId: string; people: Presence[] }
