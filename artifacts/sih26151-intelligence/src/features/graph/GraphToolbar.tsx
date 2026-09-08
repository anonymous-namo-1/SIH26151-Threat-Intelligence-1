import { useState } from 'react';
import { Node, useReactFlow } from '@xyflow/react';
import { EntityType, RelationshipType, SavedView, useCreateSavedView, useDeleteSavedView, getListSavedViewsQueryKey, useGetMe } from '@workspace/api-client-react';
import { useCaseWorkspace } from '@/hooks/use-case-workspace';
import { Filter, Save, Search, Layers, X, PlusCircle, Link as LinkIcon, Settings2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

import { EntityForm } from '@/features/entities/EntityForm';
import { RelationshipForm } from '@/features/entities/RelationshipForm';
import { ShortestPathFinder } from '@/features/graph/ShortestPathFinder';

type GraphToolbarProps = {
  minConfidence: number;
  setMinConfidence: (v: number) => void;
  selectedTypes: EntityType[];
  setSelectedTypes: (types: EntityType[]) => void;
  selectedRelTypes: RelationshipType[];
  setSelectedRelTypes: (types: RelationshipType[]) => void;
  cutoffDate: string;
  setCutoffDate: (d: string) => void;
  activeViewId: string | null;
  setActiveViewId: (id: string | null) => void;
  savedViews: SavedView[];
  nodes: Node[];
};

const ALL_ENTITY_TYPES = Object.values(EntityType);
const ALL_REL_TYPES = Object.values(RelationshipType);

export function GraphToolbar({
  minConfidence, setMinConfidence,
  selectedTypes, setSelectedTypes,
  selectedRelTypes, setSelectedRelTypes,
  cutoffDate, setCutoffDate,
  activeViewId, setActiveViewId,
  savedViews,
  nodes
}: GraphToolbarProps) {
  const { caseId } = useCaseWorkspace();
  const [search, setSearch] = useState("");
  const { setNodes, getViewport } = useReactFlow();
  const queryClient = useQueryClient();
  
  const createSavedView = useCreateSavedView();
  const deleteSavedView = useDeleteSavedView();
  
  const { data: me } = useGetMe();
  const canEditCase = me?.permissions?.includes("case:edit");

  const handleSaveView = () => {
    const name = prompt("Name this view:");
    if (!name) return;

    const positions = nodes.reduce((acc, node) => {
      acc[node.id] = node.position;
      return acc;
    }, {} as Record<string, any>);

    const viewport = getViewport();

    createSavedView.mutate({
      caseId,
      data: {
        name,
        filters: { minConfidence, selectedTypes, selectedRelTypes, cutoffDate },
        positions,
        viewport
      }
    }, {
      onSuccess: (view) => {
        toast.success("View saved");
        setActiveViewId(view.id);
        queryClient.invalidateQueries({ queryKey: getListSavedViewsQueryKey(caseId) });
      },
      onError: () => toast.error("Failed to save view")
    });
  };

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.toLowerCase();
    setSearch(val);
    setNodes(nds => nds.map(n => {
      const match = val ? (n.data?.entity as any)?.value?.toLowerCase().includes(val) : false;
      return {
        ...n,
        style: { ...n.style, opacity: val && !match ? 0.2 : 1 }
      };
    }));
  };

  const clearFilters = () => {
    setMinConfidence(0);
    setSelectedTypes([]);
    setSelectedRelTypes([]);
    setCutoffDate("");
    setActiveViewId(null);
  };

  const handleViewClick = (view: SavedView) => {
    if (activeViewId === view.id) {
      setActiveViewId(null);
      return;
    }
    setActiveViewId(view.id);
    if (view.filters) {
      const f = view.filters as any;
      setMinConfidence(f.minConfidence ?? 0);
      setSelectedTypes(f.selectedTypes ?? []);
      setSelectedRelTypes(f.selectedRelTypes ?? []);
      setCutoffDate(f.cutoffDate ?? "");
    }
  };

  const [showEntityForm, setShowEntityForm] = useState(false);
  const [showRelForm, setShowRelForm] = useState(false);

  return (
    <div className="flex flex-col gap-2 p-4 w-[300px] pointer-events-auto">
      <div className="flex gap-2">
        {canEditCase && (
          <>
            <Button size="sm" variant="default" className="flex-1 text-xs gap-1.5 shadow-sm" onClick={() => setShowEntityForm(true)}>
              <PlusCircle className="w-3.5 h-3.5" /> Add Entity
            </Button>
            <Button size="sm" variant="secondary" className="flex-1 text-xs gap-1.5 shadow-sm" onClick={() => setShowRelForm(true)}>
              <LinkIcon className="w-3.5 h-3.5" /> Link
            </Button>
          </>
        )}
      </div>

      <div className="flex items-center gap-2 bg-card p-1 rounded-md border shadow-sm">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1.5 h-4 w-4 text-muted-foreground" />
          <Input 
            className="h-8 pl-8 border-0 bg-transparent focus-visible:ring-0 shadow-none text-xs" 
            placeholder="Find in graph..." 
            value={search}
            onChange={handleSearch}
          />
        </div>
      </div>

      <div className="flex flex-col gap-3 bg-card p-3 rounded-md border shadow-sm">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5" /> Filters
          </h3>
          {(minConfidence > 0 || selectedTypes.length > 0 || selectedRelTypes.length > 0) && (
            <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={clearFilters}>
              Clear
            </Button>
          )}
        </div>
        
        <div className="space-y-4 mt-2">
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <Label className="text-xs text-muted-foreground">Min Confidence</Label>
              <span className="font-mono">{Math.round(minConfidence * 100)}%</span>
            </div>
            <Slider 
              value={[minConfidence * 100]} 
              onValueChange={([v]) => setMinConfidence(v / 100)} 
              max={100} 
              step={5} 
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Time Cutoff (Until)</Label>
            <Input 
              type="date" 
              className="h-8 text-xs" 
              value={cutoffDate} 
              onChange={e => setCutoffDate(e.target.value)} 
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground flex justify-between">
              Entity Types
              <TypeSelector 
                options={ALL_ENTITY_TYPES} 
                selected={selectedTypes} 
                onChange={setSelectedTypes} 
                label="Entities" 
              />
            </Label>
            <div className="text-[10px] text-muted-foreground">
              {selectedTypes.length === 0 ? "All selected" : `${selectedTypes.length} selected`}
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground flex justify-between">
              Relationship Types
              <TypeSelector 
                options={ALL_REL_TYPES} 
                selected={selectedRelTypes} 
                onChange={setSelectedRelTypes} 
                label="Relationships" 
              />
            </Label>
            <div className="text-[10px] text-muted-foreground">
              {selectedRelTypes.length === 0 ? "All selected" : `${selectedRelTypes.length} selected`}
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2 bg-card p-3 rounded-md border shadow-sm">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5" /> Saved Views
          </h3>
          {canEditCase && (
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={handleSaveView}>
              <Save className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
        <div className="flex flex-wrap gap-1 mt-1">
          {savedViews.length === 0 && <p className="text-xs text-muted-foreground">No saved views</p>}
          {savedViews.map(view => (
            <Badge 
              key={view.id} 
              variant={activeViewId === view.id ? "default" : "secondary"}
              className="text-[10px] flex items-center pr-1"
            >
              <span className="cursor-pointer px-1 py-0.5" onClick={() => handleViewClick(view)}>
                {view.name}
              </span>
              {canEditCase && (
                <div 
                  className="hover:bg-muted/50 rounded-full p-0.5 ml-1 cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm("Delete this saved view?")) {
                      deleteSavedView.mutate({ viewId: view.id }, {
                        onSuccess: () => {
                          toast.success("View deleted");
                          if (activeViewId === view.id) setActiveViewId(null);
                          queryClient.invalidateQueries({ queryKey: getListSavedViewsQueryKey(caseId) });
                        }
                      });
                    }
                  }}
                >
                  <X className="w-2.5 h-2.5 opacity-50 hover:opacity-100" />
                </div>
              )}
            </Badge>
          ))}
        </div>
      </div>

      <ShortestPathFinder nodes={nodes} />

      <EntityForm open={showEntityForm} onOpenChange={setShowEntityForm} />
      <RelationshipForm open={showRelForm} onOpenChange={setShowRelForm} />
    </div>
  );
}

