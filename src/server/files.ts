// Ticket images on disk: FILES_DIR/<org>/<id> (a Docker volume in production, backed up with the database). The bytes
// decide what a file is — never its name or the browser's word — and only PNG, JPEG, WebP and GIF are kept. Reading
// one checks the viewer may see a ticket it's on. Files nothing refers to any more are cleaned up later, not on
// removal, so Undo can bring an image back.
// ponytail: local disk, one server. With several servers or lots of files, swap this for S3-compatible storage here.
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { and, eq, sql } from "drizzle-orm";
import { AccessError, addAttachment, ValidationError } from "../domain/commands/index.ts";
import { can } from "../domain/permissions.ts";
import { snapshotFor } from "../domain/snapshot.ts";
import { personFor, type SessionRow } from "./accounts.ts";
import type { Loaded } from "./company/store.ts";
import { newId } from "./auth/secrets.ts";
import { mustLoad } from "./changes.ts";
import { saveCompany } from "./company/store.ts";
import { inScope } from "./db/client.ts";
import * as s from "./db/schema.ts";
import { journal } from "./journal.ts";

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_DOC_FILE_BYTES = 25 * 1024 * 1024; // any file in a doc; images show inline, the rest download
const MAX_SIDE = 20_000; // px — anything bigger is a broken (or hostile) header
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/; // org and file ids (base64url): never "..", never a slash
const CLEANUP_GRACE_MS = 60 * 60_000; // an upload is on disk a moment before its ticket mentions it

export const filesDir = () => resolve(/*turbopackIgnore: true*/ process.env.FILES_DIR ?? join(process.cwd(), "data", "files"));
const fileAt = (orgId: string, id: string) => {
  if (!ID_RE.test(orgId) || !ID_RE.test(id)) throw new Error("Bad file id");
  return join(/*turbopackIgnore: true*/ filesDir(), orgId, id);
};

export interface ImageInfo { type: string; width: number; height: number }

/** What an image really is, from its first bytes; null for anything that isn't a PNG, JPEG, WebP or GIF. */
export function inspectImage(b: Buffer): ImageInfo | null {
  const size = (type: string, width: number, height: number) =>
    width > 0 && height > 0 && width <= MAX_SIDE && height <= MAX_SIDE ? { type, width, height } : null;
  if (b.length >= 24 && b.readUInt32BE(0) === 0x89504e47 && b.readUInt32BE(4) === 0x0d0a1a0a && b.toString("ascii", 12, 16) === "IHDR") {
    return size("image/png", b.readUInt32BE(16), b.readUInt32BE(20));
  }
  if (b.length >= 10 && (b.toString("ascii", 0, 6) === "GIF87a" || b.toString("ascii", 0, 6) === "GIF89a")) {
    return size("image/gif", b.readUInt16LE(6), b.readUInt16LE(8));
  }
  if (b.length >= 30 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP") {
    const chunk = b.toString("ascii", 12, 16);
    if (chunk === "VP8 ") return size("image/webp", b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff);
    if (chunk === "VP8L") { const bits = b.readUInt32LE(21); return size("image/webp", (bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1); }
    if (chunk === "VP8X") return size("image/webp", b.readUIntLE(24, 3) + 1, b.readUIntLE(27, 3) + 1);
    return null;
  }
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    // Walk the JPEG segments to the frame header (SOF0–SOF15, except DHT/JPG/DAC), which holds the size.
    for (let i = 2; i + 9 < b.length;) {
      if (b[i] !== 0xff) return null;
      const marker = b[i + 1];
      if (marker === 0xff) { i += 1; continue; }
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return size("image/jpeg", b.readUInt16BE(i + 7), b.readUInt16BE(i + 5));
      }
      i += 2 + b.readUInt16BE(i + 2);
    }
  }
  return null;
}

/** A request body of at most `max` bytes — stops reading (and refuses) as soon as it's over. */
export async function readUpTo(req: Request, max: number, what = "Images"): Promise<Buffer> {
  const tooBig = () => new ValidationError(`${what} can be at most ${Math.round(max / 1024 / 1024)} MB`);
  if (Number(req.headers.get("content-length") ?? 0) > max) throw tooBig();
  const reader = req.body?.getReader();
  if (!reader) throw new ValidationError("No image was sent");
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > max) { await reader.cancel(); throw tooBig(); }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

const cleanName = (name: string) => name.replace(/[\u0000-\u001f\u007f/\\]/g, "").trim().slice(0, 200) || "file";
const PLACEHOLDER = { id: "check", name: "check", type: "image/png", size: 1, width: 1, height: 1 };

