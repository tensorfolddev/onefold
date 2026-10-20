// A company's own Google Drive (Integrations → Google Drive): its admins connect it with Google's own sign-in, and
// every day a backup of only that company (companyBackup.ts) goes to a "1Fold backups" folder there; the newest 30
// are kept. 1Fold asks only for drive.file — it can see and touch the files it made, nothing else in that Drive.
// The server needs GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET (a Google Cloud OAuth client; see deploy/README.md).
import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import { ValidationError } from "../../domain/commands/index.ts";
import type { SessionRow } from "../accounts.ts";
import { seal, unseal } from "../auth/secrets.ts";
import { database } from "../db/client.ts";
import * as s from "../db/schema.ts";
import { asAdmin } from "../whatsapp/settings.ts";
import { exportCompany } from "./companyBackup.ts";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const API = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";
const SCOPE = "openid email https://www.googleapis.com/auth/drive.file";
const FOLDER = "1Fold backups";
export const KEEP = 30;
const STATE_MS = 10 * 60_000; // a sign-in started this long ago has expired
const CALL_MS = 60_000;
const UPLOAD_MS = 10 * 60_000;

export const driveAvailable = () => !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET;
const client = () => ({ client_id: process.env.GOOGLE_CLIENT_ID ?? "", client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "" });
const callbackUrl = (appUrl: string) => `${appUrl}/api/drive/callback`;

class GoogleError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** A call to Google; its error, in Google's words, when it says no. */
async function google<T>(url: string, init: RequestInit, ms = CALL_MS): Promise<T> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(ms) });
  const text = await res.text();
  if (!res.ok) {
    let code: string | undefined;
    let message = `Google answered ${res.status}`;
    try {
      const body = JSON.parse(text) as { error?: string | { message?: string; status?: string }; error_description?: string };
      if (typeof body.error === "string") { code = body.error; message = body.error_description ?? body.error; }
      else if (body.error?.message) { code = body.error.status; message = body.error.message; }
    } catch { /* not JSON */ }
    throw new GoogleError(message, res.status, code);
  }
  return (text ? JSON.parse(text) : {}) as T;
}
const form = (fields: Record<string, string>) => ({
  method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(fields).toString(),
});
const bearer = (token: string, extra: Record<string, string> = {}) => ({ Authorization: `Bearer ${token}`, ...extra });

// ---------- connecting (an admin, through Google's sign-in) ----------

/** Where "Connect Google Drive" sends an admin: Google's sign-in, asking for drive.file. */
export async function connectUrl(who: SessionRow, appUrl: string): Promise<string> {
  if (!driveAvailable()) throw new ValidationError("Google Drive isn't set up on this server yet");
  await asAdmin(who);
  // The sign-in comes back to whoever started it, within minutes — sealed, so nobody can forge it.
  const state = seal(JSON.stringify({ o: who.orgId, u: who.userId, e: Date.now() + STATE_MS }));
  const q = new URLSearchParams({
    client_id: client().client_id, redirect_uri: callbackUrl(appUrl), response_type: "code", scope: SCOPE,
    access_type: "offline", prompt: "consent", include_granted_scopes: "true", state,
  });
  return `${AUTH_URL}?${q}`;
}

const emailOf = (idToken?: string) => {
  try { return String(JSON.parse(Buffer.from(idToken!.split(".")[1], "base64url").toString()).email ?? "") || null; } catch { return null; }
};

/** Google's answer: the company's Drive is connected (a lasting token, sealed), to the account that signed in. */
export async function finishConnect(who: SessionRow, input: { code: string; state: string }, appUrl: string): Promise<string> {
  const meId = await asAdmin(who);
  const expired = new ValidationError("That sign-in expired — press Connect Google Drive again");
  let state: { o?: string; u?: string; e?: number };
  try { state = JSON.parse(unseal(input.state)); } catch { throw expired; }
  if (state.o !== who.orgId || state.u !== who.userId || !state.e || state.e < Date.now()) throw expired;
  const tokens = await google<{ refresh_token?: string; id_token?: string }>(TOKEN_URL, form({
    ...client(), code: input.code, redirect_uri: callbackUrl(appUrl), grant_type: "authorization_code",
  }));
  if (!tokens.refresh_token) throw new ValidationError("Google didn't give 1Fold lasting access — press Connect again, and allow it");
  const email = emailOf(tokens.id_token) ?? "your Google account";
  const row = { refreshToken: seal(tokens.refresh_token), accountEmail: email, folderId: null, connectedBy: meId, connectedAt: sql`now()`, lastError: null };
  await database().insert(s.companyDrive).values({ orgId: who.orgId, ...row })
    .onConflictDoUpdate({ target: s.companyDrive.orgId, set: row });
  return email;
}

