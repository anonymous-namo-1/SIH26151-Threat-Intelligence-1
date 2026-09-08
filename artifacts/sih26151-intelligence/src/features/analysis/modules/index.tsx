import { useState, useRef, useEffect } from "react";
import { useRunCaseModule, useListEntities, ModuleName } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Loader2, Play } from "lucide-react";
import { ModuleResultView } from "../ModuleResultView";
import { useSavedModuleResult } from "../useSavedModuleResult";

export function GenericModule({ caseId, moduleName, description, requiresEntity = false }: { caseId: string, moduleName: ModuleName, description: string, requiresEntity?: boolean }) {
  const { data: entities = [] } = useListEntities(caseId);
  const savedResult = useSavedModuleResult(caseId, moduleName);
  const [entityId, setEntityId] = useState("");
  
  const mutation = useRunCaseModule();
  
  useEffect(() => {
    mutation.reset();
    setEntityId("");
  }, [caseId, moduleName]);

  const mutationRef = useRef(mutation.mutate);
  mutationRef.current = mutation.mutate;

  const handleRun = () => {
    mutationRef.current({
      caseId,
      data: {
        module: moduleName,
        ...(entityId && entityId !== "ALL" ? { entity_id: entityId } : {})
      }
    });
  };

  const activeResult = mutation.data || savedResult;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Parameters</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4">
            <Select value={entityId} onValueChange={setEntityId}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder={requiresEntity ? "Select a target entity..." : "All Case Entities (Optional filter)"} />
              </SelectTrigger>
              <SelectContent>
                {!requiresEntity && <SelectItem value="ALL">Whole Case Context</SelectItem>}
                {entities.map(e => (
                  <SelectItem key={e.id} value={e.id}>{e.value}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={handleRun} disabled={(requiresEntity && !entityId) || mutation.isPending}>
              {mutation.isPending ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Analyzing...</>
              ) : (
                <><Play className="w-4 h-4 mr-2" /> Run Analysis</>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {activeResult && (
        <div key={activeResult.job_id || 'result'}>
          <ModuleResultView result={activeResult} />
        </div>
      )}
    </div>
  );
}

export function InfrastructureModule({ caseId }: { caseId: string }) {
  return <GenericModule caseId={caseId} moduleName={ModuleName.infrastructure} description="Correlate domains, IPs, certificates, and hosting reuse." />;
}
export function AliasModule({ caseId }: { caseId: string }) {
  return <GenericModule caseId={caseId} moduleName={ModuleName.alias} description="Evaluate alias generation rules and shared screen-names." />;
}
export function RelationshipModule({ caseId }: { caseId: string }) {
  return <GenericModule caseId={caseId} moduleName={ModuleName.relationship} description="Calculate confidence of inferred entity relationships." />;
}
export function ReliabilityModule({ caseId }: { caseId: string }) {
  return <GenericModule caseId={caseId} moduleName={ModuleName.reliability} description="Assess the structural reliability of the evidence graph." />;
}
export function ContradictionModule({ caseId }: { caseId: string }) {
  return <GenericModule caseId={caseId} moduleName={ModuleName.contradiction} description="Identify conflicting facts, timelines, or locations." />;
}
import { TemporalModule } from "./TemporalModule";
export function TimelineModule({ caseId }: { caseId: string }) {
  return <TemporalModule caseId={caseId} moduleName={ModuleName.timeline} />;
}
