"use client";

// Ticket images. The bytes live in IndexedDB (localStorage is ~5 MB and our saves fail silently when it's full),
// ticket.attachments keeps only metadata. ponytail: per-browser until a backend exists — then this becomes uploads
// to object storage and the MCP server hands out URLs; removed images stay here so Undo can bring them back.
import { useEffect, useState } from "react";

const DB_NAME = "onefold-files";
const STORE = "files";
const MAX_SIDE = 1920; // px; bigger images are scaled down
const MAX_GIF_BYTES = 5 * 1024 * 1024; // GIFs are kept as-is so they still animate
export const IMAGE_TYPES = /^image\/(png|jpe?g|webp|gif)$/;

let opening: Promise<IDBDatabase> | null = null;
function idb() {
  opening ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => { opening = null; reject(req.error); };
  });
  return opening;
}

function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>) {
  return idb().then((db) => new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = tx.onabort = () => reject(tx.error ?? new Error("File store failed"));
  }));
}

export const putFile = (id: string, blob: Blob) => run("readwrite", (s) => s.put(blob, id)).then(() => undefined);
export const getFile = (id: string) => run<Blob | undefined>("readonly", (s) => s.get(id));

/** Scale down to MAX_SIDE and re-encode as WebP; keeps the original when that isn't smaller. */
export async function prepareImage(file: File): Promise<{ blob: Blob; width: number; height: number }> {
  if (!IMAGE_TYPES.test(file.type)) throw new Error("Only PNG, JPG, WebP or GIF images");
  const bitmap = await createImageBitmap(file);
  const { width, height } = bitmap;
  if (file.type === "image/gif") {
    bitmap.close();
    if (file.size > MAX_GIF_BYTES) throw new Error("GIFs can be at most 5 MB");
    return { blob: file, width, height };
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
  const w = Math.round(width * scale), h = Math.round(height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const webp = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/webp", 0.85));
  if (!webp || (scale === 1 && webp.size >= file.size)) return { blob: file, width, height };
  return { blob: webp, width: w, height: h };
}

/** Object URL for a stored image: undefined while loading, null when it isn't in this browser. */
export function useFileUrl(id: string) {
  const [state, setState] = useState<{ id: string; url: string | null } | null>(null);
  useEffect(() => {
    let live = true;
    let url: string | null = null;
    getFile(id)
      .then((blob) => { if (!live) return; url = blob ? URL.createObjectURL(blob) : null; setState({ id, url }); })
      .catch(() => { if (live) setState({ id, url: null }); });
    return () => { live = false; if (url) URL.revokeObjectURL(url); };
  }, [id]);
  return state?.id === id ? state.url : undefined;
}
