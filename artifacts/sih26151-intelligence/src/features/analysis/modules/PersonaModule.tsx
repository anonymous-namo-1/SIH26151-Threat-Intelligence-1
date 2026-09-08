import { useState, useRef } from "react";
import { useRunCaseModule, useListEntities, EntityType } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Play } from "lucide-react";
import { ModuleResultView } from "../ModuleResultView";
import { useSavedModuleResult } from "../useSavedModuleResult";
import { ModuleName } from "@workspace/api-client-react";

export function PersonaModule({ caseId }: { caseId: string }) {
  const { data: entities = [] } = useListEntities(caseId);
  const [leftId, setLeftId] = useState("");
  const [rightId, setRightId] = useState("");
  
  const targetTypes = [EntityType.PERSONA, EntityType.USERNAME, EntityType.ACTOR_HYPOTHESIS];
  const personaEntities = entities.filter(e => targetTypes.includes(e.type as any));
  
  const mutation = useRunCaseModule();
  const savedResult = useSavedModuleResult(caseId, ModuleName.persona);
  const mutationRef = useRef(mutation.mutate);
  mutationRef.current = mutation.mutate;

  const handleRun = () => {
    mutationRef.current({
      caseId,
      data: {
        module: ModuleName.persona,
        left_id: leftId,
        right_id: rightId
      }
    });
  };

  return (
    <div className="space-y-6">
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

      <div className="flex justify-end">
        <Button 
          onClick={handleRun} 
          disabled={!leftId || !rightId || leftId === rightId || mutation.isPending}
        >
          {mutation.isPending ? (
            <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Running...</>
          ) : (
            <><Play className="w-4 h-4 mr-2" /> Run Analysis</>
          )}
        </Button>
      </div>

      {(mutation.data || savedResult) && <ModuleResultView result={(mutation.data || savedResult)!} />}
    </div>
  );
}
