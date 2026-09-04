import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Pin the file-tracing root to this project. Without it, Next.js can pick a
  // parent directory as the root if a stray lockfile exists above the project
  // (e.g. an empty ~/package-lock.json from an accidental `npm install`).
  outputFileTracingRoot: dirname(fileURLToPath(import.meta.url)),
};

export default nextConfig;
