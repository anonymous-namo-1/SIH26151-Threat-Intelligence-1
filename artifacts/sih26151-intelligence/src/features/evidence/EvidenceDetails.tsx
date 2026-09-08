import { useState, useEffect, useRef } from 'react';
import { useUpdateEvidence, type Evidence, Reliability } from '@workspace/api-client-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FileText, Download, ExternalLink, ShieldCheck, Hash, User, Clock, Link as LinkIcon, Save } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { getListEvidenceQueryKey } from '@workspace/api-client-react';
import { Link } from 'wouter';
import { usePermissions } from '@/hooks/use-permissions';

export function EvidenceDetails({ evidence }: { evidence: Evidence }) {
  const queryClient = useQueryClient();
  const { canWriteEvidence, canExportReport } = usePermissions();
  const [isEditing, setIsEditing] = useState(false);
  
  const [notes, setNotes] = useState(evidence.notes || '');
  const [reliability, setReliability] = useState<Reliability>(evidence.reliability);
  
  const updateEvidence = useUpdateEvidence({
    mutation: {
      onSuccess: (data) => {
        queryClient.setQueryData(getListEvidenceQueryKey(data.case_id), (old: any) => {
          if (!old) return old;
          return old.map((e: Evidence) => e.id === data.id ? data : e);
        });
        toast.success("Evidence updated");
        setIsEditing(false);
      }
    }
  });

  useEffect(() => {
    setNotes(evidence.notes || '');
    setReliability(evidence.reliability);
    setIsEditing(false);
  }, [evidence.id]);

  const handleSave = () => {
    updateEvidence.mutate({
      evidenceId: evidence.id,
      data: {
        notes,
        reliability,
      }
    });
  };

  const downloadUrl = evidence.object_path ? `/api/argus/storage/evidence/${evidence.id}/download` : null;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-xl font-bold tracking-tight">{evidence.source}</h2>
          <div className="flex items-center gap-3 mt-2 text-sm text-muted-foreground">
            <Badge variant="outline" className="font-mono">{evidence.type}</Badge>
            <span className="flex items-center gap-1"><Clock className="h-3 w-3"/> {format(new Date(evidence.collected_at), 'yyyy-MM-dd HH:mm')}</span>
          </div>
        </div>
        <div className="flex gap-2">
          {downloadUrl && canExportReport && (
            <Button variant="outline" size="sm" asChild>
              <a href={downloadUrl} target="_blank" rel="noreferrer">
                <Download className="h-4 w-4 mr-2" />
                Original
              </a>
            </Button>
          )}
          {evidence.source_url && (
            <Button variant="outline" size="sm" asChild>
              <a href={evidence.source_url} target="_blank" rel="noreferrer">
                <ExternalLink className="h-4 w-4 mr-2" />
                Source URL
              </a>
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          <Card>
            <CardHeader className="py-3 px-4 bg-muted/30 border-b">
              <CardTitle className="text-sm flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground"/>
                Raw Content
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="p-4 font-mono text-xs overflow-auto max-h-[400px] whitespace-pre-wrap break-all bg-card text-card-foreground">
                {evidence.content || <span className="text-muted-foreground italic">No text content available.</span>}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-3 px-4 bg-muted/30 border-b flex flex-row items-center justify-between">
              <CardTitle className="text-sm">Analyst Notes & Reliability</CardTitle>
              {!isEditing ? (
                <Button variant="ghost" size="sm" className="h-8" onClick={() => setIsEditing(true)} disabled={!canWriteEvidence}>Edit</Button>
              ) : (
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" className="h-8" onClick={() => setIsEditing(false)}>Cancel</Button>
                  <Button size="sm" className="h-8" onClick={handleSave} disabled={updateEvidence.isPending}>
                    <Save className="h-3 w-3 mr-1" /> Save
                  </Button>
                </div>
              )}
            </CardHeader>
            <CardContent className="p-4 space-y-4">
              {isEditing ? (
                <>
                  <div className="space-y-1.5">
                    <Label>Reliability Rating</Label>
                    <Select value={reliability} onValueChange={(v) => setReliability(v as Reliability)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select rating" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.values(Reliability).map(r => (
                          <SelectItem key={r} value={r}>{r}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Notes</Label>
                    <Textarea 
                      value={notes} 
                      onChange={e => setNotes(e.target.value)} 
                      placeholder="Add analyst notes, context, or translations here..."
                      className="min-h-[100px]"
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2 text-sm">
                    <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                    <span className="font-semibold text-foreground">Reliability:</span>
                    <Badge variant="secondary">{evidence.reliability}</Badge>
                  </div>
                  <div className="text-sm whitespace-pre-wrap">
                    {evidence.notes || <span className="text-muted-foreground italic">No notes added.</span>}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader className="py-3 px-4 bg-muted/30 border-b">
              <CardTitle className="text-sm">Metadata</CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-4 text-sm">
              <div className="space-y-1">
                <span className="text-muted-foreground text-xs flex items-center gap-1"><Hash className="h-3 w-3"/> Content Hash</span>
                <p className="font-mono text-xs break-all bg-muted p-1.5 rounded">{evidence.content_hash}</p>
              </div>
              <div className="space-y-1">
                <span className="text-muted-foreground text-xs flex items-center gap-1"><User className="h-3 w-3"/> Collector ID</span>
                <p className="font-mono text-xs">{evidence.collector_id}</p>
              </div>
              <div className="space-y-1">
                <span className="text-muted-foreground text-xs flex items-center gap-1"><Clock className="h-3 w-3"/> System Ingestion</span>
                <p className="font-mono text-xs">{format(new Date(evidence.created_at), 'yyyy-MM-dd HH:mm:ss')}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-3 px-4 bg-muted/30 border-b">
              <CardTitle className="text-sm flex items-center gap-2">
                <LinkIcon className="h-4 w-4 text-muted-foreground" />
                Linked Entities ({evidence.entity_ids.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {evidence.entity_ids.length === 0 ? (
                <div className="p-4 text-xs text-muted-foreground italic">No entities explicitly linked.</div>
              ) : (
                <div className="divide-y max-h-[300px] overflow-y-auto">
                  {evidence.entity_ids.map(id => (
                    <Link key={id} href={`/entities/${id}`} className="block p-3 hover:bg-muted/50 transition-colors">
                      <div className="flex items-center gap-2">
                        <div className="h-6 w-6 rounded bg-primary/10 flex items-center justify-center">
                          <LinkIcon className="h-3 w-3 text-primary" />
                        </div>
                        <span className="text-sm font-mono truncate">{id}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
