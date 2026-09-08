import { useState } from "react";
import { useCaseWorkspace, CaseScope } from "@/hooks/use-case-workspace";
import { useListEntities, useCompareEntities, getCompareEntitiesQueryKey, EntityType } from "@workspace/api-client-react";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { AlertCircle, Scale, ShieldAlert, ArrowRight, RefreshCcw, Activity } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

function PersonasContent() {
  const { caseId } = useCaseWorkspace();
  const { data: entities = [], isLoading: entitiesLoading } = useListEntities(caseId);
  const [leftId, setLeftId] = useState<string>("");
  const [rightId, setRightId] = useState<string>("");

  const targetTypes = [EntityType.PERSONA, EntityType.USERNAME, EntityType.ACTOR_HYPOTHESIS];
  const personaEntities = entities.filter(e => targetTypes.includes(e.type as any));

  const shouldCompare = leftId !== "" && rightId !== "" && leftId !== rightId;

  const { data: comparison, isLoading: isComparing, error: compareError, refetch: refetchCompare } = useCompareEntities(
    caseId, 
    { left: leftId, right: rightId },
    { query: { enabled: shouldCompare, staleTime: 60_000, queryKey: getCompareEntitiesQueryKey(caseId, { left: leftId, right: rightId }) } }
  );

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Identity & Persona Analysis</h1>
          <p className="text-muted-foreground mt-1">
            Evaluate hypotheses connecting actors, usernames, and distinct personas.
          </p>
        </div>
        <Button variant="secondary" asChild>
          <Link href={`/analysis?module=persona`}>
            <Activity className="h-4 w-4 mr-2" /> Run Analysis
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Entity A</CardTitle>
          </CardHeader>
          <CardContent>
            <Select value={leftId} onValueChange={setLeftId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a persona..." />
              </SelectTrigger>
              <SelectContent>
                {personaEntities.map(e => (
                  <SelectItem key={e.id} value={e.id}>
                    <div className="flex items-center space-x-2">
                      <Badge variant="outline" className="text-[10px] uppercase font-mono">{e.type}</Badge>
                      <span className="font-medium">{e.value}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Entity B</CardTitle>
          </CardHeader>
          <CardContent>
            <Select value={rightId} onValueChange={setRightId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a persona to compare..." />
              </SelectTrigger>
              <SelectContent>
                {personaEntities.filter(e => e.id !== leftId).map(e => (
                  <SelectItem key={e.id} value={e.id}>
                    <div className="flex items-center space-x-2">
                      <Badge variant="outline" className="text-[10px] uppercase font-mono">{e.type}</Badge>
                      <span className="font-medium">{e.value}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
      </div>

      {leftId === rightId && leftId !== "" && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Invalid Comparison</AlertTitle>
          <AlertDescription>Cannot compare an entity with itself.</AlertDescription>
        </Alert>
      )}

      {shouldCompare && isComparing && (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center text-muted-foreground space-y-4">
            <Scale className="h-8 w-8 mx-auto animate-pulse" />
            <p>Analyzing factors and generating comparative hypothesis...</p>
          </CardContent>
        </Card>
      )}

      {shouldCompare && compareError && !isComparing && (
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Analysis Failed</AlertTitle>
          <AlertDescription className="space-y-3">
            <p>Could not complete the identity comparison based on available evidence.</p>
            <Button variant="outline" size="sm" onClick={() => refetchCompare()} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              <RefreshCcw className="mr-2 h-4 w-4" />
              Retry Analysis
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {shouldCompare && comparison && !isComparing && !compareError && (
        <div className="space-y-6">
          <Card className="bg-primary/5 border-primary/20">
            <CardContent className="pt-6">
              <div className="flex flex-col md:flex-row gap-8 items-start">
                <div className="flex-1 space-y-4">
                  <div className="space-y-1">
                    <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Analyst Hypothesis</h3>
                    <p className="text-lg font-medium leading-relaxed">{comparison.hypothesis}</p>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 pt-2 border-t border-primary/10">
                    <div>
                      <span className="text-xs text-muted-foreground uppercase tracking-wider block mb-1">Similarity Score</span>
                      <div className="flex items-end gap-2">
                        <span className="text-3xl font-mono font-bold text-primary">{(comparison.similarity * 100).toFixed(1)}</span>
                        <span className="text-sm text-muted-foreground font-mono pb-1">/ 100</span>
                      </div>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground uppercase tracking-wider block mb-1">Uncertainty Metric</span>
                      <div className="flex items-end gap-2">
                        <span className="text-3xl font-mono font-bold text-warning">{(comparison.uncertainty * 100).toFixed(1)}</span>
                        <span className="text-sm text-muted-foreground font-mono pb-1">/ 100</span>
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground italic">Note: Score represents structural overlap based on available evidence, not statistical probability. Missing information is treated as Unknown, not a definitive non-match.</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Factor Evaluation</CardTitle>
              <CardDescription>Evidentiary basis for similarities, contradictions, and unknown overlaps.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[400px]">
                {comparison.factors.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground text-sm">
                    No overlapping factors found to evaluate.
                  </div>
                ) : (
                  <div className="divide-y">
                    {comparison.factors.map((factor, idx) => {
                      const isUnknown = (factor as any).score === undefined || (factor as any).score === null;
                      const scoreValue = isUnknown ? 0 : factor.score;
                      
                      return (
                      <div key={idx} className={`p-4 hover:bg-muted/50 transition-colors ${isUnknown ? 'opacity-80' : ''}`}>
                        <div className="flex justify-between items-start mb-2">
                          <h4 className="font-medium flex items-center gap-2">
                            {factor.factor}
                            {!isUnknown && scoreValue < 0.3 && <Badge variant="outline" className="text-destructive border-destructive bg-destructive/10">Contradictory</Badge>}
                            {!isUnknown && scoreValue >= 0.7 && <Badge variant="outline" className="text-emerald-600 border-emerald-600/30 bg-emerald-600/10">Strong Signal</Badge>}
                            {isUnknown && <Badge variant="outline" className="text-muted-foreground border-muted-foreground/30 bg-muted/50">Unknown</Badge>}
                          </h4>
                          <span className="font-mono text-sm">
                            {isUnknown ? 'Unknown' : scoreValue.toFixed(2)}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground mb-3">{factor.explanation}</p>
                        {factor.evidence_ids.length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {factor.evidence_ids.map(eid => (
                              <Button key={eid} variant="secondary" size="sm" className="h-6 text-xs" asChild>
                                <Link href={`/evidence/${eid}`}>
                                  Ref: {eid.substring(0, 8)}
                                  <ArrowRight className="w-3 h-3 ml-1 opacity-50" />
                                </Link>
                              </Button>
                            ))}
                          </div>
                        )}
                      </div>
                    )})}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

export function Personas() {
  return (
    <CaseScope>
      <PersonasContent />
    </CaseScope>
  );
}
