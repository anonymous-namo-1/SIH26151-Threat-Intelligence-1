import { useState, useMemo } from 'react';
import { useGetCaseTimeline, TimelineEventKind } from '@workspace/api-client-react';
import { CaseScope, useCaseWorkspace } from '@/hooks/use-case-workspace';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { format, parseISO } from 'date-fns';
import { Clock, RefreshCcw, FilterX } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

function TimelineView() {
  const { caseId } = useCaseWorkspace();
  const { data: events, isLoading, error, refetch } = useGetCaseTimeline(caseId);

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [kindFilter, setKindFilter] = useState<TimelineEventKind | 'ALL'>('ALL');

  const filteredEvents = useMemo(() => {
    if (!events) return [];
    let filtered = [...events];
    
    if (kindFilter !== 'ALL') {
      filtered = filtered.filter(e => e.kind === kindFilter);
    }
    if (startDate) {
      const start = new Date(startDate).getTime();
      filtered = filtered.filter(e => new Date(e.occurred_at).getTime() >= start);
    }
    if (endDate) {
      const end = new Date(endDate).getTime();
      // Add a full day to include the whole end date
      filtered = filtered.filter(e => new Date(e.occurred_at).getTime() <= end + 86400000);
    }
    
    // Sort descending by default
    filtered.sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime());
    return filtered;
  }, [events, startDate, endDate, kindFilter]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-full max-w-sm" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 border border-destructive/20 bg-destructive/5 rounded-lg text-center space-y-3">
        <p className="text-destructive font-medium">Failed to load timeline events</p>
        <Button variant="outline" onClick={() => refetch()}><RefreshCcw className="h-4 w-4 mr-2" /> Retry</Button>
      </div>
    );
  }

  const clearFilters = () => {
    setStartDate('');
    setEndDate('');
    setKindFilter('ALL');
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="p-4 flex flex-wrap items-end gap-4 bg-muted/30">
          <div className="space-y-1.5 flex-1 min-w-[200px]">
            <Label>Event Kind</Label>
            <Select value={kindFilter} onValueChange={(v) => setKindFilter(v as TimelineEventKind | 'ALL')}>
              <SelectTrigger>
                <SelectValue placeholder="All events" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Events</SelectItem>
                <SelectItem value={TimelineEventKind.EVIDENCE}>Evidence Collected</SelectItem>
                <SelectItem value={TimelineEventKind.ENTITY}>Entity Observed</SelectItem>
                <SelectItem value={TimelineEventKind.AUDIT}>Audit Trail</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 flex-1 min-w-[150px]">
            <Label>Start Date (UTC)</Label>
            <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
          </div>
          <div className="space-y-1.5 flex-1 min-w-[150px]">
            <Label>End Date (UTC)</Label>
            <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
          </div>
          {(startDate || endDate || kindFilter !== 'ALL') && (
            <Button variant="ghost" onClick={clearFilters} className="text-muted-foreground h-10">
              <FilterX className="h-4 w-4 mr-2" />
              Clear
            </Button>
          )}
        </CardContent>
      </Card>

      <div className="relative border-l-2 border-muted ml-4 md:ml-6 space-y-8 pb-10">
        {!filteredEvents.length ? (
          <div className="pl-6 text-muted-foreground italic pt-4">No events found matching criteria.</div>
        ) : (
          filteredEvents.map(event => (
            <div key={event.id} className="relative pl-6 md:pl-8 group">
              <div className="absolute -left-[9px] top-1 h-4 w-4 rounded-full border-2 border-background bg-primary ring-2 ring-primary/20 group-hover:ring-primary/40 transition-all" />
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm font-medium text-foreground">
                    {format(parseISO(event.occurred_at), "yyyy-MM-dd HH:mm:ss 'UTC'")}
                  </span>
                  <Badge variant="outline" className="text-[10px] h-5 uppercase tracking-wider">{event.kind}</Badge>
                </div>
                <Card className="shadow-sm">
                  <CardContent className="p-4">
                    <p className="font-medium">{event.title}</p>
                    {(event.entity_id || event.evidence_id) && (
                      <div className="mt-2 flex gap-3 text-xs text-muted-foreground font-mono">
                        {event.evidence_id && <span>Evidence: {event.evidence_id.slice(0,8)}</span>}
                        {event.entity_id && <span>Entity: {event.entity_id.slice(0,8)}</span>}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export function Timeline() {
  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight mb-1 flex items-center gap-2">
          <Clock className="h-7 w-7" /> Case Timeline
        </h1>
        <p className="text-muted-foreground">Chronological sequence of evidentiary events and actor observations.</p>
      </div>
      <CaseScope>
        <TimelineView />
      </CaseScope>
    </div>
  );
}
