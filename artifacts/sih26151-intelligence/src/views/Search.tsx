import { useState } from 'react';
import { Search as SearchIcon, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useSearchIntelligence, getSearchIntelligenceQueryKey } from '@workspace/api-client-react';

export function GlobalSearch() {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  
  // Custom debouncing or simple enter key for search
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      setDebouncedQuery(query);
    }
  };

  const { data, isLoading } = useSearchIntelligence(
    { q: debouncedQuery }, 
    { query: { enabled: debouncedQuery.length > 0, queryKey: getSearchIntelligenceQueryKey({ q: debouncedQuery }) } }
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Global Search</h1>
        <p className="text-sm text-muted-foreground mt-1">Search across all cases, entities, and evidence.</p>
      </div>

      <div className="relative">
        <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
        <Input 
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type to search and press Enter..."
          className="pl-10 h-12 text-lg"
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
            <div className="space-y-2">
              <h2 className="text-lg font-semibold border-b border-border pb-2">Cases</h2>
              <ul className="space-y-2">
                {data.cases.map(c => (
                  <li key={c.id} className="p-3 bg-card border border-border rounded-md shadow-sm">
                    <span className="font-semibold text-primary">{c.title}</span> - {c.status}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {data.groups.map(group => (
            group.entities.length > 0 && (
              <div key={group.type} className="space-y-2">
                <h2 className="text-lg font-semibold border-b border-border pb-2">{group.type}</h2>
                <ul className="space-y-2">
                  {group.entities.map(e => (
                    <li key={e.id} className="p-3 bg-card border border-border rounded-md shadow-sm flex flex-col">
                      <span className="font-mono text-sm">{e.value}</span>
                      {e.description && <span className="text-xs text-muted-foreground mt-1">{e.description}</span>}
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
