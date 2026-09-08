/** @type {import('next').NextConfig} */
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectDirectory = path.dirname(fileURLToPath(import.meta.url));
function externalGatewayOrigin(value) {
  if (!value) return undefined;
  const url = new URL(value);
  if (
    url.protocol !== "https:"
    || url.username
    || url.password
    || (url.pathname !== "/" && url.pathname !== "")
    || url.search
    || url.hash
  ) {
    throw new Error("ARGUS_GATEWAY_URL must be an HTTPS origin without credentials, path, query, or fragment.");
  }
  return url.origin;
}

const gatewayOrigin = externalGatewayOrigin(process.env.ARGUS_GATEWAY_URL);

if (process.env.VERCEL && !gatewayOrigin) {
  throw new Error("ARGUS_GATEWAY_URL must be an HTTPS origin for Vercel deployments.");
}

const nextConfig = {
  transpilePackages: ['@workspace/api-client-react'],
  outputFileTracingRoot: path.resolve(projectDirectory, "../.."),
  allowedDevOrigins: ["127.0.0.1", "localhost", "*.replit.dev", "*.replit.app", "*.repl.co"],
  agentRules: false,
  poweredByHeader: false,
  compress: true,
  async rewrites() {
    if (!gatewayOrigin) return [];
    return [{
      source: "/api/:path*",
      destination: `${gatewayOrigin}/api/:path*`,
    }];
  },
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "same-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      ],
    }];
  },
  experimental: {
    optimizePackageImports: ["lucide-react", "@radix-ui/react-icons", "recharts"],
  },
};
export default nextConfig;
