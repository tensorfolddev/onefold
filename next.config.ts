import path from "node:path";
import type { NextConfig } from "next";

// Every page and API answer: no framing (clickjacking), no plugins, no MIME guessing, no full URLs (tokens live in some
// paths) sent to other sites. HSTS is added by Caddy, which owns HTTPS. Files (/api/files, and a public link's under
// /api/share) set their own, stricter CSP — and a PDF needs the browser's viewer, which object-src 'none' would stop.
const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
];

const nextConfig: NextConfig = {
  // onefold/ lives inside the clockify repo, which has its own lockfile — pin the root here.
  turbopack: { root: path.join(__dirname) },
  poweredByHeader: false,
  // Development only: a phone on the same Wi-Fi opens the bot's WhatsApp links (this machine's network address — see
  // server/whatsapp/appLink.ts). Private network addresses only.
  allowedDevOrigins: ["10.*.*.*", "192.168.*.*", "172.*.*.*"],
  async headers() {
    return [{ source: "/((?!api/(?:files|share)/).*)", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
