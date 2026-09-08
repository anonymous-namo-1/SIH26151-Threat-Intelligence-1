import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useUser } from "@clerk/react";
import { useGetCase, getGetCaseQueryKey, useListCases, getListCasesQueryKey, type Case } from "@workspace/api-client-react";
import { Link } from "wouter";

type CaseWorkspace = {
  caseId: string;
  activeCase?: Case;
  cases: Case[];
  setCaseId: (id: string) => void;
  isLoading: boolean;
  error: unknown;
  retry: () => void;
};
const Context = createContext<CaseWorkspace | null>(null);

export function CaseWorkspaceProvider({ children }: { children: ReactNode }) {
  const { user, isSignedIn } = useUser();
  const query = useListCases({ limit: 100 }, { query: { enabled: !!isSignedIn, staleTime: 30_000, queryKey: getListCasesQueryKey({ limit: 100 }) } });

  const [selected, setSelected] = useState(() => {
    return localStorage.getItem("argus_active_case") || "";
  });

  const handleSetSelected = (id: string) => {
    setSelected(id);
    if (id) {
      localStorage.setItem("argus_active_case", id);
    } else {
      localStorage.removeItem("argus_active_case");
    }
  };

  useEffect(() => {
    if (user?.id) {
      // Don't reset if we have a valid saved case, but maybe we should?
      // Keeping it from localStorage is fine.
    } else {
      handleSetSelected("");
    }
  }, [user?.id]);

  const cases = query.data?.items ?? [];
  const listedCase = cases.find((item) => item.id === selected);

  // Validate if the selected case is accessible.
  const detail = useGetCase(selected, { query: {
    queryKey: getGetCaseQueryKey(selected),
    enabled: !!isSignedIn && !!selected && !listedCase,
    retry: false
  } });

  useEffect(() => {
    if (detail.error) {
      // If we got an error fetching the specific case, it might be unauthorized or deleted.
      // We don't auto-clear it here to let the user see the error, but we could.
    }
  }, [detail.error]);

  const activeCase = selected ? listedCase || detail.data : cases[0];

  // If we fell back to cases[0] because there was no selection, let's not auto-save it yet
  // until the user actually selects it, or maybe we just let caseId be cases[0].id

  const caseId = activeCase?.id || "";

  return <Context.Provider value={{
    caseId, activeCase, cases, setCaseId: handleSetSelected,
    isLoading: query.isLoading || (!!selected && !listedCase && detail.isLoading),
    error: query.error || (selected && !listedCase ? detail.error : null),
    retry: () => { void query.refetch(); if (selected && !listedCase) void detail.refetch(); },
  }}>{children}</Context.Provider>;
}

export function useCaseWorkspace() {
  const context = useContext(Context);
  if (!context) throw new Error("CaseWorkspaceProvider is required");
  return context;
}

export function CaseScope({ children }: { children: ReactNode }) {
  const { caseId, cases, setCaseId, isLoading, error, retry } = useCaseWorkspace();
  if (isLoading) return <p className="p-8 text-muted-foreground" role="status">Loading your investigations…</p>;
  if (error) return <div role="alert" className="p-8 space-y-3"><p>The selected case could not be loaded. It may have been removed or your access changed.</p><button onClick={retry} className="underline mr-4">Try again</button><button className="underline" onClick={() => setCaseId("")}>Choose an available case</button></div>;
  if (!caseId) return <div className="rounded-lg border p-10 text-center space-y-3"><h2 className="text-xl font-semibold">Start with a case</h2><p className="text-muted-foreground">Evidence and analysis stay within the investigation you select.</p><Link className="inline-block underline" href="/cases/new">Create an investigation</Link></div>;
  return <div className="space-y-5">
    <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card px-4 py-3">
      <label htmlFor="active-case" className="text-xs uppercase tracking-wider text-muted-foreground">Case workspace</label>
      <select id="active-case" value={caseId} onChange={(event) => setCaseId(event.target.value)}
        className="max-w-full rounded-md border bg-background px-3 py-2 text-sm">
        {!cases.some((item) => item.id === caseId) && <option value={caseId}>Selected case · {caseId.slice(0, 8)}</option>}
        {cases.map((item) => <option key={item.id} value={item.id}>{item.id.slice(0, 8)} · {item.title}</option>)}
      </select>
      <Link className="text-xs text-primary underline" href={`/cases/${caseId}`}>Case details</Link>
    </div>
    {children}
  </div>;
}