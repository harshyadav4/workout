import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The build the browser was loaded from, baked into the client. The update
  // bar compares it with /api/version (same source, read at request time).
  env: {
    NEXT_PUBLIC_BUILD_ID: process.env.VERCEL_GIT_COMMIT_SHA || process.env.NEXT_PUBLIC_BUILD_ID || "dev"
  },
  experimental: {
    optimizePackageImports: ["lucide-react", "recharts"]
  }
};

export default nextConfig;
