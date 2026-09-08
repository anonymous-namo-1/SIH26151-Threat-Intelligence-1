import { memo } from 'react';
import { BaseEdge, EdgeLabelRenderer, EdgeProps, getBezierPath } from '@xyflow/react';
import { Relationship } from '@workspace/api-client-react';

export const RelationshipEdge = memo((props: EdgeProps & { data?: { relationship: Relationship } }) => {
  const {
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    style = {},
    markerEnd,
    data,
    selected
  } = props;

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const confidence = data?.relationship?.confidence ?? 1;
  const isLowConfidence = confidence < 0.5;

  return (
    <>
      <BaseEdge 
        path={edgePath} 
        markerEnd={markerEnd} 
        style={{
          ...style,
          strokeWidth: selected ? 3 : 2,
          stroke: selected ? 'hsl(var(--primary))' : (isLowConfidence ? 'hsl(var(--warning))' : 'hsl(var(--border))'),
          strokeDasharray: isLowConfidence ? '5,5' : 'none'
        }} 
      />
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            pointerEvents: 'all',
          }}
          className="nodrag nopan"
        >
          <div className={`px-2 py-1 rounded-md text-[10px] uppercase font-semibold tracking-wider bg-background border shadow-sm ${selected ? 'border-primary text-primary' : 'text-muted-foreground'}`}>
            {data?.relationship?.type?.replace('_', ' ') || 'RELATES TO'}
          </div>
        </div>
      </EdgeLabelRenderer>
    </>
  );
});

RelationshipEdge.displayName = 'RelationshipEdge';
