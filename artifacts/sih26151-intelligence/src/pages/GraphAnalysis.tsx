import { useCallback, useState } from 'react';
import {
  ReactFlow,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  ConnectionLineType,
  MarkerType
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { mockActors, mockInfrastructure, mockWallets, mockPersonas, mockRelationships } from '@/data/mock';

// Generate nodes from mock data
const initialNodes = [
  ...mockActors.map(a => ({
    id: a.id,
    position: { x: 400, y: 300 },
    data: { label: a.name, type: 'ACTOR', threatLevel: a.threatLevel },
    style: { 
      background: 'hsl(var(--card))', 
      border: `2px solid ${a.threatLevel === 'CRITICAL' ? 'hsl(var(--destructive))' : 'hsl(var(--primary))'}`,
      borderRadius: '8px',
      padding: '10px 15px',
      color: 'hsl(var(--foreground))',
      fontWeight: 'bold',
      width: 180,
      textAlign: 'center' as const
    }
  })),
  ...mockInfrastructure.map((inf, i) => ({
    id: inf.id,
    position: { x: 200 + i * 150, y: 150 },
    data: { label: inf.value, type: 'INFRA' },
    style: { 
      background: 'hsl(var(--card))', 
      border: '1px solid hsl(var(--border))',
      borderLeft: '4px solid hsl(var(--chart-2))',
      borderRadius: '4px',
      padding: '8px 12px',
      color: 'hsl(var(--foreground))',
      fontSize: '12px'
    }
  })),
  ...mockWallets.map((w, i) => ({
    id: w.id,
    position: { x: 600 + i * 150, y: 450 },
    data: { label: w.address.slice(0, 12) + '...', type: 'WALLET' },
    style: { 
      background: 'hsl(var(--card))', 
      border: '1px solid hsl(var(--border))',
      borderLeft: '4px solid hsl(var(--warning))',
      borderRadius: '4px',
      padding: '8px 12px',
      color: 'hsl(var(--foreground))',
      fontSize: '12px',
      fontFamily: 'var(--font-mono)'
    }
  })),
  ...mockPersonas.map((p, i) => ({
    id: p.id,
    position: { x: 200 + i * 150, y: 450 },
    data: { label: p.handle, type: 'PERSONA' },
    style: { 
      background: 'hsl(var(--card))', 
      border: '1px solid hsl(var(--border))',
      borderLeft: '4px solid hsl(var(--chart-5))',
      borderRadius: '4px',
      padding: '8px 12px',
      color: 'hsl(var(--foreground))',
      fontSize: '12px'
    }
  }))
];

const initialEdges = mockRelationships.map(r => ({
  id: r.id,
  source: r.sourceId,
  target: r.targetId,
  label: r.type,
  animated: r.type === 'TRANSFERS_TO' || r.type === 'COMMUNICATES_WITH',
  style: { stroke: 'hsl(var(--muted-foreground))' },
  labelStyle: { fill: 'hsl(var(--foreground))', fontWeight: 500, fontSize: 10 },
  labelBgStyle: { fill: 'hsl(var(--background))', fillOpacity: 0.8 },
  markerEnd: { type: MarkerType.ArrowClosed, color: 'hsl(var(--muted-foreground))' }
}));

export function GraphAnalysis() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const onConnect = useCallback(
    (params: any) => setEdges((eds) => addEdge(params, eds)),
    [setEdges],
  );

  return (
    <div className="h-[calc(100vh-120px)] w-full border border-border rounded-lg bg-background overflow-hidden relative">
      <div className="absolute top-4 left-4 z-10 bg-card/80 backdrop-blur border border-border p-3 rounded-md shadow-sm">
        <h3 className="text-sm font-semibold mb-2">Legend</h3>
        <div className="space-y-2 text-xs">
          <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-sm border-2 border-destructive bg-card" /> Threat Actor</div>
          <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-sm border border-border border-l-4 border-l-chart-2 bg-card" /> Infrastructure</div>
          <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-sm border border-border border-l-4 border-l-warning bg-card" /> Wallet</div>
          <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-sm border border-border border-l-4 border-l-chart-5 bg-card" /> Persona</div>
        </div>
      </div>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        connectionLineType={ConnectionLineType.SmoothStep}
        fitView
      >
        <Controls className="bg-card border-border fill-foreground" />
        <Background color="hsl(var(--border))" gap={16} size={1} />
      </ReactFlow>
    </div>
  );
}
