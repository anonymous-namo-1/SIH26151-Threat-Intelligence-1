import { ShieldAlert, Server, Activity, ArrowRight, FolderOpen, Loader2 } from 'lucide-react';
import { useGetDashboard, useSeedWorkspace } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Link, useLocation } from 'wouter';
import { useCaseWorkspace } from '@/hooks/use-case-workspace';

export function Dashboard() {
  const { data: dashboard, isLoading, isError } = useGetDashboard();
  const seed = useSeedWorkspace();
  const queryClient = useQueryClient();
  const { setCaseId } = useCaseWorkspace();
  const [, setLocation] = useLocation();

  const handleSeed = () => {
    seed.mutate(undefined, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['/api/argus/dashboard'] });
        queryClient.invalidateQueries({ queryKey: ['/api/argus/cases'] });
      }
    });
  };

  const handleContextNav = (path: string, id: string) => {
    setCaseId(id);
    setLocation(path);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError || !dashboard) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[50vh] space-y-4">
        <ShieldAlert className="h-10 w-10 text-destructive" />
        <p className="text-muted-foreground">Failed to load dashboard data.</p>
        <Button onClick={() => window.location.reload()} variant="outline">Retry</Button>
      </div>
    );
  }

  const isEmpty = dashboard.total_cases === 0 && dashboard.entity_count === 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Intelligence Overview</h1>
          <p className="text-sm text-muted-foreground mt-1">Operational status and high-priority threats.</p>
        </div>
        <div className="flex items-center gap-4 text-right">
          {isEmpty && (
            <Button onClick={handleSeed} disabled={seed.isPending} variant="default" size="sm">
              {seed.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Seed Sample Case
            </Button>
          )}
          <div>
            <div className="text-sm font-mono text-muted-foreground">LAST UPDATED</div>
            <div className="text-sm font-medium">{new Date().toISOString().split('.')[0]}Z</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <KPI title="Total Cases" value={dashboard.total_cases} />
        <KPI title="Open Cases" value={dashboard.open_cases} />
        <KPI title="Entities Tracked" value={dashboard.entity_count} />
        <KPI title="Evidence Collected" value={dashboard.evidence_count} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <FolderOpen className="w-5 h-5 text-primary" />
            Recent Investigations
          </h2>
          <div className="bg-card border border-border rounded-lg shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b border-border text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Case Title</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="px-4 py-3 text-left font-medium">Priority</th>
                  <th className="px-4 py-3 text-right font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {dashboard.recent_cases.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                      No active cases found.
                    </td>
                  </tr>
                ) : (
                  dashboard.recent_cases.map(c => (
                    <tr key={c.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-medium text-primary">
                        <Link href={`/cases/${c.id}`} className="hover:underline">
                          {c.title}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold ${
                          c.status === 'OPEN' || c.status === 'INVESTIGATING' ? 'bg-primary/10 text-primary border border-primary/20' :
                          'bg-muted text-muted-foreground'
                        }`}>
                          {c.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold ${
                          c.priority === 'CRITICAL' ? 'bg-destructive/10 text-destructive border border-destructive/20' :
                          c.priority === 'HIGH' ? 'bg-warning/10 text-warning-foreground border border-warning/20' :
                          'bg-muted text-muted-foreground'
                        }`}>
                          {c.priority}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button variant="ghost" size="sm" className="h-8" onClick={() => handleContextNav(`/cases/${c.id}`, c.id)}>
                          View <ArrowRight className="w-4 h-4 ml-1" />
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Activity className="w-5 h-5 text-primary" />
            System Status
          </h2>
          <div className="bg-card border border-border rounded-lg shadow-sm p-4 space-y-4">
             <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">API Connection</span>
                <span className="text-green-500 font-medium">Online</span>
             </div>
             <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Database</span>
                <span className="text-green-500 font-medium">Connected</span>
             </div>
             <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Storage Services</span>
                <span className="text-green-500 font-medium">Active</span>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function KPI({ title, value }: { title: string, value: string | number }) {
  return (
    <div className="bg-card border border-border rounded-lg p-4 shadow-sm flex flex-col justify-between">
      <div className="text-sm font-medium text-muted-foreground">{title}</div>
      <div className="mt-2 flex items-baseline gap-2">
        <div className="text-3xl font-bold tracking-tight">{value}</div>
      </div>
    </div>
  );
}
