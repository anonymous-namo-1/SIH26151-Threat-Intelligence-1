import { useState, useMemo, useEffect } from 'react';
import { useGetCaseTimeline, TimelineKind, getGetCaseTimelineQueryKey } from '@workspace/api-client-react';
import { CaseScope, useCaseWorkspace } from '@/hooks/use-case-workspace';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { format, parseISO } from 'date-fns';
import { Clock, RefreshCcw, FilterX, Activity, ArrowRight } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Link, useSearch, useLocation } from 'wouter';

function TimelineView() {
  const { caseId } = useCaseWorkspace();
  const searchString = useSearch();
  const searchParams = new URLSearchParams(searchString);
  const [, setLocation] = useLocation();

  const urlStartDate = searchParams.get('start') || '';
  const urlEndDate = searchParams.get('end') || '';
  const urlKindFilter = (searchParams.get('kind') as TimelineKind | 'ALL') || 'ALL';
  const urlPage = parseInt(searchParams.get('page') || '1', 10);

  const [startDate, setStartDate] = useState(urlStartDate);
  const [endDate, setEndDate] = useState(urlEndDate);
  const [kindFilter, setKindFilter] = useState<TimelineKind | 'ALL'>(urlKindFilter);
  const [page, setPage] = useState(urlPage);

  const limit = 50;
  const offset = (page - 1) * limit;

  // Sync state to URL
  useEffect(() => {
    const params = new URLSearchParams();
    if (startDate) params.set('start', startDate);
    if (endDate) params.set('end', endDate);
    if (kindFilter !== 'ALL') params.set('kind', kindFilter);
    if (page > 1) params.set('page', page.toString());
    
    const newSearch = params.toString();
    const currentPath = window.location.pathname;
    const newUrl = newSearch ? `${currentPath}?${newSearch}` : currentPath;
    
    // Only update if URL actually changed to prevent loops
    if (searchString !== newSearch) {
      setLocation(newUrl, { replace: true });
    }
  }, [startDate, endDate, kindFilter, page, setLocation, searchString]);

  const queryParams: any = {
    limit,
    offset,
  };

  if (kindFilter !== 'ALL') queryParams.kind = [kindFilter];
  if (startDate) queryParams.start = new Date(startDate).toISOString();
  if (endDate) queryParams.end = new Date(new Date(endDate).getTime() + 86400000).toISOString();

  const { data: events, isLoading, error, refetch } = useGetCaseTimeline(caseId, queryParams, {
    query: { queryKey: getGetCaseTimelineQueryKey(caseId, queryParams) }
  });

  const filteredEvents = events || [];

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
    setPage(1);
  };

  const handleNextPage = () => setPage(p => p + 1);
  const handlePrevPage = () => setPage(p => Math.max(1, p - 1));

  const handleFilterChange = (setter: any) => (value: any) => {
    setter(value);
    setPage(1); // Reset page on filter change
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="p-4 flex flex-wrap items-end gap-4 bg-muted/30">
          <div className="space-y-1.5 flex-1 min-w-[200px]">
            <Label>Event Kind</Label>
            <Select value={kindFilter} onValueChange={handleFilterChange(setKindFilter)}>
              <SelectTrigger>
                <SelectValue placeholder="All events" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Events</SelectItem>
                {Object.values(TimelineKind).map(kind => (
                  <SelectItem key={kind} value={kind}>{kind.replace('_', ' ')}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 flex-1 min-w-[150px]">
            <Label>Start Date (UTC)</Label>
            <Input type="date" value={startDate} onChange={e => handleFilterChange(setStartDate)(e.target.value)} />
          </div>
          <div className="space-y-1.5 flex-1 min-w-[150px]">
            <Label>End Date (UTC)</Label>
            <Input type="date" value={endDate} onChange={e => handleFilterChange(setEndDate)(e.target.value)} />
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
                    {new Date(event.occurred_at).toISOString().replace('T', ' ').substring(0, 19)} UTC
                  </span>
                  <Badge variant="outline" className="text-[10px] h-5 uppercase tracking-wider">{event.kind}</Badge>
                </div>
                <Card className="shadow-sm">
                  <CardContent className="p-4">
                    <p className="font-medium">{event.title}</p>
                    {(event.entity_id || event.evidence_id) && (
                      <div className="mt-2 flex gap-3 text-xs text-muted-foreground font-mono bg-muted/20 p-2 rounded">
                        {event.evidence_id && (
                          <span className="flex items-center">
                            Evidence: <Link href={`/evidence?evidence=${encodeURIComponent(event.evidence_id)}`} className="ml-1 text-primary hover:underline">{event.evidence_id.slice(0,8)}</Link>
                          </span>
                        )}
                        {event.entity_id && (
                          <span className="flex items-center">
                            Entity: <Link href={`/entities/${event.entity_id}`} className="ml-1 text-primary hover:underline">{event.entity_id.slice(0,8)}</Link>
                          </span>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="flex justify-between items-center mt-6 pt-6 border-t ml-4 md:ml-6">
        <Button variant="outline" size="sm" onClick={handlePrevPage} disabled={page === 1}>
          Previous Page
        </Button>
        <span className="text-sm font-mono text-muted-foreground">Page {page}</span>
        <Button variant="outline" size="sm" onClick={handleNextPage} disabled={filteredEvents.length < limit}>
          Next Page <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}

export function Timeline() {
  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-1 flex items-center gap-2">
            <Clock className="h-7 w-7" /> Case Timeline
          </h1>
          <p className="text-muted-foreground">Chronological sequence of evidentiary events and actor observations.</p>
        </div>
        <Button variant="secondary" asChild>
          <Link href={`/analysis?module=temporal`}>
            <Activity className="h-4 w-4 mr-2" /> Run Analysis
          </Link>
        </Button>
      </div>
      <CaseScope>
        <TimelineView />
      </CaseScope>
    </div>
  );
}
