import { useState } from 'react';
import { Entity, Relationship, useDeleteRelationship, useUpdateRelationship, getGetCaseGraphQueryKey, useGetMe, useListEvidence, getListEvidenceQueryKey } from '@workspace/api-client-react';
import { useCaseWorkspace } from '@/hooks/use-case-workspace';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { X, ExternalLink, Clock, AlertTriangle, Link as LinkIcon, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Link } from 'wouter';
import { cn } from '@/lib/utils';

export function GraphInspector({ 
  entity, 
  relationship, 
  onClose 
}: { 
  entity: Entity | null;
  relationship: Relationship | null;
  onClose: () => void;
}) {
  if (!entity && !relationship) return null;

  return (
    <div className="w-[400px] h-full border-l bg-card flex flex-col shadow-xl z-10 transition-all">
      <div className="flex items-center justify-between p-3 border-b">
        <h3 className="text-sm font-semibold tracking-wide">
          {entity ? 'Entity Details' : 'Relationship Details'}
        </h3>
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      
      <ScrollArea className="flex-1">
        {entity ? (
          <EntityInspectorContent entity={entity} />
        ) : (
          <RelationshipInspectorContent relationship={relationship!} onClose={onClose} />
        )}
      </ScrollArea>
    </div>
  );
}

function EntityInspectorContent({ entity }: { entity: Entity }) {
  const { caseId } = useCaseWorkspace();
  const { data: evidence = [] } = useListEvidence(caseId, { query: { enabled: !!caseId, queryKey: getListEvidenceQueryKey(caseId) } });
  const entityEvidence = evidence.filter(ev => ev.entity_ids?.includes(entity.id));

  return (
    <div className="flex flex-col">
      <div className="p-4 space-y-4">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-1">
            {entity.type.replace('_', ' ')}
          </div>
          <h2 className="text-lg font-bold break-words">{entity.value}</h2>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant={entity.confidence < 0.5 ? "destructive" : "secondary"}>
            {Math.round(entity.confidence * 100)}% Confidence
          </Badge>
          <Button variant="outline" size="sm" className="h-6 text-xs gap-1" asChild>
            <Link href={`/entities/${entity.id}`}>
              <ExternalLink className="w-3 h-3" /> Profile
            </Link>
          </Button>
        </div>

        {entity.description && (
          <div className="text-sm text-muted-foreground bg-muted/30 p-3 rounded-md border">
            {entity.description}
          </div>
        )}
      </div>

      <Tabs defaultValue="overview" className="flex-1 flex flex-col">
        <TabsList className="w-full justify-start rounded-none border-b border-t bg-transparent h-auto p-0">
          <TabsTrigger value="overview" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:shadow-none py-2 px-4 text-xs uppercase tracking-wider">Overview</TabsTrigger>
          <TabsTrigger value="evidence" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:shadow-none py-2 px-4 text-xs uppercase tracking-wider">Evidence</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="p-4 space-y-4 mt-0">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3"/> First Seen</span>
              <p className="text-sm">{entity.first_seen ? new Date(entity.first_seen).toLocaleDateString() : 'Unknown'}</p>
            </div>
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3"/> Last Seen</span>
              <p className="text-sm">{entity.last_seen ? new Date(entity.last_seen).toLocaleDateString() : 'Unknown'}</p>
            </div>
          </div>
          {entity.aliases?.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-xs text-muted-foreground">Aliases</span>
              <div className="flex flex-wrap gap-1">
                {entity.aliases.map(a => (
                  <Badge key={a} variant="outline" className="text-xs font-mono">{a}</Badge>
                ))}
              </div>
            </div>
          )}
          {entity.tags?.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-xs text-muted-foreground">Tags</span>
              <div className="flex flex-wrap gap-1">
                {entity.tags.map(t => (
                  <Badge key={t} variant="secondary" className="text-xs bg-secondary/50">{t}</Badge>
                ))}
              </div>
            </div>
          )}
        </TabsContent>
        <TabsContent value="evidence" className="p-4 mt-0">
          {entityEvidence.length > 0 ? (
            <div className="flex flex-col gap-3">
              {entityEvidence.map(ev => (
                <div key={ev.id} className="text-sm border p-3 rounded bg-card flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{ev.type.replace('_', ' ')}</span>
                    <Badge variant="outline" className="text-[10px]">{ev.reliability}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground truncate" title={ev.source}>{ev.source}</p>
                  <div className="flex justify-end mt-1">
                    <Button variant="ghost" size="sm" className="h-6 text-xs px-2" asChild>
                      <Link href={`/evidence?id=${ev.id}`}>View Evidence</Link>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground flex flex-col items-center justify-center py-8">
              <FileText className="w-8 h-8 text-muted/50 mb-2" />
              No direct evidence displayed here yet.
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function RelationshipInspectorContent({ relationship, onClose }: { relationship: Relationship, onClose: () => void }) {
  const isLowConfidence = relationship.confidence < 0.5;
  const { caseId } = useCaseWorkspace();
  const deleteRelationship = useDeleteRelationship();
  const updateRelationship = useUpdateRelationship();
  const queryClient = useQueryClient();
  const { data: me } = useGetMe();
  
  const canEditCase = me?.permissions?.includes("case:edit");

  const [isEditing, setIsEditing] = useState(false);
  const [editConfidence, setEditConfidence] = useState(relationship.confidence);
  const [editExplanation, setEditExplanation] = useState(relationship.explanation || "");

  const handleUpdate = () => {
    updateRelationship.mutate({
      relationshipId: relationship.id,
      data: {
        confidence: editConfidence,
        explanation: editExplanation
      }
    }, {
      onSuccess: () => {
        toast.success("Relationship updated");
        queryClient.invalidateQueries({ queryKey: getGetCaseGraphQueryKey(caseId) });
        setIsEditing(false);
      },
      onError: () => toast.error("Failed to update relationship")
    });
  };

  const handleDelete = () => {
    if (!confirm("Are you sure you want to delete this relationship?")) return;
    deleteRelationship.mutate({ relationshipId: relationship.id }, {
      onSuccess: () => {
        toast.success("Relationship deleted");
        queryClient.invalidateQueries({ queryKey: getGetCaseGraphQueryKey(caseId) });
        onClose();
      },
      onError: () => toast.error("Failed to delete relationship")
    });
  };

  return (
    <div className="flex flex-col">
      <div className="p-4 space-y-4">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-1 flex items-center gap-1">
            <LinkIcon className="w-3 h-3" /> Relationship
          </div>
          <h2 className="text-lg font-bold">
            {relationship.type.replace('_', ' ')}
          </h2>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant={isLowConfidence ? "destructive" : "secondary"}>
            {Math.round(relationship.confidence * 100)}% Confidence
          </Badge>
          <Badge variant="outline" className="text-xs uppercase">
            {relationship.attribution}
          </Badge>
        </div>

        {relationship.explanation && !isEditing && (
          <div className="space-y-1.5">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Reasoning</span>
            <div className="text-sm text-foreground bg-muted/30 p-3 rounded-md border font-mono whitespace-pre-wrap">
              {relationship.explanation}
            </div>
          </div>
        )}

        {isEditing && (
          <div className="space-y-3 pt-2">
            <div className="space-y-1.5">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Confidence (0-1)</span>
              <Input 
                type="number" 
                step="0.1" 
                min="0" 
                max="1" 
                value={editConfidence} 
                onChange={(e) => setEditConfidence(parseFloat(e.target.value))} 
              />
            </div>
            <div className="space-y-1.5">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Reasoning</span>
              <Textarea 
                value={editExplanation} 
                onChange={(e) => setEditExplanation(e.target.value)} 
                className="font-mono text-sm resize-y"
              />
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleUpdate} disabled={updateRelationship.isPending}>Save</Button>
              <Button size="sm" variant="ghost" onClick={() => setIsEditing(false)}>Cancel</Button>
            </div>
          </div>
        )}
      </div>

      <div className="border-t p-4 space-y-3">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Cited Evidence</span>
        {relationship.evidence_ids?.length > 0 ? (
          <div className="flex flex-col gap-2">
            {relationship.evidence_ids.map(id => (
              <div key={id} className="text-sm border p-2 rounded bg-card flex items-center justify-between">
                <span className="truncate flex-1 font-mono text-xs">{id}</span>
                <Button variant="ghost" size="sm" className="h-6 text-xs px-2" asChild>
                  <Link href={`/evidence?id=${id}`}>View</Link>
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No specific evidence cited.</p>
        )}

        {canEditCase && !isEditing && (
          <div className="pt-4 flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
              Edit
            </Button>
            <Button variant="destructive" size="sm" onClick={handleDelete} disabled={deleteRelationship.isPending}>
              Delete Relationship
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
