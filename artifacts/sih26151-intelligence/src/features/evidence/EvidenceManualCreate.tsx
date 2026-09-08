import { useState } from 'react';
import { useCreateEvidence, EvidenceType, Reliability } from '@workspace/api-client-react';
import { useCaseWorkspace } from '@/hooks/use-case-workspace';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { getListEvidenceQueryKey } from '@workspace/api-client-react';
import { Plus } from 'lucide-react';
import { usePermissions } from '@/hooks/use-permissions';

export function EvidenceManualCreate() {
  const { caseId } = useCaseWorkspace();
  const queryClient = useQueryClient();
  const { canWriteEvidence } = usePermissions();
  const [open, setOpen] = useState(false);
  
  const [type, setType] = useState<EvidenceType>(EvidenceType.TEXT);
  const [source, setSource] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [collectedAt, setCollectedAt] = useState("");
  const [content, setContent] = useState("");
  const [notes, setNotes] = useState("");
  const [reliability, setReliability] = useState<Reliability>(Reliability.UNKNOWN);

  const createEvidence = useCreateEvidence({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListEvidenceQueryKey(caseId) });
        toast.success("Evidence recorded");
        setOpen(false);
        reset();
      },
      onError: () => {
        toast.error("Failed to record evidence");
      }
    }
  });

  const reset = () => {
    setType(EvidenceType.TEXT);
    setSource("");
    setSourceUrl("");
    setCollectedAt("");
    setContent("");
    setNotes("");
    setReliability(Reliability.UNKNOWN);
  };

  const handleSave = () => {
    if (!source || !content) {
      toast.error("Source and Content are required.");
      return;
    }
    
    createEvidence.mutate({
      caseId,
      data: {
        type,
        source,
        source_url: sourceUrl || null,
        collected_at: collectedAt ? new Date(collectedAt).toISOString() : null,
        content,
        notes,
        reliability,
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        <Button size="sm" disabled={!canWriteEvidence}>
          <Plus className="h-4 w-4 mr-2" /> Add Text
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Manual Evidence Entry</DialogTitle>
          <DialogDescription>
            Record raw text, chat logs, or public source excerpts directly into the case workspace.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Source Name *</Label>
              <Input placeholder="e.g. Telegram log, Pastebin" value={source} onChange={e => setSource(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Evidence Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as EvidenceType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(EvidenceType).map(t => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Source URL (Optional)</Label>
              <Input placeholder="https://..." value={sourceUrl} onChange={e => setSourceUrl(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Collected Date (Optional)</Label>
              <Input type="datetime-local" value={collectedAt} onChange={e => setCollectedAt(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Raw Content *</Label>
            <Textarea 
              placeholder="Paste exact raw content here..." 
              value={content} 
              onChange={e => setContent(e.target.value)}
              className="min-h-[150px] font-mono text-xs"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Analyst Notes (Optional)</Label>
              <Textarea 
                placeholder="Context, translation..." 
                value={notes} 
                onChange={e => setNotes(e.target.value)}
                className="min-h-[80px]"
              />
            </div>
            <div className="space-y-2">
              <Label>Source Reliability</Label>
              <Select value={reliability} onValueChange={(v) => setReliability(v as Reliability)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(Reliability).map(r => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={createEvidence.isPending}>
            Record Evidence
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
