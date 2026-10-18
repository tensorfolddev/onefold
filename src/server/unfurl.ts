// Link previews for doc link cards: a web page's title, description, image and icon. The server fetches the page, so
// it guards against being pointed at private networks (SSRF): http(s) only, every address the name resolves to must be
// public — checked at connect time, so DNS can't be switched in between — at most 3 redirects (each checked again),
// 5 seconds, 1 MB, HTML only. Results are cached for a week (failures for a day), shared by every company.
import { createHash } from "node:crypto";
import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import http from "node:http";
import https from "node:https";
import { isIP } from "node:net";
import { eq } from "drizzle-orm";
import { ValidationError } from "../domain/commands/index.ts";
import { database } from "./db/client.ts";
import * as s from "./db/schema.ts";

const TIMEOUT_MS = 5000;
const MAX_BYTES = 1024 * 1024;
const MAX_REDIRECTS = 3;
const FRESH_MS = 7 * 86_400_000;
const FAILED_FRESH_MS = 86_400_000;

export interface Preview { url: string; domain: string; title: string; description?: string; image?: string; icon?: string; siteName?: string }

/** Whether an IP is on the public internet (not private, loopback, link-local, CGNAT, multicast, reserved or a test net). */
export function isPublicAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b, c] = ip.split(".").map(Number);
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 100 && b >= 64 && b <= 127) return false; // carrier-grade NAT
    if (a === 192 && b === 0 && (c === 0 || c === 2)) return false;
    if (a === 198 && (b === 18 || b === 19)) return false; // benchmarking
    if ((a === 198 && b === 51 && c === 100) || (a === 203 && b === 0 && c === 113)) return false; // documentation
    return true;
  }
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase();
    if (v === "::" || v === "::1") return false;
    const dotted = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v);
    if (dotted) return isPublicAddress(dotted[1]);
    const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(v);
    if (hex) { const n = (parseInt(hex[1], 16) << 16) | parseInt(hex[2], 16); return isPublicAddress([n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join(".")); }
    if (/^(f[cd]|fe[89ab]|ff)/.test(v)) return false; // unique-local, link-local, multicast
    if (v.startsWith("2001:db8") || v.startsWith("64:ff9b:") || v.startsWith("100::")) return false; // docs, NAT64, discard
    return true;
  }
  return false;
}

/** DNS lookup that refuses names pointing at non-public addresses — used for the actual connection. */
function publicLookup(host: string, opts: object, cb: (err: Error | null, address: string | LookupAddress[], family?: number) => void) {
  dnsLookup(host, { ...opts, all: true }, (err, addresses) => {
    if (err) return cb(err, "");
    const list = addresses as LookupAddress[];
    if (!list.length || !list.every((a) => isPublicAddress(a.address))) return cb(new ValidationError("That address isn't allowed"), "");
    if ((opts as { all?: boolean }).all) return cb(null, list);
    cb(null, list[0].address, list[0].family);
  });
}

/** GET one URL: { status, location, type, body } — body only for HTML, at most MAX_BYTES. */
function get(url: URL): Promise<{ status: number; location?: string; type: string; body: string }> {
  return new Promise((resolve, reject) => {
    if (isIP(url.hostname.replace(/^\[|\]$/g, "")) && !isPublicAddress(url.hostname.replace(/^\[|\]$/g, ""))) return reject(new ValidationError("That address isn't allowed"));
    const lib = url.protocol === "https:" ? https : http;
    const req = lib.get(url, {
      lookup: publicLookup as never, timeout: TIMEOUT_MS,
      headers: { "User-Agent": "1FoldBot/1.0 (+link previews)", Accept: "text/html,application/xhtml+xml", "Accept-Encoding": "identity" },
    }, (res) => {
      const type = String(res.headers["content-type"] ?? "");
      if ((res.statusCode ?? 0) >= 300 && (res.statusCode ?? 0) < 400) { res.resume(); return resolve({ status: res.statusCode!, location: res.headers.location, type, body: "" }); }
      if (!/text\/html|application\/xhtml/i.test(type)) { res.resume(); return resolve({ status: res.statusCode ?? 0, type, body: "" }); }
      let size = 0;
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => {
        size += c.length;
        if (size > MAX_BYTES) { req.destroy(); return; } // enough to read the <head>
        chunks.push(c);
      });
      res.on("close", () => resolve({ status: res.statusCode ?? 0, type, body: Buffer.concat(chunks).toString("utf8") }));
    });
    req.on("timeout", () => req.destroy(new ValidationError("That page took too long")));
    req.on("error", reject);
  });
}

