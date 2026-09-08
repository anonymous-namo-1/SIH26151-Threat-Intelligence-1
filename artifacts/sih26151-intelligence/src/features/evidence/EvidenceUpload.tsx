import { useEffect, useState, useRef } from 'react';
import { useCaseWorkspace } from '@/hooks/use-case-workspace';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { getListCaseJobsQueryKey, getListEvidenceQueryKey, Reliability, useAnalyzeCase } from '@workspace/api-client-react';
import { Upload, X } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { usePermissions } from '@/hooks/use-permissions';

const ALLOWED_TYPES = ['text/plain', 'text/markdown', 'text/csv', 'application/json', 'application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
const MAX_SIZE = 5 * 1024 * 1024; // 5 MiB

export function EvidenceUpload() {
  const { caseId } = useCaseWorkspace();
  const queryClient = useQueryClient();
  const { canWriteEvidence } = usePermissions();
  const analyzeCase = useAnalyzeCase();
  const [open, setOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [file, setFile] = useState<File | null>(null);
  const [source, setSource] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [collectedAt, setCollectedAt] = useState("");
  const [notes, setNotes] = useState("");
  const [reliability, setReliability] = useState<Reliability>(Reliability.UNKNOWN);
  
  const [ticket, setTicket] = useState<{ id: string, url: string } | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState('');
  const [finalized, setFinalized] = useState(false);
  const [finalizedEvidenceId, setFinalizedEvidenceId] = useState<string>();
  const activeCaseIdRef = useRef(caseId);

  const reset = () => {
    setFile(null);
    setSource("");
    setSourceUrl("");
    setCollectedAt("");
    setNotes("");
    setReliability(Reliability.UNKNOWN);
    setTicket(null);
    setIsUploading(false);
    setProgress(0);
    setStage('');
    setFinalized(false);
    setFinalizedEvidenceId(undefined);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  useEffect(() => {
    activeCaseIdRef.current = caseId;
    reset();
    setOpen(false);
  // reset intentionally runs only when the workspace changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId]);

  const selectFile = (f: File) => {
      if (f.size > MAX_SIZE) {
        toast.error(`File is too large (max 5MiB).`);
        return false;
      }
      if (!/\.(txt|md|csv|json|pdf|docx)$/i.test(f.name)) {
        toast.error("Choose a TXT, MD, CSV, JSON, PDF or DOCX file.");
        return false;
      }
      setFile(f);
      if (!source) setSource(f.name);
      setTicket(null); // Reset ticket on new file
      setFinalized(false);
      return true;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      if (!selectFile(e.target.files[0])) e.target.value = '';
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    if (!source) {
      toast.error("Source name is required");
      return;
    }

    const operationCaseId = caseId;
    setIsUploading(true);
    setProgress(10);
    
    try {
      if (finalized) {
        if (!finalizedEvidenceId) throw new Error("Finalized evidence identifier is unavailable");
        setStage('Queuing indicator extraction for human review...');
        await analyzeCase.mutateAsync({
          caseId: operationCaseId,
          data: { mode: 'extract', evidence_ids: [finalizedEvidenceId] },
        });
        queryClient.invalidateQueries({ queryKey: getListCaseJobsQueryKey(operationCaseId) });
        if (activeCaseIdRef.current !== operationCaseId) return;
        toast.success("Extraction queued. Review candidates when processing finishes.");
        reset();
        setOpen(false);
        return;
      }
      let upload_url = ticket?.url;
      let upload_id = ticket?.id;

      if (!ticket) {
        setStage('Requesting upload ticket...');
        const ticketRes = await fetch('/api/argus/storage/upload-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            case_id: operationCaseId,
            name: file.name,
            size: file.size,
            content_type: file.type
          })
        });
        
        if (!ticketRes.ok) throw new Error("Failed to get upload URL");
        const data = await ticketRes.json();
        upload_url = data.upload_url;
        upload_id = data.upload_id;
        
        if (activeCaseIdRef.current === operationCaseId) {
          setTicket({ id: upload_id!, url: upload_url! });
        }
      }
      
      if (activeCaseIdRef.current === operationCaseId) {
        setProgress(40);
        setStage('Uploading file contents...');
      }

      const putRes = await fetch(upload_url!, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file
      });
      
      if (!putRes.ok) throw new Error("Failed to upload file bytes");
      
      if (activeCaseIdRef.current === operationCaseId) {
        setProgress(80);
        setStage('Finalizing evidence record...');
      }

      const finalizeRes = await fetch('/api/argus/storage/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          upload_id,
          source,
          reliability,
          notes: notes || undefined,
          source_url: sourceUrl || undefined,
          collected_at: collectedAt ? new Date(collectedAt).toISOString() : undefined,
        })
      });

      if (!finalizeRes.ok) throw new Error("Failed to finalize upload");
      const finalizedEvidence = await finalizeRes.json() as { id?: string };
      if (!finalizedEvidence.id) throw new Error("Finalized evidence response did not include an identifier");
      if (activeCaseIdRef.current === operationCaseId) {
        setFinalized(true);
        setFinalizedEvidenceId(finalizedEvidence.id);
      }

      if (activeCaseIdRef.current === operationCaseId) {
        setProgress(90);
        setStage('Evidence preserved with its content hash. Queuing extraction suggestions...');
      }
      queryClient.invalidateQueries({ queryKey: getListEvidenceQueryKey(operationCaseId) });
      try {
        await analyzeCase.mutateAsync({
          caseId: operationCaseId,
          data: { mode: 'extract', evidence_ids: [finalizedEvidence.id] },
        });
        queryClient.invalidateQueries({ queryKey: getListCaseJobsQueryKey(operationCaseId) });
        if (activeCaseIdRef.current !== operationCaseId) return;
        setProgress(100);
        setStage('Evidence saved; extraction queued for human review.');
        toast.success("Evidence saved and extraction queued");
        setTimeout(() => {
          reset();
          setOpen(false);
        }, 500);
      } catch {
        throw new Error("Evidence was saved, but extraction could not be queued. Retry to queue extraction; the file will not be uploaded again.");
      }
    } catch (err: any) {
      if (activeCaseIdRef.current !== operationCaseId) return;
      toast.error(err.message || "Upload sequence failed");
      setIsUploading(false);
      // Keep the upload/finalization state so retry resumes at the failed stage.
      setProgress(0);
      setStage('Failed. Click upload to retry.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!isUploading) { setOpen(v); if (!v) reset(); } }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="secondary" disabled={!canWriteEvidence}>
          <Upload className="h-4 w-4 mr-2" /> Upload File
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Secure File Upload</DialogTitle>
          <DialogDescription>
            Upload documents and logs (TXT, MD, CSV, JSON, PDF, DOCX, max 5MiB). Binaries and scripts are rejected.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {!file ? (
            <div
              className="border-2 border-dashed rounded-lg p-10 text-center hover:bg-muted/50 transition-colors cursor-pointer"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={event => event.preventDefault()}
              onDrop={event => {
                event.preventDefault();
                const dropped = event.dataTransfer.files[0];
                if (dropped) selectFile(dropped);
              }}
            >
              <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm font-medium">Drop a file here or click to select</p>
              <p className="text-xs text-muted-foreground mt-1">Limits: 5MiB, text/documents only</p>
              <input 
                ref={fileInputRef} 
                type="file" 
                className="hidden" 
                onChange={handleFileChange} 
                accept=".txt,.md,.csv,.json,.pdf,.docx,text/plain,text/markdown,text/csv,application/json,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" 
              />
            </div>
          ) : (
            <div className="p-3 border rounded-md flex justify-between items-center bg-muted/20">
              <div className="flex flex-col">
                <span className="text-sm font-semibold truncate max-w-[300px]">{file.name}</span>
                <span className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB • {file.type}</span>
              </div>
              {!isUploading && (
                <Button variant="ghost" size="icon" onClick={() => { setFile(null); setTicket(null); }}><X className="h-4 w-4" /></Button>
              )}
            </div>
          )}

          {file && (
            <>
              <div className="space-y-2">
                <Label>Source Name *</Label>
                <Input value={source} onChange={e => setSource(e.target.value)} disabled={isUploading} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Source URL (Optional)</Label>
                  <Input value={sourceUrl} onChange={e => setSourceUrl(e.target.value)} disabled={isUploading} placeholder="https://..." />
                </div>
                <div className="space-y-2">
                  <Label>Collected Date (Optional)</Label>
                  <Input type="datetime-local" value={collectedAt} onChange={e => setCollectedAt(e.target.value)} disabled={isUploading} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2 col-span-2">
                  <Label>Reliability</Label>
                  <Select value={reliability} onValueChange={(v) => setReliability(v as Reliability)} disabled={isUploading}>
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
              <div className="space-y-2">
                <Label>Analyst Notes (Optional)</Label>
                <Input value={notes} onChange={e => setNotes(e.target.value)} disabled={isUploading} placeholder="Context or findings..." />
              </div>
            </>
          )}

          {isUploading && (
            <div className="space-y-2 pt-2">
              <div className="flex justify-between text-xs">
                <span>{stage}</span>
                <span>{progress}%</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>
          )}
          {!isUploading && stage && (
             <div className="text-xs text-destructive">{stage}</div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isUploading}>Cancel</Button>
          <Button onClick={handleUpload} disabled={!file || isUploading}>
            {finalized ? (isUploading ? "Queuing..." : "Retry Extraction") : ticket ? (isUploading ? "Retrying..." : "Retry Upload") : (isUploading ? "Uploading..." : "Upload & Analyze")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
