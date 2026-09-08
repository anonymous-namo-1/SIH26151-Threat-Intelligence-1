import ClientApp from "./ClientApp";

export const dynamic = "force-dynamic";

export default function CatchAllPage() {
  const clerkPubKey = process.env.CLERK_PUBLISHABLE_KEY || process.env.VITE_CLERK_PUBLISHABLE_KEY || "";
  const clerkProxyUrl = process.env.CLERK_PROXY_URL
    || process.env.VITE_CLERK_PROXY_URL
    || (process.env.VERCEL ? "/api/__clerk" : "");

  return <ClientApp clerkPubKey={clerkPubKey} clerkProxyUrl={clerkProxyUrl} />;
}
