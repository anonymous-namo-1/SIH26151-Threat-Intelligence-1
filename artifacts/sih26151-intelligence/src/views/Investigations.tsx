import { useState } from 'react';
import { Search, Filter, FolderOpen, ArrowRight, Loader2, Plus, Network, Files, Users } from 'lucide-react';
import { useListCases, useGetMe, CaseStatus } from '@workspace/api-client-react';
import { Link, useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCaseWorkspace } from '@/hooks/use-case-workspace';

export function Investigations() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<CaseStatus | undefined>();
  const { data: casesData, isLoading, isError } = useListCases({ limit: 50, status: statusFilter });
  const { data: me } = useGetMe();
  const { setCaseId } = useCaseWorkspace();
  const [, setLocation] = useLocation();

  const filteredCases = casesData?.items?.filter(c => 
    c.title.toLowerCase().includes(search.toLowerCase()) || 
    c.id.toLowerCase().includes(search.toLowerCase())
  );

  const handleContextNav = (path: string, id: string) => {
    setCaseId(id);
    setLocation(path);
  };

  return (
    <div className="space-y-6 flex flex-col h-full">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Investigations Workspace</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage active and archived operational intelligence cases.</p>
        </div>
        {me?.permissions.includes('case:create') && (
          <Button asChild>
            <Link href="/cases/new">
              <Plus className="w-4 h-4 mr-2" /> New Case
            </Link>
          </Button>
        )}
      </div>

      <div className="flex gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input 
            type="text" 
            placeholder="Search cases by title or ID..." 
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2"
          />
        </div>
        <div className="flex gap-2">
          {(['OPEN', 'INVESTIGATING', 'CLOSED'] as CaseStatus[]).map(status => (
            <Button
              key={status}
              variant={statusFilter === status ? 'default' : 'outline'}
              size="sm"
              onClick={() => setStatusFilter(statusFilter === status ? undefined : status)}
            >
              {status}
            </Button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : isError ? (
        <div className="text-center py-12 text-destructive">Failed to load cases.</div>
      ) : filteredCases?.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground bg-card border border-border rounded-lg shadow-sm">
          No investigations found matching your criteria.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {filteredCases?.map(inv => (
            <div key={inv.id} className="bg-card border border-border rounded-lg shadow-sm hover:border-border/80 transition-all group flex flex-col md:flex-row">
              <div className="p-5 flex-1 border-b md:border-b-0 md:border-r border-border">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <FolderOpen className="w-5 h-5 text-muted-foreground" />
                    <Link href={`/cases/${inv.id}`}>
                      <h3 className="font-semibold text-primary group-hover:underline cursor-pointer">{inv.title}</h3>
                    </Link>
                  </div>
                  <div className={`px-2 py-0.5 rounded text-xs font-bold ${
                    inv.priority === 'CRITICAL' ? 'bg-destructive/10 text-destructive' :
                    inv.priority === 'HIGH' ? 'bg-warning/10 text-warning-foreground' :
                    'bg-muted text-muted-foreground'
                  }`}>
                    {inv.priority}
                  </div>
                </div>
                <p className="text-sm text-muted-foreground line-clamp-2 mt-2">{inv.description || "No description provided."}</p>
                
                <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                  <span className="font-mono bg-muted/50 px-1.5 py-0.5 rounded border border-border">{inv.id}</span>
                  <span>Creator: <span className="font-medium text-foreground">{inv.created_by.name}</span></span>
                  <span>Updated: {new Date(inv.updated_at).toLocaleDateString()}</span>
                  {inv.tags && inv.tags.length > 0 && (
                    <div className="flex gap-1">
                      {inv.tags.map(t => (
                        <span key={t} className="px-1.5 py-0.5 bg-secondary/50 rounded-sm">{t}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="p-4 bg-muted/20 flex md:flex-col items-center justify-between gap-2 md:w-32 border-l border-border">
                <span className={`text-xs font-bold px-2 py-1 rounded-md border w-full text-center ${
                  inv.status === 'OPEN' || inv.status === 'INVESTIGATING' ? 'border-primary text-primary bg-primary/10' : 'border-border text-muted-foreground'
                }`}>
                  {inv.status}
                </span>
                
                <div className="flex flex-col gap-1 w-full mt-2">
                  <Button variant="ghost" size="sm" className="w-full justify-start text-xs h-7" onClick={() => handleContextNav(`/cases/${inv.id}`, inv.id)}>
                    <FolderOpen className="w-3 h-3 mr-2" /> Details
                  </Button>
                  <Button variant="ghost" size="sm" className="w-full justify-start text-xs h-7" onClick={() => handleContextNav('/graph', inv.id)}>
                    <Network className="w-3 h-3 mr-2" /> Graph
                  </Button>
                  <Button variant="ghost" size="sm" className="w-full justify-start text-xs h-7" onClick={() => handleContextNav('/evidence', inv.id)}>
                    <Files className="w-3 h-3 mr-2" /> Evidence
                  </Button>
                  <Button variant="ghost" size="sm" className="w-full justify-start text-xs h-7" onClick={() => handleContextNav('/personas', inv.id)}>
                    <Users className="w-3 h-3 mr-2" /> Personas
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
