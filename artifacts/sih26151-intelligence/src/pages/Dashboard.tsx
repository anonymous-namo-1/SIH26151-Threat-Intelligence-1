import { ShieldAlert, Server, Activity, ArrowUpRight, ArrowDownRight, AlertTriangle } from 'lucide-react';
import { mockActors, mockInvestigations, mockEvents } from '@/data/mock';

export function Dashboard() {
  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Intelligence Overview</h1>
          <p className="text-sm text-muted-foreground mt-1">Operational status and high-priority threats.</p>
        </div>
        <div className="text-right">
          <div className="text-sm font-mono text-muted-foreground">LAST UPDATED</div>
          <div className="text-sm font-medium">{new Date().toISOString().split('.')[0]}Z</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <KPI title="Active Investigations" value={mockInvestigations.length} trend="+2" trendUp />
        <KPI title="Critical Threats" value={mockActors.filter(a => a.threatLevel === 'CRITICAL').length} trend="Unchanged" />
        <KPI title="C2 Nodes Tracked" value={142} trend="+12" trendUp />
        <KPI title="Collection Health" value="98.4%" trend="-0.2%" trendUp={false} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Priority Threats */}
        <div className="lg:col-span-2 space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-destructive" />
            Priority Threat Actors
          </h2>
          <div className="bg-card border border-border rounded-lg shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b border-border text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Actor</th>
                  <th className="px-4 py-3 text-left font-medium">Type</th>
                  <th className="px-4 py-3 text-left font-medium">Threat Level</th>
                  <th className="px-4 py-3 text-right font-medium">Active Inv.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {mockActors.map(actor => (
                  <tr key={actor.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-medium text-primary">{actor.name}</td>
                    <td className="px-4 py-3">{actor.type.replace('_', ' ')}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold ${
                        actor.threatLevel === 'CRITICAL' ? 'bg-destructive/10 text-destructive border border-destructive/20' :
                        actor.threatLevel === 'HIGH' ? 'bg-warning/10 text-warning-foreground border border-warning/20' :
                        'bg-muted text-muted-foreground'
                      }`}>
                        {actor.threatLevel}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {mockInvestigations.filter(i => i.targetId === actor.id).length}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Activity className="w-5 h-5 text-primary" />
            Recent Intel Events
          </h2>
          <div className="bg-card border border-border rounded-lg shadow-sm p-4 space-y-4">
            {mockEvents.slice(0, 4).map(event => (
              <div key={event.id} className="flex gap-3">
                <div className="mt-0.5">
                  <div className="w-2 h-2 rounded-full bg-primary mt-1.5" />
                  <div className="w-px h-full bg-border mx-auto -mb-4" />
                </div>
                <div>
                  <div className="text-xs font-mono text-muted-foreground">{event.timestamp.replace('T', ' ').slice(0, 16)}</div>
                  <div className="font-medium text-sm mt-0.5">{event.title}</div>
                  <div className="text-xs text-muted-foreground mt-1">{event.description}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

function KPI({ title, value, trend, trendUp }: { title: string, value: string | number, trend: string, trendUp?: boolean }) {
  return (
    <div className="bg-card border border-border rounded-lg p-4 shadow-sm flex flex-col justify-between">
      <div className="text-sm font-medium text-muted-foreground">{title}</div>
      <div className="mt-2 flex items-baseline gap-2">
        <div className="text-3xl font-bold tracking-tight">{value}</div>
        {trend && (
          <div className={`flex items-center text-xs font-medium ${trendUp === undefined ? 'text-muted-foreground' : trendUp ? 'text-chart-5' : 'text-destructive'}`}>
            {trendUp !== undefined && (trendUp ? <ArrowUpRight className="w-3 h-3 mr-0.5" /> : <ArrowDownRight className="w-3 h-3 mr-0.5" />)}
            {trend}
          </div>
        )}
      </div>
    </div>
  );
}
