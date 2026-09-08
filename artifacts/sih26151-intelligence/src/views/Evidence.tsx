import { useState } from 'react';
import { CaseScope, useCaseWorkspace } from '@/hooks/use-case-workspace';
import { EvidenceList } from '@/features/evidence/EvidenceList';
import { EvidenceDetails } from '@/features/evidence/EvidenceDetails';
import { EvidenceUpload } from '@/features/evidence/EvidenceUpload';
import { EvidenceManualCreate } from '@/features/evidence/EvidenceManualCreate';
import { AnalysisDialog } from '@/features/evidence/AnalysisDialog';
import { AnalysisJobStatus } from '@/features/evidence/AnalysisJobStatus';
import { getListEvidenceQueryKey, useListEvidence } from '@workspace/api-client-react';
import { useSearch } from 'wouter';
import { Database } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

export function Evidence() {
  const { caseId } = useCaseWorkspace();
  return (
    <div className="p-4 md:p-8 max-w-[1600px] mx-auto space-y-6">
      <div>
          <h1 className="text-3xl font-bold tracking-tight mb-1 flex items-center gap-2">
            <Database className="h-7 w-7" /> Evidence Depository
          </h1>
          <p className="text-muted-foreground">Secure ingestion, management, and analysis of raw investigation data.</p>
      </div>
      <CaseScope>
        <EvidenceContent key={caseId} />
      </CaseScope>
    </div>
  );
}

function EvidenceContent() {
  const { caseId } = useCaseWorkspace();
  const search = useSearch();
  const [selectedId, setSelectedId] = useState(() => new URLSearchParams(search).get("evidence") || "");
  const { data } = useListEvidence(caseId, { query: { queryKey: getListEvidenceQueryKey(caseId) } });
  const selectedEvidence = data?.find((item) => item.id === selectedId);
  return <>
        <div className="flex flex-wrap gap-3">
          <AnalysisDialog /><EvidenceManualCreate /><EvidenceUpload />
        </div>
        <AnalysisJobStatus />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 min-h-0">
          <div className="md:col-span-1 h-full">
            <EvidenceList selectedId={selectedId || null} onSelect={(item) => setSelectedId(item.id)} />
          </div>
          <div className="md:col-span-3 h-full overflow-y-auto">
            {selectedEvidence ? (
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
