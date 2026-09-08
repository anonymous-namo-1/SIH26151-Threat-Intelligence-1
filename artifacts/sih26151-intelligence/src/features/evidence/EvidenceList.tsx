import { useState } from 'react';
import { useListEvidence, getListEvidenceQueryKey, type Evidence } from '@workspace/api-client-react';
import { useCaseWorkspace } from '@/hooks/use-case-workspace';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search, ArrowLeft, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';

export function EvidenceList({ selectedId, onSelect }: { selectedId: string | null, onSelect: (e: Evidence) => void }) {
  const { caseId } = useCaseWorkspace();
  const [page, setPage] = useState(1);
  const limit = 50;
  const offset = (page - 1) * limit;

  const { data: evidence, isLoading } = useListEvidence(caseId, { limit, offset }, { query: { queryKey: getListEvidenceQueryKey(caseId, { limit, offset }) } });
  const [search, setSearch] = useState("");

  if (isLoading) return <div className="space-y-3"><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></div>;
  if (!evidence) return <div className="text-sm text-muted-foreground p-4">No evidence found.</div>;

  const filtered = evidence.filter(e => 
    e.source.toLowerCase().includes(search.toLowerCase()) || 
    e.type.toLowerCase().includes(search.toLowerCase()) ||
    e.notes?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full bg-card border rounded-lg overflow-hidden">
      <div className="p-3 border-b bg-muted/20">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search evidence..." 
            className="pl-9 h-9 text-sm bg-background"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {!filtered.length && (
          <div className="p-4 text-center text-sm text-muted-foreground">No matches</div>
        )}
        {filtered.map(item => (
          <div 
            key={item.id}
            onClick={() => onSelect(item)}
            className={`p-3 rounded-md border cursor-pointer transition-colors ${selectedId === item.id ? 'bg-primary/10 border-primary/30' : 'bg-background hover:bg-muted/50'}`}
          >
            <div className="flex justify-between items-start mb-1">
              <span className="font-semibold text-sm line-clamp-1">{item.source || "Unknown Source"}</span>
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">{item.type}</Badge>
            </div>
            <div className="text-xs text-muted-foreground flex justify-between items-center mt-2">
              <span className="font-mono">{format(new Date(item.collected_at), 'MMM d, yyyy')}</span>
              <Badge variant="secondary" className="text-[10px] px-1 bg-muted">Rel: {item.reliability}</Badge>
            </div>
          </div>
        ))}
      </div>
      <div className="p-2 border-t flex justify-between items-center bg-muted/10">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <span className="text-[10px] font-mono text-muted-foreground">Pg {page}</span>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setPage(p => p + 1)} disabled={evidence.length < limit}>
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
