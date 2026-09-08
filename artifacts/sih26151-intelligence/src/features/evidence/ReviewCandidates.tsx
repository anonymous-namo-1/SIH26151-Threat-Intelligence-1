import { useState } from 'react';
import {
  getGetCaseGraphQueryKey,
  getGetDashboardQueryKey,
  getListCaseJobsQueryKey,
  getListEntitiesQueryKey,
  getListEvidenceQueryKey,
  getListRelationshipsQueryKey,
  useReviewAnalysisJob,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

export type ReviewCandidate = {
  id: string;
  kind: 'entity' | 'relationship';
  type: string;
  value?: string;
  source_ref?: string;
  target_ref?: string;
  evidence_ids: string[];
  confidence: number;
  reason: string;
  decision?: 'accepted' | 'rejected';
  entity_id?: string;
  relationship_id?: string;
  reviewed_type?: string;
  reviewed_value?: string;
  reviewed_explanation?: string;
};

export function ReviewCandidates({
  jobId,
  caseId,
  candidates,
}: {
  jobId: string;
  caseId: string;
  candidates: ReviewCandidate[];
}) {
  const queryClient = useQueryClient();
  const [edits, setEdits] = useState<Record<string, { type: string; value: string; explanation: string }>>({});
  const [activeId, setActiveId] = useState<string>();
  const review = useReviewAnalysisJob({
    mutation: {
      onSuccess: () => {
        toast.success('Review decision saved');
        queryClient.invalidateQueries({ queryKey: getListCaseJobsQueryKey(caseId) });
        queryClient.invalidateQueries({ queryKey: getListEntitiesQueryKey(caseId) });
        queryClient.invalidateQueries({ queryKey: getListEvidenceQueryKey(caseId) });
        queryClient.invalidateQueries({ queryKey: getListRelationshipsQueryKey(caseId) });
        queryClient.invalidateQueries({ queryKey: getGetCaseGraphQueryKey(caseId) });
        queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
      },
      onError: (error) => toast.error(error instanceof Error ? error.message : 'Could not save review decision'),
      onSettled: () => setActiveId(undefined),
    },
  });

  const values = (candidate: ReviewCandidate) => edits[candidate.id] || {
    type: candidate.reviewed_type || candidate.type,
    value: candidate.reviewed_value || candidate.value || '',
    explanation: candidate.reviewed_explanation || candidate.reason,
  };
  const update = (candidate: ReviewCandidate, key: 'type' | 'value' | 'explanation', value: string) => {
    setEdits(current => ({ ...current, [candidate.id]: { ...values(candidate), [key]: value } }));
  };
  const decide = (candidate: ReviewCandidate, action: 'accept' | 'reject') => {
    const edited = values(candidate);
    setActiveId(candidate.id);
    review.mutate({
      jobId,
      data: {
        decisions: [{
          candidate_id: candidate.id,
          action,
          ...(action === 'accept' ? {
            type: edited.type,
            explanation: edited.explanation,
            ...(candidate.kind === 'entity' ? { value: edited.value } : {}),
          } : {}),
        }],
      },
    });
  };

  if (!candidates.length) return <p className="text-sm text-muted-foreground">No candidates were found.</p>;

  return (
    <div className="space-y-3">
      <div>
        <h3 className="font-semibold">Review candidates</h3>
        <p className="text-xs text-muted-foreground">
          Pattern matches and co-mentions are suggestions only. Accepting saves the reviewed record; rejecting does not alter evidence.
        </p>
      </div>
      {candidates.map(candidate => {
        const edited = values(candidate);
        const decided = Boolean(candidate.decision);
        return (
          <div key={candidate.id} className="rounded-md border p-3 space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant="outline">{candidate.kind}</Badge>
              {candidate.decision && (
                <Badge variant={candidate.decision === 'accepted' ? 'default' : 'secondary'}>
                  {candidate.decision}
                </Badge>
              )}
              <span className="text-xs text-muted-foreground">{Math.round(candidate.confidence * 100)}% pattern confidence</span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <Input
                aria-label="Candidate type"
                value={edited.type}
                disabled={decided}
                onChange={event => update(candidate, 'type', event.target.value)}
              />
              {candidate.kind === 'entity' ? (
                <Input
                  aria-label="Candidate value"
                  value={edited.value}
                  disabled={decided}
                  onChange={event => update(candidate, 'value', event.target.value)}
                />
              ) : (
                <p className="self-center font-mono text-xs">
                  {candidate.source_ref?.slice(0, 12)} → {candidate.target_ref?.slice(0, 12)}
                </p>
              )}
            </div>
            <Input
              aria-label={candidate.kind === 'relationship' ? 'Relationship explanation' : 'Candidate explanation'}
              value={edited.explanation}
              disabled={decided}
              onChange={event => update(candidate, 'explanation', event.target.value)}
            />
            <p className="text-xs text-muted-foreground">{candidate.reason}</p>
            <div className="flex flex-wrap gap-2">
              {candidate.evidence_ids.map(id => (
                <a key={id} href={`/evidence?evidence=${id}`} className="text-xs text-primary underline">
                  Evidence {id.slice(0, 8)}
                </a>
              ))}
            </div>
            {!decided && (
              <div className="flex gap-2">
                <Button size="sm" disabled={review.isPending} onClick={() => decide(candidate, 'accept')}>
                  {activeId === candidate.id && review.isPending ? 'Saving…' : 'Accept'}
                </Button>
                <Button size="sm" variant="outline" disabled={review.isPending} onClick={() => decide(candidate, 'reject')}>
                  Reject
                </Button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}