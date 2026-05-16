import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Production is reverse-proxied at swagcounty.com/shuffleify, so the app
  // is mounted under that path prefix. basePath makes Next.js emit assets
  // and route URLs under /shuffleify (so /_next/* assets, OAuth callbacks,
  // and internal links all stay inside the proxied path).
  basePath: "/shuffleify",
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};

export default nextConfig;