import { useState } from 'react';
import { useFindEntityPath, getFindEntityPathQueryKey } from '@workspace/api-client-react';
import { useCaseWorkspace } from '@/hooks/use-case-workspace';
import { Node, useReactFlow } from '@xyflow/react';
import { Route as RouteIcon, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from 'sonner';

export function ShortestPathFinder({ nodes }: { nodes: Node[] }) {
  const { caseId } = useCaseWorkspace();
  const [sourceId, setSourceId] = useState("");
  const [targetId, setTargetId] = useState("");
  const { setNodes, setEdges } = useReactFlow();
  
  const { refetch, isFetching } = useFindEntityPath(
    caseId, 
    { source: sourceId, target: targetId },
    { query: { enabled: false, retry: false, queryKey: getFindEntityPathQueryKey(caseId, { source: sourceId, target: targetId }) } }
  );

  const handleFind = async () => {
    if (!sourceId || !targetId || !caseId) return;

    const { data, isError } = await refetch();
    
    if (isError || !data) {
      toast.error("Error finding path");
      return;
    }

    if (!data.found) {
      toast.info("No path found between these entities");
      clearHighlight();
      return;
    }

    const pathNodeIds = new Set(data.nodes.map((n: any) => n.id));
    const pathEdgeIds = new Set(data.edges.map((e: any) => e.id));

    setNodes(nds => nds.map(n => ({
      ...n,
      style: { ...n.style, opacity: pathNodeIds.has(n.id) ? 1 : 0.1 }
    })));

    setEdges(eds => eds.map(e => ({
      ...e,
      style: { ...e.style, opacity: pathEdgeIds.has(e.id) ? 1 : 0.1, strokeWidth: pathEdgeIds.has(e.id) ? 3 : 1 }
    })));

    toast.success("Path highlighted");
  };

  const clearHighlight = () => {
    setSourceId("");
    setTargetId("");
    setNodes(nds => nds.map(n => ({ ...n, style: { ...n.style, opacity: 1 } })));
    setEdges(eds => eds.map(e => ({ ...e, style: { ...e.style, opacity: 1, strokeWidth: 2 } })));
  };

  return (
    <div className="flex flex-col gap-2 bg-card p-3 rounded-md border shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <RouteIcon className="w-3.5 h-3.5" /> Shortest Path
        </h3>
        {(sourceId || targetId) && (
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={clearHighlight}>
            <X className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>

      <div className="space-y-2 mt-1">
        <NodeSelector value={sourceId} onChange={setSourceId} nodes={nodes} placeholder="Source entity..." />
        <NodeSelector value={targetId} onChange={setTargetId} nodes={nodes} placeholder="Target entity..." />
        
        <Button 
          variant="secondary" 
          size="sm" 
          className="w-full text-xs" 
          disabled={!sourceId || !targetId || isFetching}
          onClick={handleFind}
        >
          {isFetching ? 'Searching...' : 'Find Path'}
        </Button>
      </div>
    </div>
  );
}

function NodeSelector({ value, onChange, nodes, placeholder }: { value: string, onChange: (v: string) => void, nodes: Node[], placeholder: string }) {
  const [open, setOpen] = useState(false);
  const selected = nodes.find(n => n.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          className={cn("w-full justify-between font-normal h-8 text-xs px-2", !value && "text-muted-foreground")}
        >
          {selected ? <span className="truncate max-w-[200px]">{(selected.data.entity as any)?.value}</span> : placeholder}
          <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[260px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search..." className="h-8 text-xs" />
          <CommandList className="max-h-[200px]">
            <CommandEmpty>No entity found.</CommandEmpty>
            <CommandGroup>
              {nodes.map((node) => {
                const entity = node.data.entity as any;
                return (
                  <CommandItem
                    key={node.id}
                    value={entity.value}
                    onSelect={() => {
                      onChange(node.id);
                      setOpen(false);
                    }}
                    className="text-xs"
                  >
                    <Check className={cn("mr-2 h-3 w-3", value === node.id ? "opacity-100" : "opacity-0")} />
                    <span className="truncate">{entity.value}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
