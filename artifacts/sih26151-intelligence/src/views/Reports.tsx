import { useSearch, useLocation } from 'wouter';
import { useListReports, type Report, getListReportsQueryKey } from '@workspace/api-client-react';
import { CaseScope, useCaseWorkspace } from '@/hooks/use-case-workspace';
import { ReportsList } from '@/features/reports/ReportsList';
import { ReportEditor } from '@/features/reports/ReportEditor';

export function Reports() {
  const { caseId } = useCaseWorkspace();
  const searchString = useSearch();
  const searchParams = new URLSearchParams(searchString);
  const reportId = searchParams.get('report');
  const [location, setLocation] = useLocation();

  const { data: reports } = useListReports(caseId, { query: { enabled: !!caseId, queryKey: getListReportsQueryKey(caseId) } });
  
  const activeReport = reports?.find(r => r.id === reportId) || null;

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight mb-1">Intelligence Reports</h1>
        <p className="text-muted-foreground">Draft and finalize authorized investigation findings.</p>
      </div>

      <CaseScope>
        {activeReport ? (
          <ReportEditor report={activeReport} onBack={() => {
            const newUrl = new URL(window.location.href);
            newUrl.searchParams.delete('report');
            setLocation(newUrl.pathname + newUrl.search);
          }} />
        ) : (
          <ReportsList onSelect={(report) => {
            const newUrl = new URL(window.location.href);
            newUrl.searchParams.set('report', report.id);
            setLocation(newUrl.pathname + newUrl.search);
          }} />
        )}
      </CaseScope>
    </div>
  );
}
