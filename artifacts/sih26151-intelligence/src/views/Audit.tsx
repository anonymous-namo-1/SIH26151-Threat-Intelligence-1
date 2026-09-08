import { useListAuditEvents } from '@workspace/api-client-react';
import { Loader2, Activity, ArrowRight, ArrowLeft } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Link } from 'wouter';

export function Audit() {
  const [page, setPage] = useState(1);
  const limit = 50;
  const offset = (page - 1) * limit;

  const { data, isLoading, error, refetch } = useListAuditEvents({ limit, offset });

  if (isLoading && page === 1) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 border border-destructive/20 bg-destructive/5 rounded-lg text-center space-y-3 max-w-lg mx-auto mt-12">
        <p className="text-destructive font-medium">Failed to load audit logs.</p>
        <Button variant="outline" onClick={() => refetch()}>Retry</Button>
      </div>
    );
  }

  const renderResourceLink = (type: string, id: string) => {
    switch (type) {
      case 'case':
        return <Link href={`/cases/${id}`} className="text-primary hover:underline">{id.slice(0,8)}</Link>;
      case 'entity':
        return <Link href={`/entities/${id}`} className="text-primary hover:underline">{id.slice(0,8)}</Link>;
      case 'evidence':
        return <Link href={`/evidence?evidence_id=${id}`} className="text-primary hover:underline">{id.slice(0,8)}</Link>;
      case 'report':
        return <Link href={`/reports?report=${id}`} className="text-primary hover:underline">{id.slice(0,8)}</Link>;
      default:
        return <span>{id.slice(0,8)}</span>;
    }
  };

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
              <th className="px-4 py-3 text-left font-semibold uppercase tracking-wider text-xs">Timestamp (UTC)</th>
              <th className="px-4 py-3 text-left font-semibold uppercase tracking-wider text-xs">Actor ID</th>
              <th className="px-4 py-3 text-left font-semibold uppercase tracking-wider text-xs">Action</th>
              <th className="px-4 py-3 text-left font-semibold uppercase tracking-wider text-xs">Resource Type</th>
              <th className="px-4 py-3 text-left font-semibold uppercase tracking-wider text-xs">Resource ID</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {data?.items?.map(evt => (
              <tr key={evt.id} className="hover:bg-muted/30 transition-colors">
                <td className="px-4 py-3 font-mono text-muted-foreground whitespace-nowrap">
                  {new Date(evt.created_at).toISOString().replace('T', ' ').slice(0, 19)}
                </td>
                <td className="px-4 py-3 font-mono text-xs">{evt.actor_id.slice(0, 8)}...</td>
                <td className="px-4 py-3 font-medium text-foreground">{evt.action}</td>
                <td className="px-4 py-3 font-mono text-xs uppercase text-muted-foreground">{evt.resource_type}</td>
                <td className="px-4 py-3 font-mono text-xs">{renderResourceLink(evt.resource_type, evt.resource_id)}</td>
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

      <div className="flex justify-between items-center pt-4">
        <Button
          variant="outline"
          onClick={() => setPage(p => Math.max(1, p - 1))}
          disabled={page === 1 || isLoading}
        >
          <ArrowLeft className="w-4 h-4 mr-2" /> Previous
        </Button>
        <span className="text-sm font-mono text-muted-foreground">Page {page}</span>
        <Button
          variant="outline"
          onClick={() => setPage(p => p + 1)}
          disabled={!data?.items?.length || data.items.length < limit || isLoading}
        >
          Next <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}