/** Forgets the company's Drive (and tells Google to drop 1Fold's access). The backups stay in that Drive. */
export async function disconnectDrive(who: SessionRow): Promise<void> {
  await asAdmin(who);
  const [row] = await database().select().from(s.companyDrive).where(eq(s.companyDrive.orgId, who.orgId));
  if (!row) return;
  try { await google(REVOKE_URL, form({ token: unseal(row.refreshToken) })); } catch (e) { console.warn("[drive] couldn't revoke the token", e); }
  await database().delete(s.companyDrive).where(eq(s.companyDrive.orgId, who.orgId));
}

// ---------- the backups ----------

type Row = typeof s.companyDrive.$inferSelect;
export interface DriveFile { id: string; name: string; createdAt: string; bytes: number; link: string }

async function accessToken(row: Row): Promise<string> {
  try {
    return (await google<{ access_token: string }>(TOKEN_URL, form({ ...client(), refresh_token: unseal(row.refreshToken), grant_type: "refresh_token" }))).access_token;
  } catch (e) {
    if (e instanceof GoogleError && e.code === "invalid_grant") throw new Error("Google Drive access was removed — connect it again");
    throw e;
  }
}

/** The "1Fold backups" folder in the company's Drive — made again if someone deleted it. */
async function folderOf(row: Row, token: string): Promise<string> {
  if (row.folderId) {
    try {
      const f = await google<{ trashed?: boolean }>(`${API}/files/${encodeURIComponent(row.folderId)}?fields=id,trashed`, { headers: bearer(token) });
      if (!f.trashed) return row.folderId;
    } catch (e) {
      if (!(e instanceof GoogleError && e.status === 404)) throw e;
    }
  }
  const made = await google<{ id: string }>(`${API}/files?fields=id`, {
    method: "POST", headers: bearer(token, { "Content-Type": "application/json" }),
    body: JSON.stringify({ name: FOLDER, mimeType: "application/vnd.google-apps.folder" }),
  });
  await database().update(s.companyDrive).set({ folderId: made.id }).where(eq(s.companyDrive.orgId, row.orgId));
  return made.id;
}

async function list(token: string, folderId: string): Promise<DriveFile[]> {
  const q = new URLSearchParams({
    q: `'${folderId.replace(/'/g, "")}' in parents and trashed = false and name contains '1fold-'`,
    orderBy: "createdTime desc", pageSize: "100", fields: "files(id,name,size,createdTime,webViewLink)",
  });
  const r = await google<{ files?: { id: string; name: string; size?: string; createdTime: string; webViewLink?: string }[] }>(`${API}/files?${q}`, { headers: bearer(token) });
  return (r.files ?? []).map((f) => ({ id: f.id, name: f.name, createdAt: f.createdTime, bytes: Number(f.size ?? 0), link: f.webViewLink ?? "" }));
}

/** A resumable upload (Google's way for big files): ask where, then send the bytes there. */
async function upload(token: string, folderId: string, name: string, bytes: Buffer): Promise<void> {
  const start = await fetch(`${UPLOAD}?uploadType=resumable&fields=id`, {
    method: "POST", signal: AbortSignal.timeout(CALL_MS),
    headers: bearer(token, { "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Type": "application/zip", "X-Upload-Content-Length": String(bytes.length) }),
    body: JSON.stringify({ name, parents: [folderId], mimeType: "application/zip" }),
  });
  const where = start.headers.get("location");
  if (!start.ok || !where) throw new GoogleError(`Google wouldn't take the upload (${start.status})`, start.status);
  await google(where, { method: "PUT", headers: { "Content-Type": "application/zip" }, body: new Uint8Array(bytes) }, UPLOAD_MS);
}

