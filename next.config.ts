import path from "node:path";
import type { NextConfig } from "next";

// Every page and API answer: no framing (clickjacking), no plugins, no MIME guessing, no full URLs (tokens live in some
// paths) sent to other sites. HSTS is added by Caddy, which owns HTTPS. Images (/api/files) set their own, stricter CSP.
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
  async headers() {
    return [{ source: "/((?!api/files/).*)", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