/** Refuses an upload before any bytes are read: unknown ticket, no right to edit it, or no room for another image. */
export async function checkUpload(who: SessionRow, ticketKey: string): Promise<void> {
  await inScope({ orgId: who.orgId, userId: who.userId }, async (tx) => {
    const loaded = await mustLoad(tx, who);
    addAttachment(loaded.db, personFor(loaded, who.userId), ticketKey, PLACEHOLDER); // throws the same refusal the real one would
  });
}

/**
 * Adds an image to a ticket: checks the bytes, writes the file, then records it on the ticket as the signed-in
 * person (same permission rule as any edit). If recording fails, the file is removed again.
 */
export async function uploadImage(who: SessionRow, input: { ticketKey: string; name: string }, bytes: Buffer): Promise<{ version: number; id: string }> {
  const image = inspectImage(bytes);
  if (!image) throw new ValidationError("Only PNG, JPG, WebP or GIF images");
  const id = newId("img");
  const path = fileAt(who.orgId, id);
  await mkdir(/*turbopackIgnore: true*/ dirname(path), { recursive: true, mode: 0o750 });
  await writeFile(/*turbopackIgnore: true*/ path, bytes, { mode: 0o640, flag: "wx" });
  try {
    return await inScope({ orgId: who.orgId, userId: who.userId, lock: true }, async (tx) => {
      const loaded = await mustLoad(tx, who);
      const me = personFor(loaded, who.userId);
      const name = cleanName(input.name);
      const next = addAttachment(loaded.db, me, input.ticketKey, { id, name, type: image.type, size: bytes.length, width: image.width, height: image.height });
      const version = await saveCompany(tx, loaded, next);
      await journal(tx, { orgId: who.orgId, userId: who.userId, actorId: me.id, source: "web" },
        [{ command: "addAttachment", args: { ticketKey: input.ticketKey, id, name, type: image.type, size: bytes.length } }], version);
      return { version, id };
    });
  } catch (e) {
    await rm(/*turbopackIgnore: true*/ path, { force: true });
    throw e;
  }
}

// ---------- files in docs: any kind, up to 25 MB ----------

/** The doc, if this person may add files to it: they can see it, may edit it, and it isn't archived. */
function editableDoc(loaded: Loaded, who: SessionRow, docId: string) {
  const me = personFor(loaded, who.userId);
  const doc = snapshotFor(loaded.db, me).docs.find((d) => d.id === docId);
  if (!doc) throw new ValidationError("Document not found");
  if (doc.archivedAt) throw new ValidationError(`${doc.title} is archived — restore it first`);
  const product = doc.productKey ? loaded.db.products.find((p) => p.key === doc.productKey) : undefined;
  if (!can(me, "doc.edit", { product })) throw new AccessError();
  return { me, doc };
}

/** A decision you may edit: it's in your view, and you may record decisions on its project. */
function editableDecision(loaded: Loaded, who: SessionRow, decisionId: string) {
  const me = personFor(loaded, who.userId);
  const decision = snapshotFor(loaded.db, me).decisions.find((d) => d.id === decisionId);
  if (!decision) throw new ValidationError("Decision not found");
  if (!can(me, "decision.add", { product: loaded.db.products.find((p) => p.key === decision.productKey) })) throw new AccessError();
  return { me };
}

/** Where an uploaded file goes: into a doc, or into a decision's text. */
export interface FileOwner { docId?: string; decisionId?: string }
const editableOwner = (loaded: Loaded, who: SessionRow, o: FileOwner) =>
  (o.docId ? editableDoc(loaded, who, o.docId) : editableDecision(loaded, who, o.decisionId ?? ""));

/** Refuses an upload to a doc (or a decision) before any bytes are read. */
export async function checkDocUpload(who: SessionRow, owner: string | FileOwner): Promise<void> {
  const o = typeof owner === "string" ? { docId: owner } : owner;
  await inScope({ orgId: who.orgId, userId: who.userId }, async (tx) => { editableOwner(await mustLoad(tx, who), who, o); });
}

/** What a doc file is, from its bytes: an image (by its header), a PDF, or anything else (always downloaded). */
export function fileType(b: Buffer): string {
  const image = inspectImage(b);
  if (image) return image.type;
  if (b.subarray(0, 5).toString("ascii") === "%PDF-") return "application/pdf";
  return "application/octet-stream";
}

