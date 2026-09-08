import { Search, Filter, FolderOpen, ArrowRight, MoreHorizontal } from 'lucide-react';
import { mockInvestigations } from '@/data/mock';

export function Investigations() {
  return (
    <div className="space-y-6 flex flex-col h-full">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Investigations Workspace</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage active and archived operational intelligence cases.</p>
        </div>
        <button className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors">
          New Case
        </button>
      </div>

      <div className="flex gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input 
            type="text" 
            placeholder="Search cases by title, target, or TTPs..." 
            className="w-full pl-9 pr-4 py-2 bg-card border border-border rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-primary/50 transition-all"
          />
        </div>
        <button className="px-4 py-2 bg-card border border-border rounded-md text-sm font-medium hover:bg-muted transition-colors flex items-center gap-2">
          <Filter className="w-4 h-4" /> Filters
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {mockInvestigations.map(inv => (
          <div key={inv.id} className="bg-card border border-border rounded-lg shadow-sm hover:border-border/80 transition-all group flex flex-col md:flex-row">
            <div className="p-5 flex-1 border-b md:border-b-0 md:border-r border-border">
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-3">
                  <FolderOpen className="w-5 h-5 text-muted-foreground" />
                  <h3 className="font-semibold text-primary group-hover:underline cursor-pointer">{inv.title}</h3>
                </div>
                <div className={`px-2 py-0.5 rounded text-xs font-bold ${
                  inv.priority === 'URGENT' ? 'bg-destructive/10 text-destructive' :
                  inv.priority === 'HIGH' ? 'bg-warning/10 text-warning-foreground' :
                  'bg-muted text-muted-foreground'
                }`}>
                  {inv.priority}
                </div>
              </div>
              <p className="text-sm text-muted-foreground line-clamp-2 mt-2">{inv.summary}</p>
              
              <div className="mt-4 flex items-center gap-4 text-xs text-muted-foreground">
                <span className="font-mono bg-muted/50 px-1.5 py-0.5 rounded border border-border">{inv.id}</span>
                <span>Lead: <span className="font-medium text-foreground">{inv.leadAnalyst}</span></span>
                <span>Updated: {inv.updatedAt.split('T')[0]}</span>
              </div>
            </div>
            <div className="p-4 bg-muted/20 flex md:flex-col items-center md:justify-center justify-between gap-2 md:w-32">
              <span className={`text-xs font-bold px-2 py-1 rounded-md border ${
                inv.status === 'OPEN' ? 'border-chart-5 text-chart-5 bg-chart-5/10' : 'border-border text-muted-foreground'
              }`}>
                {inv.status}
              </span>
              <button className="p-2 text-muted-foreground hover:text-foreground transition-colors hover:bg-muted rounded-md">
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