export type BackupResult = { ok: true; bytes: number } | { ok: false; reason: string };

/**
 * One backup of a company to its Drive, now: made, uploaded, and only the newest 30 kept. Never two at once for a
 * company; a failure is kept for its admins to see (and the worker tries again within the hour).
 */
export async function backUpCompany(orgId: string): Promise<BackupResult> {
  const [row] = await database().update(s.companyDrive).set({ runningSince: sql`now()` })
    .where(and(eq(s.companyDrive.orgId, orgId), or(isNull(s.companyDrive.runningSince), lt(s.companyDrive.runningSince, sql`now() - interval '30 minutes'`))))
    .returning();
  if (!row) return { ok: false, reason: "A backup is already running, or Google Drive isn't connected" };
  try {
    const token = await accessToken(row);
    const folderId = await folderOf(row, token);
    const { zip, name } = await exportCompany(orgId);
    await upload(token, folderId, name, zip);
    for (const old of (await list(token, folderId)).slice(KEEP)) await google(`${API}/files/${encodeURIComponent(old.id)}`, { method: "DELETE", headers: bearer(token) });
    await database().update(s.companyDrive).set({ runningSince: null, lastOkAt: sql`now()`, lastBytes: zip.length, lastError: null }).where(eq(s.companyDrive.orgId, orgId));
    return { ok: true, bytes: zip.length };
  } catch (e) {
    const reason = e instanceof Error ? e.message.slice(0, 300) : "The backup failed";
    console.error(`[drive] ${orgId}'s backup failed`, e);
    await database().update(s.companyDrive).set({ runningSince: null, lastError: reason }).where(eq(s.companyDrive.orgId, orgId));
    return { ok: false, reason };
  }
}

/** The worker, hourly: every connected company whose last backup is a day old (or failed) gets one. */
export async function backUpDue(): Promise<{ done: number; failed: number } | undefined> {
  if (!driveAvailable()) return undefined;
  const due = await database().select({ orgId: s.companyDrive.orgId }).from(s.companyDrive)
    .where(or(isNull(s.companyDrive.lastOkAt), lt(s.companyDrive.lastOkAt, sql`now() - interval '23 hours'`), sql`${s.companyDrive.lastError} is not null`));
  if (!due.length) return undefined;
  let done = 0;
  let failed = 0;
  for (const { orgId } of due) {
    if ((await backUpCompany(orgId)).ok) done += 1;
    else failed += 1;
  }
  return { done, failed };
}

export interface DriveStatus {
  available: boolean; // the server can connect to Google at all
  keep: number;
  connected: { email: string; connectedAt: string; lastOkAt: string | null; lastError: string | null; lastBytes: number | null; running: boolean } | null;
  backups: DriveFile[];
}

/** Integrations → Google Drive, for the company's admins: whether it's connected — and, `withBackups`, what's in it (a
 * call to Google, so only the Drive page asks). */
export async function driveStatus(who: SessionRow, withBackups = false): Promise<DriveStatus> {
  await asAdmin(who);
  const [row] = await database().select().from(s.companyDrive).where(eq(s.companyDrive.orgId, who.orgId));
  if (!row) return { available: driveAvailable(), keep: KEEP, connected: null, backups: [] };
  const connected = {
    email: row.accountEmail, connectedAt: row.connectedAt, lastOkAt: row.lastOkAt, lastError: row.lastError, lastBytes: row.lastBytes,
    running: !!row.runningSince,
  };
  if (!row.folderId || !withBackups) return { available: driveAvailable(), keep: KEEP, connected, backups: [] };
  try {
    return { available: driveAvailable(), keep: KEEP, connected, backups: await list(await accessToken(row), row.folderId) };
  } catch (e) {
    return { available: driveAvailable(), keep: KEEP, connected: { ...connected, lastError: e instanceof Error ? e.message : "Couldn't reach Google Drive" }, backups: [] };
  }
}
