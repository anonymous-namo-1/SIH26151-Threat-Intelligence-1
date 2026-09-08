import { useListAuditEvents } from '@workspace/api-client-react';
import { Loader2, Activity } from 'lucide-react';

export function Audit() {
  const { data, isLoading } = useListAuditEvents({ limit: 100 });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Audit Logs</h1>
          <p className="text-sm text-muted-foreground mt-1">Chronological system events and user actions.</p>
        </div>
        <Activity className="w-8 h-8 text-primary" />
      </div>

      <div className="bg-card border border-border rounded-lg shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b border-border text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Timestamp</th>
              <th className="px-4 py-3 text-left font-medium">Actor ID</th>
              <th className="px-4 py-3 text-left font-medium">Action</th>
              <th className="px-4 py-3 text-left font-medium">Resource Type</th>
              <th className="px-4 py-3 text-left font-medium">Resource ID</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {data?.items?.map(evt => (
              <tr key={evt.id} className="hover:bg-muted/30 transition-colors">
                <td className="px-4 py-3 font-mono text-muted-foreground whitespace-nowrap">
                  {new Date(evt.created_at).toLocaleString()}
                </td>
                <td className="px-4 py-3 font-mono text-xs">{evt.actor_id}</td>
                <td className="px-4 py-3 font-medium">{evt.action}</td>
                <td className="px-4 py-3">{evt.resource_type}</td>
                <td className="px-4 py-3 font-mono text-xs">{evt.resource_id}</td>
              </tr>
            ))}
            {!data?.items?.length && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  No audit events found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
