import { useState } from 'react';
import { useAnalyzeCase } from '@workspace/api-client-react';
import { useCaseWorkspace } from '@/hooks/use-case-workspace';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { getListCaseJobsQueryKey, getListEntitiesQueryKey, getListEvidenceQueryKey, getListReportsQueryKey } from '@workspace/api-client-react';
import { Brain, AlertTriangle, Sparkles } from 'lucide-react';
import { usePermissions } from '@/hooks/use-permissions';

export function AnalysisDialog() {
  const { caseId } = useCaseWorkspace();
  const queryClient = useQueryClient();
  const { canRunAnalysis } = usePermissions();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'summarize' | 'extract' | 'correlate'>('summarize');
  
  const analyzeCase = useAnalyzeCase({
    mutation: {
      onSuccess: () => {
        toast.success("Analysis job submitted. Poll jobs to check status.");
        queryClient.invalidateQueries({ queryKey: getListCaseJobsQueryKey(caseId) });
        queryClient.invalidateQueries({ queryKey: getListEntitiesQueryKey(caseId) });
        queryClient.invalidateQueries({ queryKey: getListEvidenceQueryKey(caseId) });
        queryClient.invalidateQueries({ queryKey: getListReportsQueryKey(caseId) });
        setOpen(false);
      },
      onError: () => toast.error("Failed to start analysis job")
    }
  });

  const handleStart = () => {
    analyzeCase.mutate({
      caseId,
      data: { mode }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="default" className="bg-primary hover:bg-primary/90" disabled={!canRunAnalysis}>
          <Brain className="h-4 w-4 mr-2" />
          Run AI Analysis
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            AI-Assisted Analysis
          </DialogTitle>
          <DialogDescription>
            Select an analysis mode to process the currently collected evidence in this case workspace.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="flex gap-2">
            <Button 
              variant={mode === 'summarize' ? 'default' : 'outline'} 
              className="flex-1" 
              onClick={() => setMode('summarize')}
            >
              Summarize
            </Button>
            <Button 
              variant={mode === 'extract' ? 'default' : 'outline'} 
              className="flex-1" 
              onClick={() => setMode('extract')}
            >
              Extract Entities
            </Button>
            <Button 
              variant={mode === 'correlate' ? 'default' : 'outline'} 
              className="flex-1" 
              onClick={() => setMode('correlate')}
            >
              Correlate
            </Button>
          </div>

          <div className="bg-muted/30 p-4 rounded-md border text-sm text-muted-foreground">
            {mode === 'summarize' && "Generates a cohesive summary draft in Reports based on all gathered textual evidence, with citations."}
            {mode === 'extract' && "Reads evidence text to propose observables for human review. Nothing is added to the Case Graph until accepted."}
            {mode === 'correlate' && "Proposes evidence-backed relationships for human review. Nothing is added to the Case Graph until accepted."}
          </div>

          {mode === 'summarize' && (
            <Alert variant="destructive" className="bg-destructive/5 text-destructive border-destructive/20">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Explicit Disclosure</AlertTitle>
              <AlertDescription className="text-xs mt-2">
                Running this job sends selected case evidence to an external AI service. 
                The AI does <strong>not</strong> make determinations of guilt or draw legal conclusions.
                All output must be reviewed, verified, and signed off by a human investigator.
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleStart} disabled={analyzeCase.isPending}>
            {analyzeCase.isPending ? "Starting..." : "Acknowledge & Start"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
