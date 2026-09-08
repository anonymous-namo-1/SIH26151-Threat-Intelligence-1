import { useState, useRef, useEffect } from "react";
import { useGetScoringRules, useSaveScoringRules, useGetMe } from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Settings, Loader2, CheckCircle2 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function ScoringRulesEditor({ caseId }: { caseId: string }) {
  const { data: me } = useGetMe();
  const canEdit = me?.permissions?.includes("case:edit") ?? false;

  const { data: rules, isLoading, isError } = useGetScoringRules(caseId);
  const saveMutation = useSaveScoringRules();
  const saveFnRef = useRef(saveMutation.mutate);
  saveFnRef.current = saveMutation.mutate;

  const [open, setOpen] = useState(false);
  const [weights, setWeights] = useState<Record<string, number>>({});
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (rules?.weights && open) {
      setWeights(rules.weights);
      setSuccess(false);
    }
  }, [rules, open]);

  const handleSave = () => {
    saveFnRef.current({
      caseId,
      data: { weights }
    }, {
      onSuccess: () => {
        setSuccess(true);
        setTimeout(() => setOpen(false), 1000);
      }
    });
  };

  const updateWeight = (key: string, val: string) => {
    // allow typing intermediate values like "0." or empty string, fallback to 0 if invalid
    if (val === "") {
      setWeights(prev => ({ ...prev, [key]: 0 }));
      return;
    }
    const num = parseFloat(val);
    if (!isNaN(num)) {
      setWeights(prev => ({ ...prev, [key]: num }));
    }
  };

  if (!canEdit) return null;

  const hasWeights = Object.keys(weights).length > 0;
  const isSaveDisabled = saveMutation.isPending || !hasWeights;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Settings className="w-4 h-4 mr-2" />
          Scoring Rules
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Engine Scoring Rules</DialogTitle>
          <DialogDescription>
            Configure the point weights for confidence engine correlations. Set weight to 0 to disable a factor.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : isError ? (
          <div className="p-4 text-center text-destructive bg-destructive/10 rounded-md text-sm">
            Failed to load scoring rules.
          </div>
        ) : (
          <ScrollArea className="h-[400px] pr-4">
            <div className="space-y-4 pt-2">
              {rules?.model_version && (
                <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded-md mb-4 flex justify-between">
                  <span>Model Version:</span>
                  <span className="font-mono">{rules.model_version}</span>
                </div>
              )}
              {Object.entries(weights).map(([key, value]) => (
                <div key={key} className="grid grid-cols-3 items-center gap-4 border-b border-border pb-3">
                  <Label className="col-span-2 text-sm font-mono break-all">{key}</Label>
                  <Input
                    type="number"
                    step="0.1"
                    className="col-span-1 text-right font-mono"
                    value={value.toString()}
                    onChange={e => updateWeight(key, e.target.value)}
                  />
                </div>
              ))}
            </div>
          </ScrollArea>
        )}

        <DialogFooter className="items-center sm:justify-between">
          <div>
            {success && (
              <span className="text-emerald-500 text-sm flex items-center">
                <CheckCircle2 className="w-4 h-4 mr-1" /> Saved
              </span>
            )}
            {saveMutation.isError && (
              <span className="text-destructive text-sm">Failed to save rules</span>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={isSaveDisabled}>
              {saveMutation.isPending ? "Saving..." : "Save Rules"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
