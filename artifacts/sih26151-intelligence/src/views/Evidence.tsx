import { useState, useEffect } from 'react';
import { CaseScope, useCaseWorkspace } from '@/hooks/use-case-workspace';
import { EvidenceList } from '@/features/evidence/EvidenceList';
import { EvidenceDetails } from '@/features/evidence/EvidenceDetails';
import { EvidenceUpload } from '@/features/evidence/EvidenceUpload';
import { EvidenceManualCreate } from '@/features/evidence/EvidenceManualCreate';
import { AnalysisDialog } from '@/features/evidence/AnalysisDialog';
import { AnalysisJobStatus } from '@/features/evidence/AnalysisJobStatus';
import { useGetEvidence, getGetEvidenceQueryKey } from '@workspace/api-client-react';
import { useSearch, useLocation } from 'wouter';
import { Database, Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

export function Evidence() {
  const search = useSearch();
  const evidenceId = new URLSearchParams(search).get("evidence") || "";
  const { caseId, setCaseId } = useCaseWorkspace();

  const { data: directEvidence, isLoading, error } = useGetEvidence(evidenceId, {
    query: {
      enabled: !!evidenceId,
      queryKey: getGetEvidenceQueryKey(evidenceId)
    }
  });

  useEffect(() => {
    if (directEvidence && directEvidence.case_id !== caseId) {
      setCaseId(directEvidence.case_id);
    }
  }, [directEvidence, caseId, setCaseId]);

  const isCaseMismatch = evidenceId && directEvidence && directEvidence.case_id !== caseId;

  return (
    <div className="p-4 md:p-8 max-w-[1600px] mx-auto space-y-6">
      <div>
          <h1 className="text-3xl font-bold tracking-tight mb-1 flex items-center gap-2">
            <Database className="h-7 w-7" /> Evidence Depository
          </h1>
          <p className="text-muted-foreground">Secure ingestion, management, and analysis of raw investigation data.</p>
      </div>

      {evidenceId && (isLoading || isCaseMismatch) ? (
        <div className="py-20 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
      ) : evidenceId && error ? (
        <div className="py-20 text-center text-destructive border rounded-lg bg-destructive/10 p-8 max-w-xl mx-auto">
          Failed to load evidence. It may have been removed or you lack access.
        </div>
      ) : (
        <CaseScope>
          <EvidenceContent key={caseId} />
        </CaseScope>
      )}
    </div>
  );
}

function EvidenceContent() {
  const search = useSearch();
  const [, setLocation] = useLocation();
  const urlEvidenceId = new URLSearchParams(search).get("evidence") || "";

  const [selectedId, setSelectedId] = useState(urlEvidenceId);

  // Sync selectedId with URL when URL changes
  useEffect(() => {
    if (urlEvidenceId && urlEvidenceId !== selectedId) {
      setSelectedId(urlEvidenceId);
    }
  }, [urlEvidenceId, selectedId]);

  // Sync URL with selectedId
  const handleSelect = (id: string) => {
    setSelectedId(id);
    const params = new URLSearchParams(search);
    if (id) {
      params.set("evidence", id);
    } else {
      params.delete("evidence");
    }
    const searchString = params.toString();
    setLocation(searchString ? `?${searchString}` : window.location.pathname, { replace: true });
  };

  const { data: selectedEvidence, isLoading } = useGetEvidence(selectedId, {
    query: {
      enabled: !!selectedId,
      queryKey: getGetEvidenceQueryKey(selectedId)
    }
  });

  return <>
        <div className="flex flex-wrap gap-3">
          <AnalysisDialog /><EvidenceManualCreate /><EvidenceUpload />
        </div>
        <AnalysisJobStatus />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 min-h-0">
          <div className="md:col-span-1 h-full">
            <EvidenceList selectedId={selectedId || null} onSelect={(item) => handleSelect(item.id)} />
          </div>
          <div className="md:col-span-3 h-full overflow-y-auto">
            {isLoading ? (
              <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
            ) : selectedEvidence ? (
              <EvidenceDetails evidence={selectedEvidence} key={selectedEvidence.id} />
            ) : (
              <Card className="h-full border-dashed bg-transparent flex items-center justify-center">
                <CardContent className="text-center text-muted-foreground space-y-2">
                  <Database className="h-8 w-8 mx-auto text-muted-foreground/50" />
                  <p className="text-sm font-medium">No evidence selected</p>
                  <p className="text-xs">Select an item from the list to view details.</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
  </>;
}