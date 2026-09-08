import { useEffect } from 'react';
import { useSearch, useLocation } from 'wouter';
import { useGetReport, getGetReportQueryKey } from '@workspace/api-client-react';
import { CaseScope, useCaseWorkspace } from '@/hooks/use-case-workspace';
import { ReportsList } from '@/features/reports/ReportsList';
import { ReportEditor } from '@/features/reports/ReportEditor';

export function Reports() {
  const { caseId, setCaseId } = useCaseWorkspace();
  const searchString = useSearch();
  const searchParams = new URLSearchParams(searchString);
  const reportId = searchParams.get('report');
  const [, setLocation] = useLocation();

  const { data: activeReport } = useGetReport(reportId || "", { query: { enabled: !!reportId, queryKey: getGetReportQueryKey(reportId || "") } });
  
  useEffect(() => {
    if (activeReport && activeReport.case_id !== caseId) {
      setCaseId(activeReport.case_id);
    }
  }, [activeReport, caseId, setCaseId]);

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight mb-1">Intelligence Reports</h1>
        <p className="text-muted-foreground">Draft and finalize authorized investigation findings.</p>
      </div>

      <CaseScope>
        {activeReport ? (
          <ReportEditor report={activeReport} onBack={() => {
            const params = new URLSearchParams(searchString);
            params.delete('report');
            const str = params.toString();
            setLocation(window.location.pathname + (str ? `?${str}` : ''));
          }} />
        ) : (
          <ReportsList onSelect={(report) => {
            const params = new URLSearchParams(searchString);
            params.set('report', report.id);
            setLocation(window.location.pathname + `?${params.toString()}`);
          }} />
        )}
      </CaseScope>
    </div>
  );
}