function TypeSelector<T extends string>({ options, selected, onChange, label }: { options: T[], selected: T[], onChange: (v: T[]) => void, label: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-5 w-5 p-0"><Settings2 className="w-3.5 h-3.5" /></Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-2" align="end">
        <div className="font-semibold text-xs uppercase tracking-wider text-muted-foreground mb-2 px-2">{label} Filter</div>
        <div className="max-h-[200px] overflow-y-auto p-1 space-y-1">
          <div className="flex items-center space-x-2 p-1">
            <Checkbox 
              id="all" 
              checked={selected.length === 0} 
              onCheckedChange={(c) => onChange(c ? [] : options)} 
            />
            <label htmlFor="all" className="text-xs font-medium leading-none cursor-pointer">
              All
            </label>
          </div>
          {options.map(opt => (
            <div key={opt} className="flex items-center space-x-2 p-1">
              <Checkbox 
                id={opt} 
                checked={selected.length === 0 || selected.includes(opt)}
                onCheckedChange={(c) => {
                  if (c) {
                    if (selected.length === 0) return; // already all
                    const next = [...selected, opt];
                    if (next.length === options.length) onChange([]);
                    else onChange(next);
                  } else {
                    if (selected.length === 0) {
                      onChange(options.filter(o => o !== opt));
                    } else {
                      onChange(selected.filter(o => o !== opt));
                    }
                  }
                }}
              />
              <label htmlFor={opt} className="text-xs leading-none cursor-pointer">
                {opt.replace(/_/g, ' ')}
              </label>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
