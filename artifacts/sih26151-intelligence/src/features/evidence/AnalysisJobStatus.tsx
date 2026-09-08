import { useEffect, useRef } from 'react';
import { useListCaseJobs, JobStatus, getListCaseJobsQueryKey, getListEntitiesQueryKey, getListEvidenceQueryKey, getListReportsQueryKey, getGetDashboardQueryKey, getListRelationshipsQueryKey, getGetCaseGraphQueryKey } from '@workspace/api-client-react';
import { useCaseWorkspace } from '@/hooks/use-case-workspace';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useQueryClient } from '@tanstack/react-query';

export function AnalysisJobStatus() {
  const { caseId } = useCaseWorkspace();
  const queryClient = useQueryClient();
  const { data: jobs, error } = useListCaseJobs(caseId, { query: { refetchInterval: 3000, queryKey: getListCaseJobsQueryKey(caseId) } });

  const prevJobStatus = useRef<Record<string, JobStatus>>({});

  useEffect(() => {
    if (!jobs) return;

    let shouldInvalidate = false;
    jobs.forEach(job => {
      const prev = prevJobStatus.current[job.id];
      if (prev !== JobStatus.SUCCEEDED && job.status === JobStatus.SUCCEEDED) {
        shouldInvalidate = true;
      }
      prevJobStatus.current[job.id] = job.status;
    });

    if (shouldInvalidate) {
      queryClient.invalidateQueries({ queryKey: getListEntitiesQueryKey(caseId) });
      queryClient.invalidateQueries({ queryKey: getListEvidenceQueryKey(caseId) });
      queryClient.invalidateQueries({ queryKey: getListReportsQueryKey(caseId) });
      queryClient.invalidateQueries({ queryKey: getListRelationshipsQueryKey(caseId) });
      queryClient.invalidateQueries({ queryKey: getGetCaseGraphQueryKey(caseId) });
      queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
    }
  }, [jobs, caseId, queryClient]);

  if (error) return <p role="alert" className="text-sm text-destructive">Job status unavailable. Retrying…</p>;
  if (!jobs || jobs.length === 0) return null;

  const latestJob = [...jobs].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
  
  if (latestJob.status === JobStatus.QUEUED || latestJob.status === JobStatus.RUNNING || latestJob.status === JobStatus.RETRYING) {
    return (
      <Badge variant="secondary" className="flex items-center gap-1.5 font-mono bg-primary/10 text-primary border-primary/20">
        <Loader2 className="h-3 w-3 animate-spin" />
        {latestJob.mode} ({latestJob.status.toLowerCase()})
      </Badge>
    );
  }

  if (latestJob.status === JobStatus.FAILED) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="destructive" className="flex items-center gap-1.5 font-mono cursor-help">
            <XCircle className="h-3 w-3" />
            {latestJob.mode} failed
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
          {latestJob.error || "Unknown error"}
        </TooltipContent>
      </Tooltip>
    );
  }

  const result = (latestJob.result || {}) as Record<string, unknown>;
  const summary = typeof result.summary === "string" ? result.summary : "";
  const citations = Array.isArray(result.evidence_ids) ? result.evidence_ids.map(String) : [];
  const uncertainties = Array.isArray(result.uncertainties) ? result.uncertainties.map(String) : [];
  const findings = Array.isArray(result.key_findings) ? result.key_findings as { text: string; evidence_ids: string[] }[] : [];
  const count = typeof result.count === "number" ? result.count : 0;
  const resultText = latestJob.mode === "summarize" ? `draft ready · ${citations.length} citations`
    : latestJob.mode === "extract" ? `${count} new entities` : `${count} new links`;

  return (
    <details className="max-w-full rounded-lg border bg-card p-3 text-sm">
      <summary className="cursor-pointer flex items-center gap-2"><CheckCircle2 className="h-3 w-3 text-green-500" /><span className="capitalize">{latestJob.mode}</span> · {resultText}</summary>
      <div className="mt-3 max-h-96 max-w-2xl overflow-y-auto space-y-3">
        <p className="text-muted-foreground">Automated output is a reviewable draft, not verified attribution.</p>
        {summary && <p className="whitespace-pre-wrap">{summary}</p>}
        {findings.map((finding, index) => <div key={index}><p>{finding.text}</p><div className="flex flex-wrap gap-2">{finding.evidence_ids.map((id) => <a className="text-primary underline text-xs" key={id} href={`/evidence?evidence=${id}`}>Evidence {id.slice(0, 8)}</a>)}</div></div>)}
        {uncertainties.length > 0 && <div><h3 className="font-semibold">Uncertainties</h3><ul className="list-disc pl-5">{uncertainties.map((text, index) => <li key={index}>{text}</li>)}</ul></div>}
        {citations.length > 0 && <div className="flex flex-wrap gap-2">{citations.map((id) => <a className="text-primary underline text-xs" key={id} href={`/evidence?evidence=${id}`}>Evidence {id.slice(0, 8)}</a>)}</div>}
        {!summary && <a className="text-primary underline" href="/graph">Review entities and relationships</a>}
      </div>
    </details>
  );
}
