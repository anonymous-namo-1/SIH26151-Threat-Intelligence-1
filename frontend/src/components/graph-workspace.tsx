"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Background,
  BackgroundVariant,
  BaseEdge,
  Controls,
  EdgeLabelRenderer,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  getBezierPath,
  useNodesState,
  useReactFlow,
  type EdgeProps,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  AtSign,
  Bug,
  Check,
  ChevronDown,
  Crosshair,
  FileText,
  Fingerprint,
  Globe2,
  KeyRound,
  Layers2,
  Maximize,
  Network,
  PanelRightOpen,
  SearchX,
  Server,
  SlidersHorizontal,
  Target,
  UserRound,
  Wallet,
} from "lucide-react";
import type { CaseBundle, GraphEdge, GraphNode, NodeType } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { AnalystPanel, type Selection } from "@/components/analyst-panel";

export const nodeAppearance: Record<
  NodeType,
  { icon: typeof UserRound; label: string; color: string }
> = {
  actor: { icon: UserRound, label: "Threat actor", color: "#ee858b" },
  alias: { icon: Fingerprint, label: "Alias", color: "#7ea8ee" },
  wallet: { icon: Wallet, label: "Crypto wallet", color: "#dbb16b" },
  pgp: { icon: KeyRound, label: "PGP key", color: "#7cb8bb" },
  telegram: { icon: AtSign, label: "Contact", color: "#77b8e4" },
  email: { icon: AtSign, label: "Email", color: "#77b8e4" },
  domain: { icon: Globe2, label: "Domain", color: "#70c8ca" },
  ip: { icon: Server, label: "IP address", color: "#70c8ca" },
  onion: { icon: Layers2, label: "Onion metadata", color: "#8ba4b8" },
  malware: { icon: Bug, label: "Malware", color: "#e29a87" },
  mitre: { icon: Target, label: "MITRE technique", color: "#e29a87" },
  evidence: { icon: FileText, label: "Source / evidence", color: "#96a3b5" },
  cve: { icon: Bug, label: "Vulnerability", color: "#e29a87" },
};

type FlowNode = Node<{ entity: GraphNode; dimmed: boolean }, "intelligence">;
function IntelligenceNode({ data, selected }: NodeProps<FlowNode>) {
  const { entity, dimmed } = data;
  const appearance = nodeAppearance[entity.type] || nodeAppearance.evidence;
  const Icon = appearance.icon;
  const isActor = entity.type === "actor";
  return (
    <div
      className={`intel-node ${isActor ? "actor-node" : ""} ${selected ? "selected" : ""} ${dimmed ? "dimmed" : ""} ${entity.riskLevel === "critical" || entity.riskLevel === "high" ? "high-risk" : ""}`}
      style={{ "--node-color": appearance.color } as React.CSSProperties}
      title={`${entity.label} · ${appearance.label} · ${Math.round(entity.confidence * 100)}% confidence`}
    >
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
      <div className="node-orbit">
        <span className="node-corner top-left" />
        <span className="node-corner bottom-right" />
        <div className="node-core">
          <Icon size={isActor ? 30 : 22} strokeWidth={1.5} />
        </div>
        {isActor && <span className="actor-status-dot" />}
        {selected && (
          <span className="node-selected-mark">
            <Check size={9} />
          </span>
        )}
      </div>
      <div className="node-label">{entity.label}</div>
      <div className="node-type">{appearance.label}</div>
    </div>
  );
}

