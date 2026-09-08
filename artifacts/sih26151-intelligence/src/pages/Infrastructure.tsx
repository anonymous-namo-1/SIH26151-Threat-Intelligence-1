import { Search, Filter, Server, Download, ShieldAlert } from 'lucide-react';
import { mockInfrastructure, mockActors } from '@/data/mock';

export function Infrastructure() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Infrastructure Intelligence</h1>
          <p className="text-sm text-muted-foreground mt-1">Tracked IPs, domains, C2 servers, and drop zones.</p>
        </div>
        <button className="px-4 py-2 bg-card border border-border rounded-md text-sm font-medium hover:bg-muted transition-colors flex items-center gap-2">
          <Download className="w-4 h-4" /> Export IOCs
        </button>
      </div>

      <div className="flex gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input 
            type="text" 
            placeholder="Search by IP, domain, ASN, or related actor..." 
            className="w-full pl-9 pr-4 py-2 bg-card border border-border rounded-md text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary/50 transition-all"
          />
        </div>
        <button className="px-4 py-2 bg-card border border-border rounded-md text-sm font-medium hover:bg-muted transition-colors flex items-center gap-2">
          <Filter className="w-4 h-4" /> Types
        </button>
      </div>

      <div className="bg-card border border-border rounded-lg shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b border-border text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Indicator</th>
                <th className="px-4 py-3 text-left font-medium">Type</th>
                <th className="px-4 py-3 text-left font-medium">ASN / Loc</th>
                <th className="px-4 py-3 text-left font-medium">Attribution</th>
                <th className="px-4 py-3 text-left font-medium">Confidence</th>
                <th className="px-4 py-3 text-left font-medium">Last Active</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {mockInfrastructure.map(inf => {
                const actor = mockActors.find(a => a.id === inf.relatedActorId);
                return (
                  <tr key={inf.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-mono text-primary flex items-center gap-2">
                      <Server className="w-3.5 h-3.5 text-muted-foreground" />
                      {inf.value}
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-1.5 py-0.5 rounded bg-muted text-[10px] uppercase font-bold tracking-wider text-muted-foreground">
                        {inf.type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground font-mono text-xs">
                      {inf.asn || '-'} {inf.location ? `(${inf.location})` : ''}
                    </td>
                    <td className="px-4 py-3 font-medium">
                      {actor ? (
                        <div className="flex items-center gap-1.5 text-foreground">
                          {actor.threatLevel === 'CRITICAL' && <ShieldAlert className="w-3.5 h-3.5 text-destructive" />}
                          {actor.name}
                        </div>
                      ) : (
                        <span className="text-muted-foreground italic">Unattributed</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                       <span className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-wider ${
                        inf.confidence === 'CONFIRMED' || inf.confidence === 'HIGH' ? 'text-chart-5 border border-chart-5/30 bg-chart-5/10' : 
                        inf.confidence === 'MEDIUM' ? 'text-warning-foreground border border-warning/30 bg-warning/10' : 
                        'text-muted-foreground border border-border bg-muted'
                      }`}>
                        {inf.confidence}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs font-mono">
                      {inf.lastActive.replace('T', ' ').slice(0, 16)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
