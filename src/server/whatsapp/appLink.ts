// The address the bot's WhatsApp messages link to. It's APP_URL — except in development, where APP_URL is usually
// http://localhost:3000: WhatsApp won't make that a link, and on a phone "localhost" is the phone itself. So there it
// becomes this machine's address on the local network (http://10.x.x.x:3000), which WhatsApp links and a phone on the
// same Wi-Fi opens. A real domain is used as it is.
import { networkInterfaces } from "node:os";

const LOCAL = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/** This machine's first IPv4 address on a network (not loopback), or null. */
export function lanAddress(): string | null {
  for (const list of Object.values(networkInterfaces())) {
    for (const a of list ?? []) if (a.family === "IPv4" && !a.internal) return a.address;
  }
  return null;
}

/** The base for links in WhatsApp messages (no trailing slash). */
export function whatsappLinkBase(appUrl = process.env.APP_URL ?? "", lan = lanAddress): string {
  const base = appUrl.replace(/\/$/, "");
  if (process.env.NODE_ENV === "production") return base;
  try {
    const url = new URL(base);
    const ip = LOCAL.has(url.hostname) ? lan() : null;
    if (!ip) return base;
    url.hostname = ip;
    return url.toString().replace(/\/$/, "");
  } catch {
    return base;
  }
}
