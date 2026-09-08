/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@workspace/api-client-react'],
  allowedDevOrigins: ["127.0.0.1", "localhost", "*.replit.dev", "*.replit.app", "*.repl.co"],
  agentRules: false,
  experimental: {
    optimizePackageImports: ["lucide-react", "@radix-ui/react-icons", "recharts"],
  },
};
export default nextConfig;
