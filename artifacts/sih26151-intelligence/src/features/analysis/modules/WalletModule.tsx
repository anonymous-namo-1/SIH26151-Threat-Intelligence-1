import { useState, useRef, useEffect } from "react";
import { useRunCaseModule, useListEntities, EntityType } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Loader2, Play } from "lucide-react";
import { ModuleResultView } from "../ModuleResultView";
import { useSavedModuleResult } from "../useSavedModuleResult";
import { ModuleName } from "@workspace/api-client-react";

export function WalletModule({ caseId }: { caseId: string }) {
  const { data: entities = [] } = useListEntities(caseId);
  const cryptoEntities = entities.filter(e => e.type === EntityType.CRYPTO_WALLET);
  
  const [entityId, setEntityId] = useState("");
  
  const mutation = useRunCaseModule();

  useEffect(() => {
    mutation.reset();
    setEntityId("");
  }, [caseId]);

  const savedResult = useSavedModuleResult(caseId, ModuleName.wallet);
  const mutationRef = useRef(mutation.mutate);
  mutationRef.current = mutation.mutate;

  const handleRun = () => {
    mutationRef.current({
      caseId,
      data: {
        module: ModuleName.wallet,
        ...(entityId && entityId !== "none" && entityId !== "ALL" ? { entity_id: entityId } : {})
      }
    });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Target Wallet</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4">
            <Select value={entityId} onValueChange={setEntityId}>
              <SelectTrigger className="flex-1 font-mono">
                <SelectValue placeholder="Select a crypto wallet (optional)..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Wallets</SelectItem>
                {cryptoEntities.map(e => (
                  <SelectItem key={e.id} value={e.id}>{e.value}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={handleRun} disabled={mutation.isPending}>
              {mutation.isPending ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Analyzing...</>
              ) : (
                <><Play className="w-4 h-4 mr-2" /> Run Analysis</>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {(mutation.data || savedResult) && (
        <div key={mutation.data?.job_id || savedResult?.job_id || 'result'}>
          <ModuleResultView result={(mutation.data || savedResult)!} />
        </div>
      )}
    </div>
  );
}
