import { useState, useRef, useEffect } from "react";
import { useRunCaseModule } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Loader2, Play, AlertTriangle } from "lucide-react";
import { ModuleResultView } from "../ModuleResultView";
import { useSavedModuleResult } from "../useSavedModuleResult";
import { ModuleName } from "@workspace/api-client-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function StylometryModule({ caseId }: { caseId: string }) {
  const [corpusLeft, setCorpusLeft] = useState("");
  const [corpusRight, setCorpusRight] = useState("");
  
  const mutation = useRunCaseModule();
  
  useEffect(() => {
    mutation.reset();
    setCorpusLeft("");
    setCorpusRight("");
  }, [caseId]);

  const savedResult = useSavedModuleResult(caseId, ModuleName.stylometry);
  const mutationRef = useRef(mutation.mutate);
  mutationRef.current = mutation.mutate;

  const handleRun = () => {
    mutationRef.current({
      caseId,
      data: {
        module: ModuleName.stylometry,
        corpus_left: corpusLeft,
        corpus_right: corpusRight
      }
    });
  };

  const lCount = corpusLeft.trim() ? corpusLeft.trim().split(/\s+/).length : 0;
  const rCount = corpusRight.trim() ? corpusRight.trim().split(/\s+/).length : 0;
  const sampleSizeWarning = (lCount < 500 && lCount > 0) || (rCount < 500 && rCount > 0);

  return (
    <div className="space-y-6">
      {sampleSizeWarning && (
        <Alert className="bg-warning/10 text-warning border-warning/20">
          <AlertTriangle className="h-4 w-4 text-warning" />
          <AlertDescription>
            Stylometry requires significant text samples (500+ words recommended per corpus) to detect reliable patterns. Do not use stylometry as definitive proof of identity. (Current: A={lCount} words, B={rCount} words)
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Corpus A</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea 
              className="min-h-[250px] font-mono text-xs" 
              placeholder="Paste text sample from Author A..."
              value={corpusLeft}
              onChange={e => setCorpusLeft(e.target.value)}
            />
            <div className="mt-2 text-xs text-muted-foreground text-right">
              {lCount} words ({corpusLeft.length} characters)
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Corpus B</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea 
              className="min-h-[250px] font-mono text-xs" 
              placeholder="Paste text sample from Author B..."
              value={corpusRight}
              onChange={e => setCorpusRight(e.target.value)}
            />
            <div className="mt-2 text-xs text-muted-foreground text-right">
              {rCount} words ({corpusRight.length} characters)
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center justify-between">
        <div className="text-xs text-warning">
          {sampleSizeWarning && lCount > 0 && rCount > 0 && 
            "Sample size is very small. Results will have low reliability."}
        </div>
        <Button 
          onClick={handleRun} 
          disabled={!corpusLeft || !corpusRight || mutation.isPending}
        >
          {mutation.isPending ? (
            <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Running...</>
          ) : (
            <><Play className="w-4 h-4 mr-2" /> Run Analysis</>
          )}
        </Button>
      </div>

      {(mutation.data || savedResult) && (
        <div key={mutation.data?.job_id || savedResult?.job_id || 'result'}>
          <ModuleResultView result={(mutation.data || savedResult)!} />
        </div>
      )}
    </div>
  );
}
