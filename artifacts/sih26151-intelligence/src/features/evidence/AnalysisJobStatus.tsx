import { useEffect, useRef, useState } from 'react';
import { useListCaseJobs, useListPendingReviewJobs, JobStatus, type Job, getListCaseJobsQueryKey, getListPendingReviewJobsQueryKey, getListEntitiesQueryKey, getListEvidenceQueryKey, getListReportsQueryKey, getGetDashboardQueryKey, getListRelationshipsQueryKey, getGetCaseGraphQueryKey } from '@workspace/api-client-react';
import { useCaseWorkspace } from '@/hooks/use-case-workspace';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useQueryClient } from '@tanstack/react-query';
import { ReviewCandidates, type ReviewCandidate } from './ReviewCandidates';

function jobCandidates(job: Job): ReviewCandidate[] {
  const result = (job.result || {}) as Record<string, unknown>;
  return Array.isArray(result.candidates) ? result.candidates as ReviewCandidate[] : [];
}

function PendingReviewQueue({
  jobs,
  caseId,
  total,
  page,
  pageSize,
  onPageChange,
}: {
  jobs: Job[];
  caseId: string;
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}) {
  const pendingJobs = jobs
    .filter(job =>
      job.status === JobStatus.SUCCEEDED
      && ['extract', 'correlate'].includes(job.mode)
      && jobCandidates(job).some(candidate => !candidate.decision)
    )
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  const [selectedId, setSelectedId] = useState<string>();
  if (pendingJobs.length === 0) return null;
  const selected = pendingJobs.find(job => job.id === selectedId) || pendingJobs[0];
  return (
    <section className="max-w-2xl rounded-lg border bg-card p-3 space-y-3">
      <div>
        <h2 className="font-semibold">Pending analysis reviews</h2>
        <p className="text-xs text-muted-foreground">
          {pendingJobs.length} extraction or correlation {pendingJobs.length === 1 ? 'job requires' : 'jobs require'} review.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {pendingJobs.map(job => (
          <button
            key={job.id}
            type="button"
            className={`rounded-md border px-3 py-2 text-left text-xs ${job.id === selected.id ? 'border-primary bg-primary/5' : ''}`}
            onClick={() => setSelectedId(job.id)}
          >
            <span className="block font-medium capitalize">{job.mode}</span>
            <span className="text-muted-foreground">
              {jobCandidates(job).filter(candidate => !candidate.decision).length} pending · {new Date(job.created_at).toLocaleString()}
            </span>
          </button>
        ))}
      </div>
      <ReviewCandidates jobId={selected.id} caseId={caseId} candidates={jobCandidates(selected)} />
      {total > pageSize && (
        <div className="flex items-center justify-between border-t pt-3">
          <button
            type="button"
            className="text-xs text-primary disabled:text-muted-foreground"
            disabled={page === 0}
            onClick={() => onPageChange(Math.max(0, page - 1))}
          >
            Newer review jobs
          </button>
          <span className="text-xs text-muted-foreground">
            {page * pageSize + 1}–{Math.min(total, (page + 1) * pageSize)} of {total}
          </span>
          <button
            type="button"
            className="text-xs text-primary disabled:text-muted-foreground"
            disabled={(page + 1) * pageSize >= total}
            onClick={() => onPageChange(page + 1)}
          >
            Older review jobs
          </button>
        </div>
      )}
    </section>
  );
}

