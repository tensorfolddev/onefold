import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // onefold/ lives inside the clockify repo, which has its own lockfile — pin the root here.
  turbopack: { root: path.join(__dirname) },
};

export default nextConfig;
