import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
export default async function WorkspacePage({
  params,
  searchParams,
}: {
  params: Promise<{ path: string[] }>;
  searchParams: Promise<{ node?: string }>;
}) {
  const { path } = await params;
  const { node } = await searchParams;
  const valid =
    (path.length === 1 &&
      ["dashboard", "cases", "settings"].includes(path[0])) ||
    (path[0] === "cases" &&
      (path.length === 2 ||
        (path.length === 3 &&
          [
            "ingest",
            "graph",
            "entities",
            "ai-profile",
            "infrastructure",
            "report",
          ].includes(path[2]))));
  if (!valid) notFound();
  return <AppShell initialNodeId={typeof node === "string" ? node : null} />;
}
