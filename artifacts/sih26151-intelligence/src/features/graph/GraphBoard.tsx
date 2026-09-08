import { useState, useCallback, useEffect, useRef } from "react";
import {
  ReactFlow,
  Controls,
  Background,
  MiniMap,
  useNodesState,
  useEdgesState,
  ReactFlowProvider,
  useReactFlow,
  Panel,
  MarkerType,
  Node,
  Edge
} from "@xyflow/react";
import '@xyflow/react/dist/style.css';

import { useCaseWorkspace } from "@/hooks/use-case-workspace";
import {
  useGetCaseGraph,
  getGetCaseGraphQueryKey,
  useListSavedViews,
  getListSavedViewsQueryKey,
} from "@workspace/api-client-react";
import type { Entity, Relationship, EntityType, RelationshipType } from "@workspace/api-client-react";
import { AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

import { GraphToolbar } from "./GraphToolbar";
import { GraphInspector } from "./GraphInspector";
import { EntityNode } from "./EntityNode";
import { RelationshipEdge } from "./RelationshipEdge";

const nodeTypes = {
  entity: EntityNode,
};

const edgeTypes = {
  relationship: RelationshipEdge,
};

function layoutNodes(nodes: Node[]) {
  const cols = Math.ceil(Math.sqrt(nodes.length));
  return nodes.map((node, i) => ({
    ...node,
    position: {
      x: (i % cols) * 200,
      y: Math.floor(i / cols) * 150,
    },
  }));
}

function GraphBoardInner({
  onSelectEntity,
  restoreKey,
  initialPositions,
  initialViewport,
  initialFilters,
  onPositionsChange,
  onViewportChange,
  onFiltersChange
}: {
  onSelectEntity?: (id: string) => void,
  restoreKey?: string,
  initialPositions?: any,
  initialViewport?: any,
  initialFilters?: any,
  onPositionsChange?: (pos: any) => void,
  onViewportChange?: (vp: any) => void,
  onFiltersChange?: (filters: any) => void
}) {
  const { caseId } = useCaseWorkspace();
  const { fitView, setViewport, getNodes } = useReactFlow();

  const [minConfidence, setMinConfidence] = useState<number>(0);
  const [selectedTypes, setSelectedTypes] = useState<EntityType[]>([]);
  const [selectedRelTypes, setSelectedRelTypes] = useState<RelationshipType[]>([]);
  const [cutoffDate, setCutoffDate] = useState<string>("");
  const [activeViewId, setActiveViewId] = useState<string | null>(null);

  const { data: graph, isLoading, error, refetch } = useGetCaseGraph(caseId, {
    min_confidence: minConfidence,
  }, { query: { queryKey: getGetCaseGraphQueryKey(caseId, { min_confidence: minConfidence }) } });

  const { data: savedViews } = useListSavedViews(caseId, { limit: 200 }, { query: { queryKey: getListSavedViewsQueryKey(caseId) } });

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  const [selectedEntity, setSelectedEntity] = useState<Entity | null>(null);
  const [selectedRelationship, setSelectedRelationship] = useState<Relationship | null>(null);
  const [hiddenNodes, setHiddenNodes] = useState<Set<string>>(new Set());

  const lastRestoreKey = useRef<string | undefined>(undefined);
  const pendingRestoreKey = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (restoreKey && restoreKey !== lastRestoreKey.current) {
      pendingRestoreKey.current = restoreKey;
      if (initialFilters) {
        if (initialFilters.minConfidence !== undefined) setMinConfidence(initialFilters.minConfidence);
        if (initialFilters.selectedTypes) setSelectedTypes(initialFilters.selectedTypes);
        if (initialFilters.selectedRelTypes) setSelectedRelTypes(initialFilters.selectedRelTypes);
        if (initialFilters.cutoffDate !== undefined) setCutoffDate(initialFilters.cutoffDate);
        if (initialFilters.hiddenNodes) setHiddenNodes(new Set(initialFilters.hiddenNodes));
      }
    }
  }, [restoreKey, initialFilters]);

  // Sync state up to parent when filters change
  useEffect(() => {
    if (onFiltersChange && !pendingRestoreKey.current) {
      onFiltersChange({
        minConfidence,
        selectedTypes,
        selectedRelTypes,
        cutoffDate,
        hiddenNodes: Array.from(hiddenNodes)
      });
    }
  }, [minConfidence, selectedTypes, selectedRelTypes, cutoffDate, hiddenNodes, onFiltersChange]);

  // Sync positions up to parent when they change
  const onNodeDragStop = useCallback(() => {
    if (onPositionsChange && getNodes().length > 0) {
      const posMap = getNodes().reduce((acc, n) => ({ ...acc, [n.id]: n.position }), {});
      onPositionsChange(posMap);
    }
  }, [onPositionsChange, getNodes]);

  const onMoveEnd = useCallback((event: any, viewport: any) => {
    if (onViewportChange) {
      onViewportChange(viewport);
    }
  }, [onViewportChange]);

  // Clear UI state when caseId changes
  useEffect(() => {
    setSelectedEntity(null);
    setSelectedRelationship(null);
    setActiveViewId(null);
    if (!restoreKey || restoreKey === "default") {
      setHiddenNodes(new Set());
      setCutoffDate("");
    }
  }, [caseId, restoreKey]);

  const viewAppliedRef = useRef<string | null>(null);

  // Initialize graph
  useEffect(() => {
    if (!graph) return;

    const isCutoffPassed = (dateStr?: string | null) => {
      if (!cutoffDate || !dateStr) return false;
      return new Date(dateStr) > new Date(cutoffDate);
    };

    // Filter nodes/edges based on selected types, cutoff, and manual hidden nodes
    const filteredNodes = graph.nodes.filter(n => {
      if (selectedTypes.length > 0 && !selectedTypes.includes(n.type)) return false;
      if (hiddenNodes.has(n.id)) return false;
      if (isCutoffPassed(n.created_at)) return false;
      return true;
    });

    const filteredNodeIds = new Set(filteredNodes.map(n => n.id));

    const filteredEdges = graph.edges.filter(e => {
      if (selectedRelTypes.length > 0 && !selectedRelTypes.includes(e.type)) return false;
      if (isCutoffPassed(e.created_at)) return false;
      if (!filteredNodeIds.has(e.source_id) || !filteredNodeIds.has(e.target_id)) return false;
      return true;
    });

    const restorePending = Boolean(
      restoreKey
      && pendingRestoreKey.current === restoreKey
      && lastRestoreKey.current !== restoreKey
    );

    setNodes(currentNodes => {
      const posMap = new Map(currentNodes.map(n => [n.id, n.position]));
      const restoredPositions = restorePending && initialPositions
        ? initialPositions as Record<string, { x: number; y: number }>
        : undefined;

      let newNodes: Node[] = filteredNodes.map(entity => ({
        id: entity.id,
        type: 'entity',
        position: restoredPositions?.[entity.id] || posMap.get(entity.id) || { x: 0, y: 0 },
        data: { entity },
      }));

      // If an active view is selected and we haven't applied it yet
      if (activeViewId && savedViews && viewAppliedRef.current !== activeViewId) {
        const view = savedViews.find(v => v.id === activeViewId);
        if (view?.positions) {
          const positions = view.positions as Record<string, { x: number, y: number }>;
          newNodes = newNodes.map(n => ({
            ...n,
            position: positions[n.id] || n.position
          }));
          if (view.viewport) {
            const vp = view.viewport as { x: number, y: number, zoom: number };
            setViewport(vp);
          }
        }
        viewAppliedRef.current = activeViewId;
      } else if (activeViewId === null) {
        viewAppliedRef.current = null;
      }

      if (restorePending) {
        if (
          initialViewport
          && Number.isFinite(initialViewport.x)
          && Number.isFinite(initialViewport.y)
          && Number.isFinite(initialViewport.zoom)
        ) {
          setTimeout(() => setViewport(initialViewport), 0);
        }
        lastRestoreKey.current = restoreKey;
        pendingRestoreKey.current = undefined;
      }

      // Only apply the default layout when no saved snapshot is being restored.
      const missingPos = newNodes.filter(n => n.position.x === 0 && n.position.y === 0);
      if (!restorePending && missingPos.length === newNodes.length && newNodes.length > 0) {
        newNodes = layoutNodes(newNodes);
        setTimeout(() => fitView({ padding: 0.2 }), 100);
      }

      return newNodes;
    });

    const newEdges: Edge[] = filteredEdges.map(rel => ({
      id: rel.id,
      source: rel.source_id,
      target: rel.target_id,
      type: 'relationship',
      data: { relationship: rel },
      markerEnd: { type: MarkerType.ArrowClosed },
    }));

    setEdges(newEdges);

  }, [graph, selectedTypes, selectedRelTypes, cutoffDate, hiddenNodes, activeViewId, savedViews, restoreKey, initialPositions, initialViewport, setNodes, setEdges, fitView, setViewport]);

  const toggleNodeExpansion = useCallback((nodeId: string) => {
    if (!graph) return;
    const neighbors = new Set<string>();
    graph.edges.forEach(e => {
      if (e.source_id === nodeId) neighbors.add(e.target_id);
      if (e.target_id === nodeId) neighbors.add(e.source_id);
    });

    setHiddenNodes(prev => {
      const next = new Set(prev);
      const anyHidden = Array.from(neighbors).some(nId => next.has(nId));
      if (anyHidden) {
        neighbors.forEach(nId => next.delete(nId));
      } else {
        neighbors.forEach(nId => next.add(nId));
      }
      return next;
    });
  }, [graph]);

  const onNodeDoubleClick = useCallback((_: React.MouseEvent, node: Node) => {
    toggleNodeExpansion(node.id);
  }, [toggleNodeExpansion]);


  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedEntity(node.data.entity as Entity);
    setSelectedRelationship(null);
    onSelectEntity?.((node.data.entity as Entity).id);
  }, [onSelectEntity]);

  const onEdgeClick = useCallback((_: React.MouseEvent, edge: Edge) => {
    setSelectedRelationship(edge.data?.relationship as Relationship);
    setSelectedEntity(null);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedEntity(null);
    setSelectedRelationship(null);
    onSelectEntity?.("");
  }, [onSelectEntity]);

  if (isLoading) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground gap-3">
        <Loader2 className="w-8 h-8 animate-spin" />
        <p>Loading graph...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center text-destructive gap-3">
        <AlertCircle className="w-8 h-8" />
        <p>Failed to load case graph.</p>
        <Button variant="outline" onClick={() => refetch()}>Retry</Button>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex relative">
      <div className="flex-1 h-full relative">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeDragStop={onNodeDragStop}
          onNodeClick={onNodeClick}
          onNodeDoubleClick={onNodeDoubleClick}
          onEdgeClick={onEdgeClick}
          onPaneClick={onPaneClick}
          onMoveEnd={onMoveEnd}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          minZoom={0.1}
          maxZoom={4}
          className="bg-muted/10"
        >
          <Background color="#ccc" gap={16} />
          <Controls />
          <MiniMap zoomable pannable />

          <Panel position="top-left">
            <GraphToolbar
              minConfidence={minConfidence}
              setMinConfidence={setMinConfidence}
              selectedTypes={selectedTypes}
              setSelectedTypes={setSelectedTypes}
              selectedRelTypes={selectedRelTypes}
              setSelectedRelTypes={setSelectedRelTypes}
              cutoffDate={cutoffDate}
              setCutoffDate={setCutoffDate}
              activeViewId={activeViewId}
              setActiveViewId={setActiveViewId}
              savedViews={savedViews || []}
              nodes={nodes}
            />
          </Panel>
          {graph?.truncation?.truncated && (
            <Panel position="top-right">
              <div className="max-w-xs rounded-md border border-warning/40 bg-background/95 px-3 py-2 text-xs text-warning shadow-sm">
                Graph limit reached. Some
                {graph.truncation.nodes_truncated ? ' entities' : ''}
                {graph.truncation.nodes_truncated && graph.truncation.edges_truncated ? ' and' : ''}
                {graph.truncation.edges_truncated ? ' relationships' : ''} are not shown.
              </div>
            </Panel>
          )}
        </ReactFlow>
      </div>

      {(selectedEntity || selectedRelationship) && !onSelectEntity && (
        <GraphInspector
          entity={selectedEntity}
          relationship={selectedRelationship}
          onClose={() => {
            setSelectedEntity(null);
            setSelectedRelationship(null);
          }}
        />
      )}
    </div>
  );
}

export function GraphBoard({
  onSelectEntity,
  restoreKey,
  initialPositions,
  initialViewport,
  initialFilters,
  onPositionsChange,
  onViewportChange,
  onFiltersChange
}: {
  onSelectEntity?: (id: string) => void,
  restoreKey?: string,
  initialPositions?: any,
  initialViewport?: any,
  initialFilters?: any,
  onPositionsChange?: (pos: any) => void,
  onViewportChange?: (vp: any) => void,
  onFiltersChange?: (filters: any) => void
}) {
  return (
    <ReactFlowProvider>
      <GraphBoardInner
        onSelectEntity={onSelectEntity}
        restoreKey={restoreKey}
        initialPositions={initialPositions}
        initialViewport={initialViewport}
        initialFilters={initialFilters}
        onPositionsChange={onPositionsChange}
        onViewportChange={onViewportChange}
        onFiltersChange={onFiltersChange}
      />
    </ReactFlowProvider>
  );
}
