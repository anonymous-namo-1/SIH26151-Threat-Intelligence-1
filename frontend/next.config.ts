import type { NextConfig } from "next";

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL?.trim().replace(/\/$/, "");
const nextConfig: NextConfig = {
  poweredByHeader: false,
  allowedDevOrigins: ["127.0.0.1"],
  devIndicators: false,
  agentRules: false,
  async rewrites() {
    return apiBase
      ? [{ source: "/api/backend/:path*", destination: `${apiBase}/:path*` }]
      : [];
  },
};
export default nextConfig;