function IntelligenceEdge(props: EdgeProps) {
  const [path, labelX, labelY] = getBezierPath({ ...props, curvature: 0.22 });
  const entity = props.data?.entity as GraphEdge | undefined;
  const high = (entity?.confidence || 0) >= 0.9;
  const color = props.selected ? "#c8f5fa" : high ? "#469ca9" : "#334451";
  return (
    <>
      <BaseEdge
        id={props.id}
        path={path}
        interactionWidth={24}
        style={{
          stroke: color,
          strokeWidth: props.selected ? 2 : high ? 1.3 : 1,
          opacity: props.data?.dimmed?.valueOf() ? 0.16 : 1,
          filter: high ? "drop-shadow(0 0 4px #49bfcc33)" : undefined,
        }}
      />
      {high && (
        <path
          d={path}
          className="signal-trail"
          fill="none"
          stroke="#a4edf1"
          strokeWidth={1.5}
          strokeDasharray="3 170"
          pointerEvents="none"
        />
      )}
      {(props.selected || entity?.type === "resolved_candidate") && (
        <EdgeLabelRenderer>
          <div
            className={`edge-caption ${props.selected ? "selected" : ""}`}
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
          >
            {entity?.label}
            <span>{Math.round((entity?.confidence || 0) * 100)}%</span>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
const nodeTypes = { intelligence: IntelligenceNode };
const edgeTypes = { intelligence: IntelligenceEdge };

function layoutNodes(nodes: GraphNode[]): FlowNode[] {
  const main =
    nodes.find((n) => n.type === "actor") ||
    nodes.find((n) => n.type === "alias") ||
    nodes[0];
  const others = nodes.filter((n) => n.id !== main?.id);
  return nodes.map((n) => {
    const index = others.findIndex((other) => other.id === n.id);
    const ringIndex = Math.floor(Math.max(index, 0) / 12);
    const ringCount = Math.min(12, others.length - ringIndex * 12);
    const angle =
      ((index % 12) / Math.max(ringCount, 1)) * Math.PI * 2 -
      Math.PI / 2 +
      ringIndex * 0.2;
    const ring = 320 + ringIndex * 230;
    return {
      id: n.id,
      type: "intelligence",
      position: n.position
        ? { x: n.position.x * 0.79, y: n.position.y * 0.79 }
        : n.id === main?.id
          ? { x: 470, y: 330 }
          : {
              x: 470 + Math.cos(angle) * ring,
              y: 330 + Math.sin(angle) * ring * 0.74,
            },
      data: { entity: n, dimmed: false },
      ariaLabel: `${n.label}, ${nodeAppearance[n.type]?.label || n.type}`,
    };
  });
}

export function GraphWorkspace(props: {
  bundle: CaseBundle;
  searchNodeId: string | null;
  searchSequence: number;
}) {
  return (
    <ReactFlowProvider>
      <GraphCanvas {...props} />
    </ReactFlowProvider>
  );
}

function GraphCanvas({
  bundle,
  searchNodeId,
  searchSequence,
}: {
  bundle: CaseBundle;
  searchNodeId: string | null;
  searchSequence: number;
}) {
  const [selection, setSelection] = useState<Selection>(null);
  const [panelOpen, setPanelOpen] = useState(true);
  const [filterOpen, setFilterOpen] = useState(false);
  const [highOnly, setHighOnly] = useState(false);
  const [showMinimap, setShowMinimap] = useState(true);
  const [hiddenTypes, setHiddenTypes] = useState<NodeType[]>([]);
  const [focusOnly, setFocusOnly] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const { fitView, setCenter, getNode } = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState(
    layoutNodes(bundle.graph.nodes),
  );
  const selectedNode = selection?.kind === "node" ? selection.node : null;
  const connectedIds = useMemo(() => {
    const ids = new Set<string>();
    if (selectedNode) {
      ids.add(selectedNode.id);
      bundle.graph.edges
        .filter(
          (e) => e.source === selectedNode.id || e.target === selectedNode.id,
        )
        .forEach((e) => {
          ids.add(e.source);
          ids.add(e.target);
        });
    }
    return ids;
  }, [selectedNode, bundle.graph.edges]);
  const visibleIds = useMemo(
    () =>
      new Set(
        nodes
          .filter(
            (n) =>
              !hiddenTypes.includes(n.data.entity.type) &&
              (!focusOnly || !selectedNode || connectedIds.has(n.id)),
          )
          .map((n) => n.id),
      ),
    [nodes, hiddenTypes, focusOnly, selectedNode, connectedIds],
  );
  const visibleNodes = useMemo(
    () =>
      nodes.map((n) => ({
        ...n,
        hidden: !visibleIds.has(n.id),
        selected: selectedNode?.id === n.id,
        data: { ...n.data, dimmed: !!selectedNode && !connectedIds.has(n.id) },
      })),
    [nodes, visibleIds, selectedNode, connectedIds],
  );
  const edges = useMemo(
    () =>
      bundle.graph.edges
        .filter(
          (e) =>
            visibleIds.has(e.source) &&
            visibleIds.has(e.target) &&
            (!highOnly || e.confidence >= 0.9),
        )
        .map((e) => ({
          id: e.id,
          source: e.source,
          target: e.target,
          type: "intelligence",
          selected: selection?.kind === "edge" && selection.edge.id === e.id,
          data: {
            entity: e,
            dimmed:
              !!selectedNode &&
              !connectedIds.has(e.source) &&
              !connectedIds.has(e.target),
          },
          ariaLabel: `${e.label}, ${Math.round(e.confidence * 100)}% confidence`,
        })),
    [
      bundle.graph.edges,
      visibleIds,
      highOnly,
      selection,
      selectedNode,
      connectedIds,
    ],
  );
  const types = Array.from(new Set(bundle.graph.nodes.map((n) => n.type)));

  useEffect(() => {
    if (window.innerWidth < 1051) setPanelOpen(false);
  }, []);
  useEffect(
    () => setNodes(layoutNodes(bundle.graph.nodes)),
    [bundle.graph.nodes, setNodes],
  );
  useEffect(() => {
    const timer = setTimeout(
      () => fitView({ padding: 0.17, duration: 350, maxZoom: 1.1 }),
      160,
    );
    return () => clearTimeout(timer);
  }, [panelOpen, fitView]);
  useEffect(() => {
    if (!searchNodeId) return;
    const entity = bundle.graph.nodes.find((n) => n.id === searchNodeId);
    if (entity) {
      setHiddenTypes([]);
      setFocusOnly(false);
      setSelection({ kind: "node", node: entity });
      setPanelOpen(true);
      const timer = setTimeout(() => {
        const n = getNode(entity.id);
        if (n)
          setCenter(n.position.x + 65, n.position.y + 45, {
            zoom: 1.15,
            duration: 600,
          });
      }, 180);
      return () => clearTimeout(timer);
    }
  }, [searchNodeId, searchSequence, bundle.graph.nodes, getNode, setCenter]);
  const selectNode = useCallback((node: GraphNode) => {
    setSelection({ kind: "node", node });
    setPanelOpen(true);
  }, []);

  return (
    <div className={`graph-workspace ${panelOpen ? "inspector-open" : ""}`}>
      <div className="graph-toolbar">
        <div className="graph-toolbar-title">
          <Network size={16} />
          <h2>Relationship graph</h2>
          <span className="live-tag">
            <i />
            LIVE VIEW
          </span>
        </div>
        <div className="graph-toolbar-actions">
          <button
            className={`confidence-toggle ${highOnly ? "active" : ""}`}
            aria-label="Toggle high confidence connections"
            aria-pressed={highOnly}
            onClick={() => setHighOnly((v) => !v)}
          >
            <span className="connection-indicator" />
            {highOnly ? "High confidence" : "All connections"}
            <ChevronDown size={12} />
          </button>
          <div className="filter-anchor">
            <Button
              variant="ghost"
              size="sm"
              aria-label="Filter graph"
              aria-expanded={filterOpen}
              onClick={() => setFilterOpen((v) => !v)}
            >
              <SlidersHorizontal />
              <span className="filter-text">
                Filters
                {hiddenTypes.length > 0 ? ` (${hiddenTypes.length})` : ""}
              </span>
            </Button>
            {filterOpen && (
              <div className="filter-popover">
                <div>
                  <span className="eyebrow">ENTITY TYPES</span>
                  <button onClick={() => setHiddenTypes([])}>Reset</button>
                </div>
                {types.map((t) => (
                  <label key={t}>
                    <input
                      type="checkbox"
                      checked={!hiddenTypes.includes(t)}
                      onChange={() =>
                        setHiddenTypes((v) =>
                          v.includes(t) ? v.filter((x) => x !== t) : [...v, t],
                        )
                      }
                    />
                    <span style={{ background: nodeAppearance[t].color }} />
                    {nodeAppearance[t].label}
                  </label>
                ))}
              </div>
            )}
          </div>
          <span className="toolbar-separator" />
          <Button
            variant="ghost"
            size="icon"
            aria-label="Fit graph"
            title="Fit all nodes"
            onClick={() =>
              fitView({ padding: 0.17, duration: 500, maxZoom: 1.1 })
            }
          >
            <Maximize />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={
              panelOpen ? "Close analyst panel" : "Show analyst panel"
            }
            title="Toggle inspector"
            onClick={() => setPanelOpen((v) => !v)}
          >
            <PanelRightOpen />
          </Button>
        </div>
      </div>
      <div className="canvas-area" ref={stageRef}>
        <div className="canvas-coordinate coordinate-top">
          ARGUS / RELATIONSHIP ENGINE<span>01 — CASE NETWORK</span>
        </div>
        <div className="flow-stage">
          <ReactFlow
            nodes={visibleNodes}
            edges={edges}
            onNodesChange={onNodesChange}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodeClick={(_, n) => selectNode(n.data.entity)}
            onEdgeClick={(_, e) => {
              setSelection({ kind: "edge", edge: e.data!.entity });
              setPanelOpen(true);
            }}
            onPaneClick={() => {
              setSelection(null);
              setFocusOnly(false);
              setFilterOpen(false);
            }}
            fitView
            fitViewOptions={{ padding: 0.17, maxZoom: 1.1 }}
            minZoom={0.15}
            maxZoom={2.5}
            nodesConnectable={false}
            deleteKeyCode={null}
            colorMode="dark"
            attributionPosition="top-right"
            onlyRenderVisibleElements={false}
            ariaLabelConfig={{
              "controls.zoomIn.ariaLabel": "Zoom in",
              "controls.zoomOut.ariaLabel": "Zoom out",
              "controls.fitView.ariaLabel": "Fit view",
              "minimap.ariaLabel": "Investigation minimap",
            }}
          >
            <Background
              variant={BackgroundVariant.Dots}
              color="#25313c"
              gap={23}
              size={1}
            />
            <Controls showInteractive={false} />
            {showMinimap && (
              <MiniMap
                nodeColor={(n) =>
                  nodeAppearance[(n.data.entity as GraphNode).type]?.color ||
                  "#8090a3"
                }
                maskColor="rgba(8,12,17,.75)"
                bgColor="#0e141c"
                nodeStrokeWidth={0}
                pannable
                zoomable
              />
            )}
          </ReactFlow>
          <div className="canvas-watermark">
            <div className="radar-ring" />
            <div className="radar-ring inner" />
            <Crosshair size={24} />
          </div>
          {!visibleIds.size && (
            <div className="canvas-empty">
              <SearchX size={28} />
              <h3>
                {bundle.graph.nodes.length
                  ? "No entities match your filters"
                  : "Your graph is ready for its first signal"}
              </h3>
              <p>
                {bundle.graph.nodes.length
                  ? "Adjust the entity types to bring connections back into view."
                  : "Add source text or supplied metadata to build this investigation."}
              </p>
              {bundle.graph.nodes.length ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    setHiddenTypes([]);
                    setFocusOnly(false);
                  }}
                >
                  Reset filters
                </Button>
              ) : (
                <Button asChild>
                  <Link
                    href={`/cases/${encodeURIComponent(bundle.case.id)}/ingest`}
                  >
                    Add intelligence
                  </Link>
                </Button>
              )}
            </div>
          )}
        </div>
        <div className="canvas-utility">
          <button
            aria-label="Toggle minimap"
            className={showMinimap ? "active" : ""}
            onClick={() => setShowMinimap((v) => !v)}
            title="Toggle minimap"
          >
            <Layers2 size={16} />
          </button>
          {selectedNode && (
            <button
              className={`focus-button ${focusOnly ? "active" : ""}`}
              onClick={() => {
                setFocusOnly((v) => !v);
                setTimeout(() => fitView({ padding: 0.25, duration: 400 }), 60);
              }}
            >
              <Crosshair size={14} />
              {focusOnly ? "Show full network" : "Focus connections"}
            </button>
          )}
        </div>
        {panelOpen && (
          <AnalystPanel
            bundle={bundle}
            selection={selection}
            onClose={() => setPanelOpen(false)}
            onClear={() => {
              setSelection(null);
              setFocusOnly(false);
            }}
            containerRef={stageRef}
          />
        )}
      </div>
      <div className="graph-statusbar">
        <div className="graph-counts">
          <i />
          <span>
            <strong>{visibleIds.size}</strong> nodes
          </span>
          <span className="status-divider" />
          <span>
            <strong>{edges.length}</strong> relationships
          </span>
        </div>
        <div className="graph-legend">
          <span>
            <i className="legend-actor" />
            Actor
          </span>
          <span>
            <i className="legend-identifier" />
            Identifier
          </span>
          <span>
            <i className="legend-infra" />
            Infrastructure
          </span>
          <span>
            <i className="legend-evidence" />
            Evidence
          </span>
        </div>
        <span className="canvas-hint">
          Scroll to zoom <span>·</span> Drag to explore
        </span>
      </div>
    </div>
  );
}
