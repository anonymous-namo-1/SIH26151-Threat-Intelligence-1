import { useState, useRef, useEffect, useCallback } from 'react';
import { useRoute, useLocation } from 'wouter';
import { useCaseWorkspace } from '@/hooks/use-case-workspace';
import { 
  useGetEntity, 
  useUpdateEntity,
  useGetMe,
  useListEvidence,
  getListEvidenceQueryKey,
  EntityType 
} from '@workspace/api-client-react';
import { 
  User, Shield, Globe, FileText, MapPin, Cpu, Link as LinkIcon, Server, Hash, Key, Wallet, Phone, MessageSquare, AtSign, Mail, Store, Building, AlertTriangle, Save, Clock, ArrowLeft
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { getGetEntityQueryKey, getGetCaseGraphQueryKey } from '@workspace/api-client-react';

function getIconForType(type: string) {
  switch (type) {
    case 'PERSONA': return User;
    case 'ACTOR_HYPOTHESIS': return Shield;
    case 'DOMAIN':
    case 'URL':
    case 'IP_ADDRESS':
    case 'ONION_SERVICE': return Globe;
    case 'DOCUMENT':
    case 'POST': return FileText;
    case 'LOCATION_INDICATOR': return MapPin;
    case 'DEVICE_INDICATOR': return Cpu;
    case 'FILE_HASH': return Hash;
    case 'PGP_KEY': return Key;
    case 'CRYPTO_WALLET':
    case 'CRYPTO_TRANSACTION': return Wallet;
    case 'USERNAME': return AtSign;
    case 'EMAIL': return Mail;
    case 'MESSAGE': return MessageSquare;
    case 'MARKETPLACE':
    case 'FORUM': return Store;
    case 'ORGANIZATION': return Building;
    case 'INFRASTRUCTURE': return Server;
    default: return LinkIcon;
  }
}

export function ActorProfile() {
  const [, setLocation] = useLocation();
  const [matchActor, paramsActor] = useRoute('/actors/:id');
  const [matchEntity, paramsEntity] = useRoute('/entities/:id');
  
  const id = (matchActor ? paramsActor?.id : (matchEntity ? paramsEntity?.id : null)) as string;
  
  const { caseId } = useCaseWorkspace();
  const { data: entity, isLoading, error } = useGetEntity(id, { query: { enabled: !!id, queryKey: getGetEntityQueryKey(id) } });
  
  const queryClient = useQueryClient();
  const updateEntity = useUpdateEntity();
  const { data: me } = useGetMe();
  const { data: evidence = [] } = useListEvidence(caseId, { query: { enabled: !!caseId, queryKey: getListEvidenceQueryKey(caseId) } });
  
  const canEditCase = me?.permissions?.includes("case:edit");

  const [description, setDescription] = useState("");
  const [aliases, setAliases] = useState("");
  const [tags, setTags] = useState("");
  
  const initializedId = useRef<string | null>(null);

  useEffect(() => {
    if (entity && initializedId.current !== entity.id) {
      setDescription(entity.description || "");
      setAliases((entity.aliases || []).join(", "));
      setTags((entity.tags || []).join(", "));
      initializedId.current = entity.id;
    }
  }, [entity]);

  const handleSave = () => {
    if (!entity) return;
    
    const parsedAliases = aliases.split(',').map(s => s.trim()).filter(Boolean);
    const parsedTags = tags.split(',').map(s => s.trim()).filter(Boolean);

    updateEntity.mutate({
      entityId: entity.id,
      data: {
        description,
        aliases: parsedAliases,
        tags: parsedTags
      }
    }, {
      onSuccess: (updated) => {
        toast.success("Entity updated successfully");
        queryClient.setQueryData(getGetEntityQueryKey(entity.id), updated);
        // Also invalidate graph if case is known
        if (caseId) {
          queryClient.invalidateQueries({ queryKey: getGetCaseGraphQueryKey(caseId) });
        }
      },
      onError: () => {
        toast.error("Failed to update entity");
      }
    });
  };

  if (isLoading) return <div className="p-8">Loading profile...</div>;
  if (error || !entity) return <div className="p-8 text-destructive">Error loading profile.</div>;

  const Icon = getIconForType(entity.type);

  return (
    <div className="flex flex-col h-full max-w-5xl mx-auto space-y-6 pb-20">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => setLocation(-1 as any)}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
              <Icon className="w-6 h-6" />
            </div>
            <div>
              <div className="text-sm font-semibold tracking-wider text-muted-foreground uppercase flex items-center gap-2">
                {entity.type.replace('_', ' ')}
                {entity.confidence < 0.5 && <AlertTriangle className="w-3.5 h-3.5 text-destructive" />}
              </div>
              <h1 className="text-3xl font-bold tracking-tight">{entity.value}</h1>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant={entity.confidence < 0.5 ? "destructive" : "outline"} className="text-sm">
            {Math.round(entity.confidence * 100)}% Confidence
          </Badge>
          {canEditCase && (
            <Button onClick={handleSave} className="gap-2" disabled={updateEntity.isPending}>
              <Save className="w-4 h-4" /> {updateEntity.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Description & Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea 
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Analyst notes and description..."
                className="min-h-[150px] font-mono text-sm resize-y"
                disabled={!canEditCase}
              />
            </CardContent>
          </Card>

          <Tabs defaultValue="evidence">
            <TabsList>
              <TabsTrigger value="evidence">Linked Evidence</TabsTrigger>
              <TabsTrigger value="comparisons">Comparisons</TabsTrigger>
            </TabsList>
            <TabsContent value="evidence" className="mt-2">
              {evidence.filter(ev => ev.entity_ids?.includes(entity.id)).length > 0 ? (
                <div className="flex flex-col gap-3">
                  {evidence.filter(ev => ev.entity_ids?.includes(entity.id)).map(ev => (
                    <div key={ev.id} className="text-sm border p-4 rounded-md bg-card flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-base">{ev.type.replace('_', ' ')}</span>
                        <Badge variant="outline">{ev.reliability}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{ev.source}</p>
                      {ev.notes && <p className="text-xs font-mono bg-muted/30 p-2 rounded">{ev.notes}</p>}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="border rounded-md p-8 text-center text-muted-foreground">
                  No evidence directly linked.
                </div>
              )}
            </TabsContent>
            <TabsContent value="comparisons" className="border rounded-md p-8 text-center text-muted-foreground mt-2">
              No similarity comparisons available.
            </TabsContent>
          </Tabs>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Metadata</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Aliases (comma separated)</label>
                <Input 
                  value={aliases}
                  onChange={(e) => setAliases(e.target.value)}
                  placeholder="e.g. shadow_broker, 0x123..."
                  className="font-mono text-sm"
                  disabled={!canEditCase}
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Tags (comma separated)</label>
                <Input 
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  placeholder="e.g. apt, high-value"
                  className="font-mono text-sm"
                  disabled={!canEditCase}
                />
              </div>
              
              <div className="pt-4 border-t space-y-3">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> First Seen</span>
                  <span className="font-mono">{entity.first_seen ? new Date(entity.first_seen).toLocaleDateString() : 'N/A'}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> Last Seen</span>
                  <span className="font-mono">{entity.last_seen ? new Date(entity.last_seen).toLocaleDateString() : 'N/A'}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Source</span>
                  <span className="font-mono max-w-[150px] truncate" title={entity.source}>{entity.source || 'Unknown'}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
