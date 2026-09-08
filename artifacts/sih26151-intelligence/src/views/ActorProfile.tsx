import { useState, useRef, useEffect } from 'react';
import { useRoute, useLocation, useSearch } from 'wouter';
import { useCaseWorkspace } from '@/hooks/use-case-workspace';
import {
  useGetEntityProfile,
  useUpdateEntity,
  useGetMe,
  getGetEntityProfileQueryKey,
  getGetCaseGraphQueryKey,
  type EvidenceConclusion
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
  const searchParams = new URLSearchParams(useSearch());
  const urlCaseId = searchParams.get('case');
  const [matchActor, paramsActor] = useRoute('/actors/:id');
  const [matchEntity, paramsEntity] = useRoute('/entities/:id');

  const id = (matchActor ? paramsActor?.id : (matchEntity ? paramsEntity?.id : null)) as string;

  const { caseId, setCaseId } = useCaseWorkspace();
  const queryClient = useQueryClient();
  const updateEntity = useUpdateEntity();
  const { data: me } = useGetMe();

  useEffect(() => {
    if (urlCaseId && urlCaseId !== caseId) {
      setCaseId(urlCaseId);
    }
  }, [urlCaseId, caseId, setCaseId]);

  const { data: profile, isLoading, error } = useGetEntityProfile(id, { query: { enabled: !!id, queryKey: getGetEntityProfileQueryKey(id) } });

  const canEditCase = me?.permissions?.includes("case:edit");

  const [description, setDescription] = useState("");
  const [aliases, setAliases] = useState("");
  const [tags, setTags] = useState("");

  const initializedId = useRef<string | null>(null);

  useEffect(() => {
    if (profile?.entity && initializedId.current !== profile.entity.id) {
      setDescription(profile.entity.description || "");
      setAliases((profile.entity.aliases || []).join(", "));
      setTags((profile.entity.tags || []).join(", "));
      initializedId.current = profile.entity.id;
    }
  }, [profile?.entity]);

  const handleSave = () => {
    if (!profile?.entity) return;

    const parsedAliases = aliases.split(',').map(s => s.trim()).filter(Boolean);
    const parsedTags = tags.split(',').map(s => s.trim()).filter(Boolean);

    updateEntity.mutate({
      entityId: profile.entity.id,
      data: {
        description,
        aliases: parsedAliases,
        tags: parsedTags
      }
    }, {
      onSuccess: () => {
        toast.success("Entity updated successfully");
        queryClient.invalidateQueries({ queryKey: getGetEntityProfileQueryKey(profile.entity.id) });
        if (caseId) {
          queryClient.invalidateQueries({ queryKey: getGetCaseGraphQueryKey(caseId, { min_confidence: 0 }) });
        }
      },
      onError: (err: any) => {
        toast.error("Failed to update entity: " + (err.message || "Unknown error"));
      }
    });
  };

  if (isLoading) {
    return <div className="p-8 text-muted-foreground flex items-center justify-center min-h-[400px]">Loading profile...</div>;
  }

  if (error || !profile) {
    return <div className="p-8 text-destructive text-center min-h-[400px] flex items-center justify-center flex-col gap-4">
      <AlertTriangle className="h-8 w-8" />
      <p>Failed to load profile for entity: {id}</p>
      <Button variant="outline" onClick={() => setLocation('/entities')}>Back to Entities</Button>
    </div>;
  }

  const { entity, actor_hypothesis, relationships, evidence, timeline, activity, related_entities, related_cases, confidence, metadata } = profile;
  const Icon = getIconForType(entity.type);

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center gap-4 text-sm text-muted-foreground mb-4">
        <button onClick={() => setLocation('/entities')} className="hover:text-foreground flex items-center gap-1 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to directory
        </button>
      </div>

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-card p-6 rounded-lg border">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20 shrink-0">
            <Icon className="w-8 h-8 text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="secondary" className="uppercase tracking-wider text-[10px]">{entity.type.replace('_', ' ')}</Badge>
              {confidence < 0.5 && (
                <Badge variant="destructive" className="bg-warning/20 text-warning hover:bg-warning/30 border-warning/50">
                  Low Confidence
                </Badge>
              )}
            </div>
            <h1 className="text-3xl font-bold tracking-tight font-mono">{entity.value}</h1>
          </div>
        </div>

        {canEditCase && (
          <Button onClick={handleSave} disabled={updateEntity.isPending} className="shrink-0 gap-2">
            <Save className="w-4 h-4" /> Save Changes
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="w-full justify-start bg-transparent border-b rounded-none h-auto p-0 gap-6">
              <TabsTrigger value="overview" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 pb-2 pt-2">Overview & Notes</TabsTrigger>
              <TabsTrigger value="relationships" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 pb-2 pt-2">Relationships</TabsTrigger>
              <TabsTrigger value="evidence" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 pb-2 pt-2">Linked Evidence</TabsTrigger>
              <TabsTrigger value="timeline" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 pb-2 pt-2">Temporal Timeline</TabsTrigger>
              <TabsTrigger value="activity" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 pb-2 pt-2">Audit Activity</TabsTrigger>
              <TabsTrigger value="related" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 pb-2 pt-2">Related Entities</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="mt-4 space-y-6">
              {actor_hypothesis && (
                <div className="bg-destructive/5 border border-destructive/20 rounded-md p-4 space-y-4">
                  <div className="flex items-center gap-2 text-destructive font-semibold">
                    <AlertTriangle className="w-5 h-5" /> Actor Hypothesis
                  </div>
                  <p className="text-sm text-foreground/80 leading-relaxed font-medium">{actor_hypothesis.caution}</p>

                  {actor_hypothesis.personas.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Personas in this hypothesis</h4>
                      <div className="flex flex-wrap gap-2">
                        {actor_hypothesis.personas.map((persona) => (
                          <a
                            key={persona.id}
                            href={`/entities/${persona.id}?case=${caseId}`}
                            className="rounded-md border bg-background/60 px-2 py-1 text-xs font-mono hover:border-primary"
                          >
                            {persona.value}
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  {actor_hypothesis.indicator_groups && Object.keys(actor_hypothesis.indicator_groups).length > 0 && (
                    <div className="space-y-2 mt-4">
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Indicator Groups</h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {Object.entries(actor_hypothesis.indicator_groups).map(([groupName, entities]) => (
                          <div key={groupName} className="bg-background/50 border rounded p-2 text-xs">
                            <div className="font-semibold text-primary mb-1 capitalize">{groupName.replace('_', ' ')}</div>
                            <div className="mt-1 flex flex-wrap gap-1">
                              {entities.slice(0, 3).map((e) => (
                                <a key={e.id} href={`/entities/${e.id}?case=${caseId}`} className="bg-muted px-1.5 py-0.5 rounded border border-muted-foreground/20 hover:border-primary transition-colors">{e.value}</a>
                              ))}
                              {entities.length > 3 && <span className="text-muted-foreground">+{entities.length - 3}</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {actor_hypothesis.evidence_strength.length > 0 && (
                    <div className="space-y-2 mt-4">
                      <h4 className="text-xs font-semibold text-primary uppercase tracking-wider">Cited supporting conclusions</h4>
                      <ul className="text-sm space-y-2">
                        {actor_hypothesis.evidence_strength.map((conclusion: EvidenceConclusion, index: number) => (
                          <li key={`${conclusion.relationship_type}-${index}`} className="rounded border bg-background/50 p-2">
                            <p>{conclusion.explanation}</p>
                            <div className="mt-1 flex flex-wrap gap-1">
                              {conclusion.evidence_ids.map((evidenceId: string) => (
                                <a
                                  key={evidenceId}
                                  href={`/evidence?evidence=${encodeURIComponent(evidenceId)}&case=${caseId}`}
                                  className="text-xs text-primary underline"
                                >
                                  Evidence {evidenceId.slice(0, 8)}
                                </a>
                              ))}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {actor_hypothesis.contradictions && actor_hypothesis.contradictions.length > 0 && (
                    <div className="space-y-2 mt-4">
                      <h4 className="text-xs font-semibold text-warning uppercase tracking-wider">Contradictions</h4>
                      <ul className="text-sm space-y-1 list-disc pl-4 text-muted-foreground">
                        {actor_hypothesis.contradictions.map((conclusion: EvidenceConclusion, index: number) => (
                          <li key={`${conclusion.relationship_type}-${index}`}>
                            {conclusion.explanation}
                            {conclusion.evidence_ids.map((evidenceId: string) => (
                              <a key={evidenceId} href={`/evidence?evidence=${encodeURIComponent(evidenceId)}&case=${caseId}`} className="text-primary underline text-xs ml-1">
                                Evidence {evidenceId.slice(0, 8)}
                              </a>
                            ))}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <label className="text-sm font-semibold text-foreground">Description & Synthesis</label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Analyst notes, synthesis, or AI-generated summary..."
                  className="min-h-[150px] resize-y text-sm leading-relaxed"
                  disabled={!canEditCase}
                />
              </div>
            </TabsContent>

            <TabsContent value="relationships" className="mt-4">
              {relationships?.length > 0 ? (
                <div className="rounded-md border bg-card overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 border-b text-muted-foreground text-xs uppercase tracking-wider">
                      <tr>
                        <th className="px-4 py-3 text-left w-32">Relation</th>
                        <th className="px-4 py-3 text-left">Target Entity</th>
                        <th className="px-4 py-3 text-left w-24">Confidence</th>
                        <th className="px-4 py-3 text-left">Evidence</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {relationships.map(rel => {
                        const isSource = rel.source_id === entity.id;
                        const otherId = isSource ? rel.target_id : rel.source_id;
                        return (
                          <tr key={rel.id} className="hover:bg-muted/30 transition-colors">
                            <td className="px-4 py-3">
                              <Badge variant="outline" className="text-[10px] bg-background">
                                {isSource ? '' : '← '}{rel.type.replace('_', ' ')}{isSource ? ' →' : ''}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 font-medium">
                              <a href={`/entities/${otherId}?case=${caseId}`} className="text-primary hover:underline font-mono text-xs">
                                {otherId}
                              </a>
                            </td>
                            <td className="px-4 py-3">
                              <span className="font-mono text-xs">{Math.round(rel.confidence * 100)}%</span>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex flex-wrap gap-1">
                                {rel.evidence_ids?.map(eid => (
                                  <a key={eid} href={`/evidence?evidence=${eid}&case=${caseId}`} className="text-xs bg-muted/50 px-2 py-0.5 rounded border hover:border-primary transition-colors font-mono">
                                    {eid.slice(0,6)}
                                  </a>
                                ))}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="border rounded-md p-8 text-center text-muted-foreground bg-muted/10">
                  No defined relationships.
                </div>
              )}
            </TabsContent>

            <TabsContent value="evidence" className="mt-4">
              {evidence?.length > 0 ? (
                <div className="flex flex-col gap-3">
                  {evidence.map(ev => (
                    <div key={ev.id} className="text-sm border p-4 rounded-md bg-card flex flex-col gap-2 hover:border-primary/50 transition-colors">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-base uppercase tracking-wider text-xs">{ev.type.replace('_', ' ')}</span>
                        <Badge variant="secondary" className="font-mono text-[10px]">{ev.reliability}</Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <a href={`/evidence?evidence=${ev.id}&case=${caseId}`} className="text-xs text-primary underline truncate flex-1 font-medium">
                          {ev.source || "Unknown Source"}
                        </a>
                      </div>
                      {ev.notes && <p className="text-xs font-mono bg-muted/30 p-2 rounded text-muted-foreground mt-2">{ev.notes}</p>}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="border rounded-md p-8 text-center text-muted-foreground bg-muted/10">
                  No evidence directly linked.
                </div>
              )}
            </TabsContent>

            <TabsContent value="timeline" className="mt-4">
              {timeline?.length ? (
                <div className="space-y-4 pr-4 border-l-2 border-muted ml-2 py-2">
                  {timeline.map((evt) => (
                     <div key={evt.id} className="relative pl-4">
                       <div className="absolute -left-[5px] top-1.5 h-2 w-2 rounded-full bg-primary" />
                       <div className="text-[10px] text-muted-foreground font-mono mb-1">{new Date(evt.occurred_at).toISOString().substring(0, 19)} UTC</div>
                       <div className="text-sm font-medium">{evt.title}</div>
                       <div className="text-xs text-muted-foreground/70 uppercase tracking-wider mt-1">{evt.kind}</div>
                       {evt.evidence_id && (
                         <div className="mt-1">
                           <a href={`/evidence?evidence=${evt.evidence_id}&case=${caseId}`} className="text-xs font-mono text-primary hover:underline">Evidence: {evt.evidence_id.slice(0,8)}</a>
                         </div>
                       )}
                     </div>
                  ))}
                </div>
               ) : (
                <div className="border rounded-md p-8 text-center text-muted-foreground bg-muted/10">
                  No temporal events recorded.
                </div>
               )}
            </TabsContent>

            <TabsContent value="activity" className="mt-4">
              {activity?.length ? (
                <div className="rounded-md border bg-card overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 border-b text-muted-foreground text-xs uppercase tracking-wider">
                      <tr>
                        <th className="px-4 py-3 text-left">Timestamp (UTC)</th>
                        <th className="px-4 py-3 text-left">Action</th>
                        <th className="px-4 py-3 text-left">Resource</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {activity.map(act => (
                        <tr key={act.id} className="hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                            {new Date(act.created_at).toISOString().substring(0, 19)}
                          </td>
                          <td className="px-4 py-3 font-medium">
                            {act.action}
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-xs uppercase text-muted-foreground font-semibold tracking-wider mr-2">{act.resource_type}</span>
                            <span className="font-mono text-xs">{act.resource_id.slice(0,8)}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="border rounded-md p-8 text-center text-muted-foreground bg-muted/10">
                  No audit activity recorded.
                </div>
              )}
            </TabsContent>

            <TabsContent value="related" className="mt-4 space-y-6">
              {related_entities?.length > 0 ? (
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Similar Entities</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {related_entities.map(re => (
                      <a key={re.id} href={`/entities/${re.id}?case=${caseId}`} className="border rounded-md p-3 hover:border-primary/50 transition-colors bg-card block group">
                        <div className="flex justify-between items-center mb-1">
                          <span className="font-mono font-semibold text-sm truncate max-w-[150px] group-hover:text-primary">{re.value}</span>
                          <Badge variant="outline" className="text-[10px] uppercase">{re.type.replace('_', ' ')}</Badge>
                        </div>
                      </a>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="border rounded-md p-8 text-center text-muted-foreground bg-muted/10">
                  No similar entities found.
                </div>
              )}

              {related_cases?.length > 0 && (
                <div className="space-y-3 pt-4 border-t">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Seen in Other Cases</h3>
                  <div className="grid grid-cols-1 gap-2">
                    {related_cases.map(rc => (
                      <a key={rc.id} href={`/cases/${rc.id}`} className="border rounded-md p-3 hover:border-primary/50 transition-colors bg-card flex justify-between items-center group">
                        <div>
                          <div className="font-semibold text-sm group-hover:text-primary">{rc.title}</div>
                          <div className="text-xs text-muted-foreground font-mono">Case ID: {rc.id.slice(0, 8)}</div>
                        </div>
                        <ArrowLeft className="w-4 h-4 rotate-135 opacity-0 group-hover:opacity-100 transition-opacity text-primary" />
                      </a>
                    ))}
                  </div>
                </div>
              )}
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
                  <span className="font-mono">{entity.first_seen ? new Date(entity.first_seen).toISOString().substring(0, 10) : 'N/A'}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> Last Seen</span>
                  <span className="font-mono">{entity.last_seen ? new Date(entity.last_seen).toISOString().substring(0, 10) : 'N/A'}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">
                    {actor_hypothesis ? 'Analyst-assigned heuristic confidence' : 'Confidence'}
                  </span>
                  <span className="font-mono">{Math.round(confidence * 100)}%</span>
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