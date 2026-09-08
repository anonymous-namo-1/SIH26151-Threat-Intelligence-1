import { useState, useRef, useEffect } from "react";
import { useRunCaseModule, useListEntities } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Play } from "lucide-react";
import { ModuleResultView } from "../ModuleResultView";
import { useSavedModuleResult } from "../useSavedModuleResult";
import { ModuleName } from "@workspace/api-client-react";

export function TemporalModule({ caseId, moduleName = ModuleName.temporal }: { caseId: string, moduleName?: ModuleName }) {
  const { data: entities = [] } = useListEntities(caseId);
  const [entityId, setEntityId] = useState<string>("ALL");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  
  const mutation = useRunCaseModule();

  useEffect(() => {
    mutation.reset();
    setEntityId("ALL");
    setStart("");
    setEnd("");
  }, [caseId, moduleName]);

  const savedResult = useSavedModuleResult(caseId, moduleName);
  const mutationRef = useRef(mutation.mutate);
  mutationRef.current = mutation.mutate;

  const handleRun = () => {
    mutationRef.current({
      caseId,
      data: {
        module: moduleName,
        entity_id: entityId === "ALL" ? undefined : entityId,
        start: start ? new Date(start + "Z").toISOString() : undefined,
        end: end ? new Date(end + "Z").toISOString() : undefined
      }
    });
  };

  const isTimeline = moduleName === ModuleName.timeline;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            {isTimeline ? "Timeline Parameters" : "Temporal Parameters"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <Label>Target Entity (Optional)</Label>
              <Select value={entityId} onValueChange={setEntityId}>
                <SelectTrigger>
                  <SelectValue placeholder="All Case Entities" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Case Entities</SelectItem>
                  {entities.map(e => (
                    <SelectItem key={e.id} value={e.id}>{e.value}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>Start Range (UTC)</Label>
              <Input type="datetime-local" value={start} onChange={e => setStart(e.target.value)} />
            </div>
            
            <div className="space-y-2">
              <Label>End Range (UTC)</Label>
              <Input type="datetime-local" value={end} onChange={e => setEnd(e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleRun} disabled={mutation.isPending}>
          {mutation.isPending ? (
            <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Analyzing {isTimeline ? "Timeline" : "Temporal Data"}...</>
          ) : (
            <><Play className="w-4 h-4 mr-2" /> Run {isTimeline ? "Timeline" : "Temporal"} Analysis</>
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