const decode = (s: string) => s.replace(/&(#x?[0-9a-f]+|amp|lt|gt|quot|apos|#39|nbsp);/gi, (m, e: string) => {
  const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", "#39": "'", nbsp: " " };
  if (named[e.toLowerCase()]) return named[e.toLowerCase()];
  const code = e[1]?.toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
  return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
}).replace(/\s+/g, " ").trim();

const absolute = (href: string | undefined, base: string) => {
  if (!href) return undefined;
  try { const u = new URL(decode(href), base); return /^https?:$/.test(u.protocol) ? u.toString() : undefined; } catch { return undefined; }
};

/** A page's preview from its HTML (Open Graph first, then the plain <title>), URLs made absolute. */
export function parsePreview(html: string, pageUrl: string): Preview {
  const head = html.slice(0, 200_000);
  const attrs = (tag: string) => Object.fromEntries([...tag.matchAll(/([a-zA-Z:-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g)].map((m) => [m[1].toLowerCase(), m[3] ?? m[4] ?? m[5] ?? ""]));
  const metas = [...head.matchAll(/<meta\b[^>]*>/gi)].map((m) => attrs(m[0]));
  const meta = (...names: string[]) => metas.find((m) => names.includes((m.property ?? m.name ?? "").toLowerCase()))?.content;
  const links = [...head.matchAll(/<link\b[^>]*>/gi)].map((m) => attrs(m[0]));
  const icon = links.find((l) => /(^|\s)(icon|shortcut icon|apple-touch-icon)(\s|$)/i.test(l.rel ?? ""))?.href ?? "/favicon.ico";
  const domain = new URL(pageUrl).hostname.replace(/^www\./, "");
  const title = decode(meta("og:title", "twitter:title") ?? /<title[^>]*>([\s\S]*?)<\/title>/i.exec(head)?.[1] ?? "") || domain;
  const description = decode(meta("og:description", "twitter:description", "description") ?? "");
  return {
    url: pageUrl, domain, title: title.slice(0, 200),
    ...(description && { description: description.slice(0, 300) }),
    ...(absolute(meta("og:image", "twitter:image"), pageUrl) && { image: absolute(meta("og:image", "twitter:image"), pageUrl) }),
    ...(absolute(icon, pageUrl) && { icon: absolute(icon, pageUrl) }),
    ...(meta("og:site_name") && { siteName: decode(meta("og:site_name")!).slice(0, 80) }),
  };
}

/** Fetches a page (following up to 3 safe redirects) and reads its preview. */
export async function fetchPreview(raw: string): Promise<Preview> {
  let url: URL;
  try { url = new URL(raw); } catch { throw new ValidationError("That isn't a web address"); }
  for (let hops = 0; ; hops += 1) {
    if (!/^https?:$/.test(url.protocol) || url.username || url.password) throw new ValidationError("Only plain http(s) links get a preview");
    const res = await get(url);
    if (res.location) {
      if (hops >= MAX_REDIRECTS) throw new ValidationError("That link redirects too many times");
      url = new URL(res.location, url);
      continue;
    }
    if (res.status >= 400 || !res.body) return { url: raw, domain: url.hostname.replace(/^www\./, ""), title: url.hostname.replace(/^www\./, "") };
    return { ...parsePreview(res.body, url.toString()), url: raw };
  }
}

/** A cached preview, or a fresh one. A page that can't be read still gets a card (its domain), cached for a day. */
export async function unfurl(raw: string): Promise<Preview> {
  const url = raw.trim().slice(0, 2048);
  const urlHash = createHash("sha256").update(url).digest("hex");
  const db = database();
  const [hit] = await db.select().from(s.linkPreviews).where(eq(s.linkPreviews.urlHash, urlHash));
  if (hit) {
    const data = hit.data as Preview & { failed?: boolean };
    if (Date.now() - Date.parse(hit.fetchedAt) < (data.failed ? FAILED_FRESH_MS : FRESH_MS)) return data;
  }
  let preview: Preview & { failed?: boolean };
  try {
    preview = await fetchPreview(url);
  } catch (e) {
    if (e instanceof ValidationError && /isn't allowed|plain http|web address/.test(e.message)) throw e; // never cache a refusal
    const host = (() => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; } })();
    preview = { url, domain: host, title: host, failed: true };
  }
  await db.insert(s.linkPreviews).values({ urlHash, url, data: preview, fetchedAt: new Date().toISOString() })
    .onConflictDoUpdate({ target: s.linkPreviews.urlHash, set: { data: preview, fetchedAt: new Date().toISOString() } });
  return preview;
}
