import { useLocation } from 'wouter';
import { useCaseWorkspace, CaseScope } from '@/hooks/use-case-workspace';
import { useListEntities, getListEntitiesQueryKey } from '@workspace/api-client-react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Search, Loader2, Users, AlertTriangle, ArrowLeft, ArrowRight } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

function EntitiesList() {
  const [, setLocation] = useLocation();
  const { caseId } = useCaseWorkspace();
  const [search, setSearch] = useState('');
  
  const [page, setPage] = useState(1);
  const limit = 50;
  const offset = (page - 1) * limit;
  
  const { data: entities, isLoading, error } = useListEntities(caseId, { limit, offset }, { query: { enabled: !!caseId, queryKey: getListEntitiesQueryKey(caseId, { limit, offset }) } });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return <div className="p-4 text-destructive border border-destructive/20 bg-destructive/10 rounded-md font-mono text-sm">Failed to load entities.</div>;
  }

  const filtered = entities?.filter(e => 
    e.value.toLowerCase().includes(search.toLowerCase()) || 
    e.type.toLowerCase().includes(search.toLowerCase())
  ) || [];

  return (
    <div className="space-y-6">
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input 
          placeholder="Filter entities by value or type..." 
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9 font-mono text-sm"
        />
      </div>

      <div className="rounded-md border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b text-muted-foreground text-xs uppercase tracking-wider font-semibold">
            <tr>
              <th className="px-4 py-3 text-left">Entity</th>
              <th className="px-4 py-3 text-left">Type</th>
              <th className="px-4 py-3 text-left">Confidence</th>
              <th className="px-4 py-3 text-left">Last Seen</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map(entity => (
              <tr key={entity.id} className="hover:bg-muted/30 transition-colors group">
                <td className="px-4 py-3 font-mono">
                  {entity.value}
                </td>
                <td className="px-4 py-3">
                  <Badge variant="outline" className="text-[10px] tracking-wide uppercase">
                    {entity.type.replace('_', ' ')}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {entity.confidence < 0.5 && <AlertTriangle className="w-3.5 h-3.5 text-warning" />}
                    <span className="font-mono">{Math.round(entity.confidence * 100)}%</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-muted-foreground font-mono text-xs">
                  {entity.last_seen ? new Date(entity.last_seen).toLocaleDateString() : '-'}
                </td>
                <td className="px-4 py-3 text-right">
                  <Button variant="ghost" size="sm" onClick={() => setLocation(`/entities/${entity.id}`)}>
                    Profile
                  </Button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-muted-foreground italic">
                  No entities found in this case.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex justify-between items-center mt-6">
        <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1 || isLoading}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Previous
        </Button>
        <span className="text-sm font-mono text-muted-foreground">Page {page}</span>
        <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={!filtered?.length || filtered.length < limit || isLoading}>
          Next <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}

export function Entities() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Users className="w-6 h-6" /> Case Entities
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Directory of all extracted and manually added entities.</p>
        </div>
      </div>
      <CaseScope>
        <EntitiesList />
      </CaseScope>
    </div>
  );
}