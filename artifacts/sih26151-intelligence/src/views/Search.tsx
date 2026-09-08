import { useState, useEffect, useRef } from 'react';
import { Search as SearchIcon, Loader2, ArrowRight } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useSearchIntelligence, getSearchIntelligenceQueryKey } from '@workspace/api-client-react';
import { Link, useLocation, useSearch } from 'wouter';
import { Badge } from '@/components/ui/badge';
import { useCaseWorkspace } from '@/hooks/use-case-workspace';

export function GlobalSearch() {
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const searchParams = new URLSearchParams(searchString);
  const initialQ = searchParams.get('q') || '';

  const { setCaseId } = useCaseWorkspace();
  const [query, setQuery] = useState(initialQ);
  const [debouncedQuery, setDebouncedQuery] = useState(initialQ);
  const inputRef = useRef<HTMLInputElement>(null);
  
  useEffect(() => {
    const timer = setTimeout(() => {
      inputRef.current?.focus();
      if (inputRef.current) {
        inputRef.current.selectionStart = inputRef.current.value.length;
        inputRef.current.selectionEnd = inputRef.current.value.length;
      }
    }, 50);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
      const params = new URLSearchParams();
      if (query) params.set('q', query);
      const newSearch = params.toString();
      const currentPath = window.location.pathname;
      const newUrl = newSearch ? `${currentPath}?${newSearch}` : currentPath;
      if (searchString !== newSearch) {
        setLocation(newUrl, { replace: true });
      }
    }, 400); // 400ms debounce
    return () => clearTimeout(timer);
  }, [query, setLocation, searchString]);

  const { data, isLoading } = useSearchIntelligence(
    { q: debouncedQuery }, 
    { query: { enabled: debouncedQuery.length > 0, queryKey: getSearchIntelligenceQueryKey({ q: debouncedQuery }) } }
  );

  const handleCaseClick = (caseId: string) => {
    setCaseId(caseId);
    setLocation(`/cases/${caseId}`);
  };

  const handleEntityClick = (entityId: string, caseId: string) => {
    setCaseId(caseId);
    setLocation(`/entities/${entityId}`);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Global Search</h1>
        <p className="text-sm text-muted-foreground mt-1">Search across all cases, entities, and evidence.</p>
      </div>

      <div className="relative">
        <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
        <Input 
          ref={inputRef}
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Type to search globally..."
          className="pl-10 h-12 text-lg font-mono"
        />
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {data && !isLoading && (
        <div className="space-y-6">
          {data.cases.length === 0 && data.groups.length === 0 ? (
            <p className="text-muted-foreground">No results found for "{data.query}".</p>
          ) : null}

          {data.cases.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold tracking-wider uppercase text-muted-foreground border-b border-border pb-2">Cases</h2>
              <ul className="space-y-2">
                {data.cases.map(c => (
                  <li key={c.id} className="p-3 bg-card border border-border rounded-md shadow-sm hover:border-primary/50 cursor-pointer transition-colors group" onClick={() => handleCaseClick(c.id)}>
                    <div className="flex justify-between items-center">
                      <span className="font-semibold text-foreground group-hover:text-primary transition-colors">{c.title}</span>
                      <Badge variant="outline" className="text-[10px] uppercase">{c.status}</Badge>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {data.groups.map(group => (
            group.entities.length > 0 && (
              <div key={group.type} className="space-y-3">
                <h2 className="text-sm font-semibold tracking-wider uppercase text-muted-foreground border-b border-border pb-2">{group.type.replace('_', ' ')} Entities</h2>
                <ul className="space-y-2 grid grid-cols-1 md:grid-cols-2 gap-2">
                  {group.entities.map(e => (
                    <li key={e.id} className="p-3 bg-card border border-border rounded-md shadow-sm flex flex-col hover:border-primary/50 cursor-pointer transition-colors group" onClick={() => handleEntityClick(e.id, e.case_id)}>
                      <div className="flex justify-between items-start mb-1">
                        <span className="font-mono text-sm group-hover:text-primary transition-colors font-semibold truncate pr-4">{e.value}</span>
                        <ArrowRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                      {e.description && <span className="text-xs text-muted-foreground line-clamp-1">{e.description}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )
          ))}
        </div>
      )}
    </div>
  );
}