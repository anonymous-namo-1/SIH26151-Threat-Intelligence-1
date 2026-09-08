"use client";

import dynamic from "next/dynamic";

const App = dynamic(() => import("../../App"), {
  ssr: false,
  loading: () => <div className="min-h-screen flex items-center justify-center text-muted-foreground" role="status">Opening ARGUS…</div>,
});

export default function ClientApp({ clerkPubKey, clerkProxyUrl }: { clerkPubKey: string, clerkProxyUrl: string }) {
  return <App clerkPubKey={clerkPubKey} clerkProxyUrl={clerkProxyUrl} />;
}