export function AnalysisJobStatus() {
  const { caseId } = useCaseWorkspace();
  const queryClient = useQueryClient();
  const [pendingPage, setPendingPage] = useState(0);
  const pendingPageSize = 25;
  const { data: jobs, error } = useListCaseJobs(caseId, { limit: 200 }, { query: { refetchInterval: 3000, queryKey: getListCaseJobsQueryKey(caseId, { limit: 200 }) } });

  const pendingParams = { limit: pendingPageSize, offset: pendingPage * pendingPageSize };
  const { data: pendingJobsData } = useListPendingReviewJobs(caseId, pendingParams, {
    query: {
      refetchInterval: 5000,
      queryKey: getListPendingReviewJobsQueryKey(caseId, pendingParams),
    },
  });

  useEffect(() => {
    if (pendingJobsData?.total) {
      const maxPage = Math.max(0, Math.ceil(pendingJobsData.total / pendingPageSize) - 1);
      if (pendingPage > maxPage) {
        setPendingPage(maxPage);
      }
    }
  }, [pendingJobsData?.total, pendingPage, pendingPageSize]);

  useEffect(() => {
    setPendingPage(0);
  }, [caseId]);

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
  const evidenceJobs = jobs?.filter(job => ['extract', 'correlate', 'summarize'].includes(job.mode)) || [];
  const latestJob = [...evidenceJobs].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
  const pendingReviewJobs = pendingJobsData?.items?.filter((job: Job) => job.case_id === caseId) || [];
  const pendingReviews = pendingReviewJobs.length > 0 ? (
    <PendingReviewQueue
      jobs={pendingReviewJobs}
      caseId={caseId}
      total={pendingJobsData?.total || pendingReviewJobs.length}
      page={pendingPage}
      pageSize={pendingPageSize}
      onPageChange={setPendingPage}
    />
  ) : null;

  if (evidenceJobs.length === 0) return pendingReviews;
  
  if (latestJob.status === JobStatus.QUEUED || latestJob.status === JobStatus.RUNNING || latestJob.status === JobStatus.RETRYING) {
    return (
      <div className="space-y-3">
        <Badge variant="secondary" className="flex items-center gap-1.5 font-mono bg-primary/10 text-primary border-primary/20">
          <Loader2 className="h-3 w-3 animate-spin" />
          {latestJob.mode} ({latestJob.status.toLowerCase()})
        </Badge>
        {pendingReviews}
      </div>
    );
  }

  if (latestJob.status === JobStatus.FAILED) {
    return (
      <div className="space-y-3">
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
        {pendingReviews}
      </div>
    );
  }

  const result = (latestJob.result || {}) as Record<string, unknown>;
  const summary = typeof result.summary === "string" ? result.summary : "";
  const citations = Array.isArray(result.evidence_ids) ? result.evidence_ids.map(String) : [];
  const uncertainties = Array.isArray(result.uncertainties) ? result.uncertainties.map(String) : [];
  const findings = Array.isArray(result.key_findings) ? result.key_findings as { text: string; evidence_ids: string[] }[] : [];
  const candidates = jobCandidates(latestJob);
  const pendingCount = candidates.filter(candidate => !candidate.decision).length;
  const count = typeof result.count === "number" ? result.count : candidates.length;
  const resultText = latestJob.mode === "summarize" ? `draft ready · ${citations.length} citations`
    : `${pendingCount} of ${count} candidates awaiting review`;

  return (
    <div className="space-y-3">
    <details className="max-w-full rounded-lg border bg-card p-3 text-sm">
      <summary className="cursor-pointer flex items-center gap-2"><CheckCircle2 className="h-3 w-3 text-green-500" /><span className="capitalize">{latestJob.mode}</span> · {resultText}</summary>
      <div className="mt-3 max-h-96 max-w-2xl overflow-y-auto space-y-3">
        <p className="text-muted-foreground">Automated output is a reviewable draft, not verified attribution.</p>
        {summary && <p className="whitespace-pre-wrap">{summary}</p>}
        {findings.map((finding, index) => <div key={index}><p>{finding.text}</p><div className="flex flex-wrap gap-2">{finding.evidence_ids.map((id) => <a className="text-primary underline text-xs" key={id} href={`/evidence?evidence=${id}`}>Evidence {id.slice(0, 8)}</a>)}</div></div>)}
        {uncertainties.length > 0 && <div><h3 className="font-semibold">Uncertainties</h3><ul className="list-disc pl-5">{uncertainties.map((text, index) => <li key={index}>{text}</li>)}</ul></div>}
        {citations.length > 0 && <div className="flex flex-wrap gap-2">{citations.map((id) => <a className="text-primary underline text-xs" key={id} href={`/evidence?evidence=${id}`}>Evidence {id.slice(0, 8)}</a>)}</div>}
        {candidates.length > 0 && pendingCount === 0 && <ReviewCandidates jobId={latestJob.id} caseId={caseId} candidates={candidates} />}
        {!summary && candidates.length === 0 && <p className="text-muted-foreground">No review candidates were produced.</p>}
      </div>
    </details>
    {pendingReviews}
    </div>
  );
}
