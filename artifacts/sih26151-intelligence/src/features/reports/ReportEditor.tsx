import { useState, useEffect, useRef, useCallback } from 'react';
import { useUpdateReport, useListEvidence, getListEvidenceQueryKey, getGetReportQueryKey, type Report, type Evidence } from '@workspace/api-client-react';
import { useCaseWorkspace } from '@/hooks/use-case-workspace';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Save, Download } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { getListReportsQueryKey } from '@workspace/api-client-react';
import { ReportExportModal } from './ReportExportModal';
import { usePermissions } from '@/hooks/use-permissions';

export function ReportEditor({ report, onBack }: { report: Report; onBack: () => void }) {
  const { caseId } = useCaseWorkspace();
  const queryClient = useQueryClient();
  const { canWriteReport, canExportReport } = usePermissions();
  const { data: evidenceList } = useListEvidence(caseId, { limit: 500 }, { query: { enabled: !!caseId, queryKey: getListEvidenceQueryKey(caseId, { limit: 500 }) } });
  
  const [title, setTitle] = useState(report.title);
  const [body, setBody] = useState(report.body);
  const [citations, setCitations] = useState<Set<string>>(new Set(report.citations));
  
  const [isExportOpen, setIsExportOpen] = useState(false);
  
  const lastSaved = useRef({ title: report.title, body: report.body, citations: [...report.citations] });
  const initializedForId = useRef<string | null>(null);

  useEffect(() => {
    if (initializedForId.current !== report.id) {
      initializedForId.current = report.id;
      setTitle(report.title);
      setBody(report.body);
      setCitations(new Set(report.citations));
      lastSaved.current = { title: report.title, body: report.body, citations: [...report.citations] };
    }
  }, [report]);

  const isDirty = title !== lastSaved.current.title || 
                  body !== lastSaved.current.body || 
                  citations.size !== lastSaved.current.citations.length || 
                  Array.from(citations).some(c => !lastSaved.current.citations.includes(c));

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (!isDirty) return;
      const target = e.target as HTMLElement;
      const anchor = target.closest('a');
      
      // If it's a real navigation link on our domain
      if (anchor && anchor.href && anchor.origin === window.location.origin) {
        if (!window.confirm("You have unsaved changes. Are you sure you want to leave?")) {
          e.preventDefault();
          e.stopPropagation();
        }
      }
    };
    document.addEventListener('click', handleClick, { capture: true });
    return () => document.removeEventListener('click', handleClick, { capture: true });
  }, [isDirty]);

  const updateReport = useUpdateReport({
    mutation: {
      onSuccess: (data) => {
        lastSaved.current = { title: data.title, body: data.body, citations: [...data.citations] };
        queryClient.setQueryData(getGetReportQueryKey(data.id), data);
        queryClient.invalidateQueries({ queryKey: getListReportsQueryKey(data.case_id), exact: false });
        toast.success("Report saved");
      },
      onError: () => toast.error("Failed to save report")
    }
  });

  const handleSave = () => {
    updateReport.mutate({
      reportId: report.id,
      data: {
        title,
        body,
        citations: Array.from(citations)
      }
    });
  };

  const handleBack = () => {
    if (isDirty) {
      if (!window.confirm("You have unsaved changes. Are you sure you want to leave?")) return;
    }
    onBack();
  };

  const handleToggleCitation = (evidenceId: string, checked: boolean) => {
    setCitations(prev => {
      const next = new Set(prev);
      if (checked) next.add(evidenceId);
      else next.delete(evidenceId);
      return next;
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={handleBack} className="text-muted-foreground -ml-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Reports
        </Button>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            {isDirty ? "Unsaved changes" : "Saved"}
          </span>
          <Button variant="outline" onClick={() => {
            if (isDirty) {
              toast.error("Please save the report before exporting.");
              return;
            }
            setIsExportOpen(true);
          }} disabled={!canExportReport}>
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
          <Button onClick={handleSave} disabled={!isDirty || updateReport.isPending || !canWriteReport}>
            <Save className="h-4 w-4 mr-2" />
            Save
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        <div className="xl:col-span-3 space-y-4">
          <Input 
            value={title} 
            onChange={e => setTitle(e.target.value)} 
            placeholder="Report Title"
            className="text-lg font-semibold h-12"
            disabled={!canWriteReport}
          />
          <Textarea 
            value={body} 
            onChange={e => setBody(e.target.value)} 
            placeholder="Write your analysis here... Use markdown for formatting."
            className="min-h-[600px] font-mono text-sm leading-relaxed resize-y"
            disabled={!canWriteReport}
          />
        </div>

        <div className="space-y-4 border rounded-lg bg-card p-4 h-fit max-h-[800px] flex flex-col">
          <h3 className="font-semibold text-sm border-b pb-2">Evidence Citations</h3>
          <p className="text-xs text-muted-foreground">
            Select evidence to cite in this report. Citations will be appended as traceable links.
          </p>
          <div className="overflow-y-auto flex-1 space-y-3 pt-2">
            {evidenceList?.map((ev: Evidence) => (
              <div key={ev.id} className="flex items-start space-x-2">
                <Checkbox 
                  id={`cite-${ev.id}`} 
                  checked={citations.has(ev.id)}
                  onCheckedChange={(checked) => handleToggleCitation(ev.id, !!checked)}
                  disabled={!canWriteReport}
                />
                <div className="grid gap-1.5 leading-none">
                  <label htmlFor={`cite-${ev.id}`} className="text-sm font-medium leading-none cursor-pointer">
                    {ev.type} - {ev.source || "Unknown Source"}
                  </label>
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {ev.content ? ev.content.slice(0, 100) : "No textual content"}
                  </p>
                </div>
              </div>
            ))}
            {!evidenceList?.length && (
              <p className="text-xs text-muted-foreground italic">No evidence collected yet.</p>
            )}
          </div>
        </div>
      </div>

      {isExportOpen && (
        <ReportExportModal 
          reportId={report.id} 
          open={isExportOpen} 
          onOpenChange={setIsExportOpen} 
        />
      )}
    </div>
  );
}