/** Adds any file to a doc: written to disk, then recorded against the doc (removed again if that fails). */
export async function uploadDocFile(who: SessionRow, input: FileOwner & { name: string }, bytes: Buffer): Promise<{ id: string; name: string; type: string; size: number }> {
  if (!bytes.length) throw new ValidationError("That file is empty");
  const type = fileType(bytes);
  const id = newId("file");
  const name = cleanName(input.name);
  const path = fileAt(who.orgId, id);
  await mkdir(/*turbopackIgnore: true*/ dirname(path), { recursive: true, mode: 0o750 });
  await writeFile(/*turbopackIgnore: true*/ path, bytes, { mode: 0o640, flag: "wx" });
  try {
    await inScope({ orgId: who.orgId, userId: who.userId }, async (tx) => {
      const { me } = editableOwner(await mustLoad(tx, who), who, input);
      const row = { orgId: who.orgId, id, name, type, size: bytes.length, uploadedBy: me.id };
      if (input.docId) await tx.insert(s.docFiles).values({ ...row, docId: input.docId });
      else await tx.insert(s.decisionFiles).values({ ...row, decisionId: input.decisionId ?? "" });
    });
  } catch (e) {
    await rm(/*turbopackIgnore: true*/ path, { force: true });
    throw e;
  }
  return { id, name, type, size: bytes.length };
}

/**
 * A ticket image or doc file the signed-in person may see (it's on a ticket or in a doc they can see), or null.
 * `download`: not an image, so it's only ever saved, never shown in the browser.
 */
export async function readImage(who: SessionRow, id: string): Promise<{ bytes: Buffer; type: string; name: string; download?: boolean } | null> {
  if (!ID_RE.test(id)) return null;
  // ponytail: loads the whole company per image; browsers keep each image for an hour, so it stays rare.
  const att = await inScope({ orgId: who.orgId, userId: who.userId }, async (tx) => {
    const loaded = await mustLoad(tx, who);
    const view = snapshotFor(loaded.db, personFor(loaded, who.userId));
    const onTicket = view.tickets.flatMap((t) => t.attachments ?? []).find((a) => a.id === id);
    if (onTicket) return onTicket;
    const [f] = await tx.select().from(s.docFiles).where(and(eq(s.docFiles.orgId, who.orgId), eq(s.docFiles.id, id)));
    if (f) return view.docs.some((d) => d.id === f.docId) ? { id: f.id, name: f.name, type: f.type, download: !f.type.startsWith("image/") } : null;
    const [g] = await tx.select().from(s.decisionFiles).where(and(eq(s.decisionFiles.orgId, who.orgId), eq(s.decisionFiles.id, id)));
    if (!g || !view.decisions.some((d) => d.id === g.decisionId)) return null;
    return { id: g.id, name: g.name, type: g.type, download: !g.type.startsWith("image/") };
  });
  if (!att) return null;
  try {
    return { bytes: await readFile(/*turbopackIgnore: true*/ fileAt(who.orgId, id)), type: att.type, name: att.name, download: "download" in att ? att.download : false };
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
}

const missingOk = (e: NodeJS.ErrnoException) => { if (e.code === "ENOENT") return null; throw e; };

/** Deletes image files nothing refers to — no ticket, nobody's Undo — once they're over an hour old. Returns how many. */
export async function cleanupFiles(now = Date.now()): Promise<number> {
  const root = filesDir();
  const orgs = (await readdir(/*turbopackIgnore: true*/ root).catch(missingOk)) ?? [];
  let removed = 0;
  for (const orgId of orgs.filter((o) => ID_RE.test(o))) {
    const names = ((await readdir(/*turbopackIgnore: true*/ join(/*turbopackIgnore: true*/ root, orgId)).catch(missingOk)) ?? []).filter((n) => ID_RE.test(n));
    if (!names.length) continue;
    // Under the company's lock, so no upload, change or Undo can move an image while we decide and delete.
    removed += await inScope({ orgId, lock: true }, async (tx) => {
      const onTickets = await tx.select({ id: s.attachments.id }).from(s.attachments).where(eq(s.attachments.orgId, orgId));
      const inDocs = await tx.select({ id: s.docFiles.id }).from(s.docFiles).where(eq(s.docFiles.orgId, orgId));
      const inDecisions = await tx.select({ id: s.decisionFiles.id }).from(s.decisionFiles).where(eq(s.decisionFiles.orgId, orgId));
      const inUndo = await tx.execute(sql`select distinct jsonb_path_query(before, '$.tickets[*].attachments[*].id') #>> '{}' as id
        from undo_points where org_id = ${orgId}`);
      const used = new Set([...onTickets.map((r) => r.id), ...inDocs.map((r) => r.id), ...inDecisions.map((r) => r.id), ...(inUndo.rows as { id: string }[]).map((r) => r.id)]);
      let n = 0;
      for (const name of names) {
        if (used.has(name)) continue;
        const path = join(/*turbopackIgnore: true*/ root, orgId, name);
        const info = await stat(/*turbopackIgnore: true*/ path).catch(missingOk);
        if (!info || now - info.mtimeMs < CLEANUP_GRACE_MS) continue; // fresh: its upload may still be finishing
        await rm(/*turbopackIgnore: true*/ path, { force: true });
        n += 1;
      }
      return n;
    });
  }
  return removed;
}
