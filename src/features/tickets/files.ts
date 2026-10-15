"use client";

// Ticket images: shrunk in the browser before upload (bigger than 1920 px → scaled down, re-encoded as WebP), stored on
// the server (POST /api/files) and shown from it (GET /api/files/<id>), which checks you may see that ticket.

const MAX_SIDE = 1920; // px; bigger images are scaled down
const MAX_GIF_BYTES = 5 * 1024 * 1024; // GIFs are kept as-is so they still animate
export const IMAGE_TYPES = /^image\/(png|jpe?g|webp|gif)$/;

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

/** Where an image is served from. */
export const fileUrl = (id: string, download = false) => `/api/files/${encodeURIComponent(id)}${download ? "?download=1" : ""}`;
