import { useState, useRef, useEffect, useCallback } from 'react';
import { useCaseWorkspace, CaseScope } from '@/hooks/use-case-workspace';
import { 
  useGetCaseGraph, 
  useGetCaseTimeline, 
  useListEvidence,
  useGetEntityProfile,
  useListSavedViews,
  useCreateSavedView,
  getListEvidenceQueryKey,
  getListSavedViewsQueryKey,
  EntityType,
  TimelineKind,
  TimelineEvent,
  Entity,
  Relationship,
  Evidence,
  SavedView
} from '@workspace/api-client-react';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { GraphBoard } from '@/features/graph/GraphBoard';
import { Layout, Clock, Files, Search, Filter, Share, Crosshair, AlertTriangle, Save, RefreshCw } from 'lucide-react';
import { Link } from 'wouter';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

// Removed GraphView


function EntityInspector({ entityId }: { entityId: string | null }) {
  if (!entityId) {
    return (
      <div className="h-full flex items-center justify-center p-6 text-center text-muted-foreground text-sm italic border-l">
        Select an entity to inspect its profile.
      </div>
    );
  }
  
  return <InspectorProfile id={entityId} />;
}

function InspectorProfile({ id }: { id: string }) {
  const { data: profile, isLoading } = useGetEntityProfile(id);
  
  if (isLoading) return <div className="p-4 text-sm text-muted-foreground">Loading profile...</div>;
  if (!profile) return <div className="p-4 text-sm text-destructive">Failed to load profile.</div>;
  
  return (
    <div className="flex flex-col h-full border-l bg-card">
      <div className="p-4 border-b shrink-0 flex justify-between items-start bg-muted/20">
        <div>
          <Badge variant="outline" className="text-[10px] mb-2 uppercase">{profile.entity.type}</Badge>
          <h3 className="font-bold text-lg font-mono truncate max-w-[200px]" title={profile.entity.value}>{profile.entity.value}</h3>
        </div>
        <Button variant="ghost" size="sm" asChild className="h-8">
          <Link href={`/entities/${id}`}>Full Profile</Link>
        </Button>
      </div>
      
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-6">
          {profile.actor_hypothesis && (
            <div className="bg-destructive/10 border border-destructive/20 rounded-md p-3 space-y-2">
              <div className="flex items-center gap-2 text-destructive font-semibold text-sm">
                <AlertTriangle className="w-4 h-4" /> Actor Hypothesis
              </div>
              <p className="text-xs text-foreground/80 leading-relaxed">{profile.actor_hypothesis.caution}</p>
            </div>
          )}

          <div className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Metadata</h4>
            <div className="text-sm font-mono space-y-1 bg-muted/30 p-2 rounded">
              <div className="flex justify-between"><span className="text-muted-foreground">Confidence</span> <span>{Math.round(profile.confidence * 100)}%</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">First Seen</span> <span>{profile.entity.first_seen ? new Date(profile.entity.first_seen).toLocaleDateString() : 'Unknown'}</span></div>
            </div>
          </div>
          
          <div className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Notes</h4>
            {profile.notes.map((n, i) => (
              <div key={i} className="text-xs bg-muted/30 p-2 rounded font-mono border-l-2 border-primary/50">
                <span className="text-muted-foreground mr-2">{n.source}:</span>
                {typeof n.value === 'string' ? n.value : JSON.stringify(n.value)}
              </div>
            ))}
            {profile.notes.length === 0 && <span className="text-xs text-muted-foreground italic">No notes available.</span>}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}

function WorkspaceInternal() {
  const { caseId } = useCaseWorkspace();
  const queryClient = useQueryClient();
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  
  // Reset selected entity when case changes
  useEffect(() => {
    setSelectedEntityId(null);
    setActiveViewId("default");
    setGraphViewport({});
    setGraphPositions({});
    setActivePanel("timeline");
  }, [caseId]);

  // Graph Data
  const { data: timeline } = useGetCaseTimeline(caseId, { limit: 50 });
  const evidenceParams = { limit: 50 };
  const savedViewParams = { limit: 200 };
  const { data: evidence } = useListEvidence(caseId, evidenceParams, { query: { enabled: !!caseId, queryKey: getListEvidenceQueryKey(caseId, evidenceParams) } });
  const { data: savedViews } = useListSavedViews(caseId, savedViewParams, { query: { enabled: !!caseId, queryKey: getListSavedViewsQueryKey(caseId, savedViewParams) } });
  const createSavedView = useCreateSavedView();

  const [activeViewId, setActiveViewId] = useState<string>("default");
  
  const activeView = savedViews?.find(v => v.id === activeViewId);

  const [graphViewport, setGraphViewport] = useState<any>({});
  const [graphPositions, setGraphPositions] = useState<any>({});
  const [graphFilters, setGraphFilters] = useState<any>({});
  const [activePanel, setActivePanel] = useState<string>("timeline");
  const [panelLayout, setPanelLayout] = useState<{ main: number[], vertical: number[] }>({ main: [70, 30], vertical: [65, 35] });
  const [panelRenderKey, setPanelRenderKey] = useState(0);

  // Restore non-empty state when active view changes
  useEffect(() => {
    if (activeView) {
      if (activeView.viewport) setGraphViewport(activeView.viewport);
      if (activeView.positions) setGraphPositions(activeView.positions);
      if (activeView.filters) {
        const filters = activeView.filters as any;
        if (filters.selectedEntityId !== undefined) setSelectedEntityId(filters.selectedEntityId);
        if (filters.activePanel) setActivePanel(filters.activePanel);
        if (filters.graph) setGraphFilters(filters.graph);
        if (filters.panelLayout) {
          setPanelLayout(filters.panelLayout);
          setPanelRenderKey(k => k + 1); // Remount to apply defaultSize
        }
      }
    } else if (activeViewId === "default") {
      setSelectedEntityId(null);
      setGraphViewport({});
      setGraphPositions({});
      setGraphFilters({});
      setActivePanel("timeline");
      setPanelLayout({ main: [70, 30], vertical: [65, 35] });
      setPanelRenderKey(k => k + 1);
    }
  }, [activeView, activeViewId]);

  const handleSaveView = () => {
    createSavedView.mutate({
      caseId,
      data: {
        name: `View ${new Date().toLocaleTimeString()}`,
        filters: { selectedEntityId, activePanel, graph: graphFilters, panelLayout },
        positions: graphPositions,
        viewport: graphViewport
      }
    }, {
      onSuccess: () => {
        toast.success("Workspace view saved.");
        queryClient.invalidateQueries({ queryKey: getListSavedViewsQueryKey(caseId, savedViewParams) });
      }
    });
  };

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] border rounded-xl overflow-hidden shadow-sm bg-background">
      <div className="flex items-center justify-between p-2 px-4 border-b bg-muted/30 shrink-0 h-14">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Layout className="w-4 h-4 text-primary" /> Workspace
          </div>
          <div className="h-4 w-px bg-border mx-1" />
          <Select value={activeViewId} onValueChange={setActiveViewId}>
            <SelectTrigger className="h-8 w-[200px] text-xs font-mono">
              <SelectValue placeholder="Select view..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">Default Investigation View</SelectItem>
              {savedViews?.map((v: SavedView) => (
                <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-8 gap-2" onClick={handleSaveView} disabled={createSavedView.isPending}>
            <Save className="w-3.5 h-3.5" /> Save State
          </Button>
        </div>
      </div>
      
      <div className="flex-1 flex overflow-hidden">
        <ResizablePanelGroup 
          key={`main-${panelRenderKey}`} 
          direction="horizontal" 
          onLayout={(sizes) => setPanelLayout(prev => ({ ...prev, main: sizes }))}
        >
          <ResizablePanel defaultSize={panelLayout.main[0]} minSize={30}>
            <ResizablePanelGroup 
              key={`vert-${panelRenderKey}`} 
              direction="vertical"
              onLayout={(sizes) => setPanelLayout(prev => ({ ...prev, vertical: sizes }))}
            >
              <ResizablePanel defaultSize={panelLayout.vertical[0]}>
                <div className="h-full relative bg-background">
                  <div className="absolute top-4 left-4 z-10 font-semibold text-xs tracking-wider uppercase text-muted-foreground bg-background/80 px-2 py-1 rounded backdrop-blur border shadow-sm">
                    Relationship Graph
                  </div>
                  <GraphBoard 
                    onSelectEntity={setSelectedEntityId}
                    restoreKey={activeViewId}
                    initialPositions={graphPositions}
                    initialViewport={graphViewport}
                    initialFilters={graphFilters}
                    onPositionsChange={setGraphPositions}
                    onViewportChange={setGraphViewport}
                    onFiltersChange={setGraphFilters}
                  />
                </div>
              </ResizablePanel>
              <ResizableHandle withHandle />
              <ResizablePanel defaultSize={panelLayout.vertical[1]}>
                <Tabs value={activePanel} onValueChange={setActivePanel} className="w-full h-full flex flex-col bg-muted/10 border-t">
                  <div className="px-4 pt-2 border-b bg-muted/30 shrink-0">
                    <TabsList className="h-8 bg-transparent">
                      <TabsTrigger value="timeline" className="text-xs data-[state=active]:bg-background"><Clock className="w-3 h-3 mr-2" /> Timeline</TabsTrigger>
                      <TabsTrigger value="evidence" className="text-xs data-[state=active]:bg-background"><Files className="w-3 h-3 mr-2" /> Evidence</TabsTrigger>
                    </TabsList>
                  </div>
                  
                  <TabsContent value="timeline" className="flex-1 overflow-hidden m-0">
                    <ScrollArea className="h-full p-4">
                      <div className="space-y-4 pr-4 border-l-2 border-muted ml-2">
                        {timeline?.map((evt: TimelineEvent) => (
                          <div key={evt.id} className="relative pl-4">
                            <div className="absolute -left-[5px] top-1.5 h-2 w-2 rounded-full bg-primary" />
                            <div className="text-[10px] text-muted-foreground font-mono mb-1">{new Date(evt.occurred_at).toISOString().replace('T', ' ').substring(0, 19)} UTC</div>
                            <div className="text-sm font-medium">{evt.title}</div>
                            <div className="text-xs text-muted-foreground/70 uppercase tracking-wider mt-1">{evt.kind}</div>
                            {evt.evidence_id && (
                              <div className="mt-1">
                                <a href={`/evidence?evidence=${evt.evidence_id}`} className="text-xs font-mono text-primary hover:underline">Evidence: {evt.evidence_id.slice(0,8)}</a>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </TabsContent>
                  <TabsContent value="evidence" className="flex-1 overflow-hidden m-0">
                    <ScrollArea className="h-full p-4">
                      <div className="space-y-2">
                        {evidence?.map((ev: Evidence) => (
                          <a key={ev.id} href={`/evidence?evidence=${ev.id}`} className="block text-sm border p-3 rounded bg-card hover:border-primary/50 transition-colors group">
                            <div className="flex justify-between items-center">
                              <div>
                                <div className="font-medium text-primary group-hover:underline">{ev.type}</div>
                                <div className="text-xs text-muted-foreground truncate max-w-[200px]">{ev.source}</div>
                              </div>
                              <Badge variant="secondary" className="font-mono text-[10px]">{ev.reliability}</Badge>
                            </div>
                          </a>
                        ))}
                      </div>
                    </ScrollArea>
                  </TabsContent>
                </Tabs>
              </ResizablePanel>
            </ResizablePanelGroup>
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={panelLayout.main[1]} minSize={20} maxSize={40}>
            <EntityInspector entityId={selectedEntityId} />
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  );
}

export function Workspace() {
  return (
    <div className="h-full w-full flex flex-col space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Investigation Workspace</h1>
        <p className="text-sm text-muted-foreground mt-1">Multi-modal synthesis of graph, temporal, and entity data.</p>
      </div>
      <CaseScope>
        <WorkspaceInternal />
      </CaseScope>
    </div>
  );
}