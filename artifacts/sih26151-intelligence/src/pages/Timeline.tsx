import { Clock, Filter, AlertCircle, MessageSquare, Terminal, RefreshCw, UploadCloud } from 'lucide-react';
import { mockEvents, mockActors, mockInfrastructure } from '@/data/mock';

const getEventIcon = (type: string) => {
  switch (type) {
    case 'CAMPAIGN_LAUNCH': return <Terminal className="w-4 h-4 text-primary-foreground" />;
    case 'INFRA_SETUP': return <ServerIcon className="w-4 h-4 text-primary-foreground" />;
    case 'FUNDS_TRANSFER': return <RefreshCw className="w-4 h-4 text-primary-foreground" />;
    case 'COMMUNICATION': return <MessageSquare className="w-4 h-4 text-primary-foreground" />;
    case 'BREACH': return <AlertCircle className="w-4 h-4 text-primary-foreground" />;
    default: return <Clock className="w-4 h-4 text-primary-foreground" />;
  }
};

const ServerIcon = Terminal; // reuse terminal for server to avoid importing Server again since it's used elsewhere

export function Timeline() {
  const sortedEvents = [...mockEvents].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Timeline Analysis</h1>
          <p className="text-sm text-muted-foreground mt-1">Chronological reconstruction of threat actor activities.</p>
        </div>
        <button className="px-4 py-2 bg-card border border-border rounded-md text-sm font-medium hover:bg-muted transition-colors flex items-center gap-2">
          <Filter className="w-4 h-4" /> Filter Events
        </button>
      </div>

      <div className="relative pl-8 space-y-8 py-4">
        <div className="absolute left-[15px] top-0 bottom-0 w-px bg-border"></div>
        
        {sortedEvents.map(event => {
          const isBreach = event.eventType === 'BREACH';
          return (
            <div key={event.id} className="relative group">
              <div className={`absolute -left-[35px] w-8 h-8 rounded-full flex items-center justify-center border-2 border-background ring-2 ${
                isBreach ? 'bg-destructive ring-destructive/20' : 'bg-primary ring-primary/20'
              }`}>
                {getEventIcon(event.eventType)}
              </div>
              
              <div className={`bg-card border rounded-lg p-5 shadow-sm ml-4 transition-all ${
                isBreach ? 'border-destructive/30 hover:border-destructive/50' : 'border-border hover:border-primary/30'
              }`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-mono text-muted-foreground bg-muted/50 px-2 py-0.5 rounded border border-border/50">
                      {event.timestamp.replace('T', ' ').slice(0, 16)} Z
                    </span>
                    <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded ${
                      isBreach ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'
                    }`}>
                      {event.eventType.replace('_', ' ')}
                    </span>
                  </div>
                </div>
                
                <h3 className="text-base font-semibold mt-3">{event.title}</h3>
                <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{event.description}</p>
                
                {event.relatedEntities.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-border flex flex-wrap gap-2">
                    {event.relatedEntities.map(entityId => {
                      const actor = mockActors.find(a => a.id === entityId);
                      const infra = mockInfrastructure.find(i => i.id === entityId);
                      
                      if (actor) return <span key={entityId} className="text-xs px-2 py-1 bg-muted rounded border border-border text-foreground font-medium">Actor: {actor.name}</span>;
                      if (infra) return <span key={entityId} className="text-xs px-2 py-1 bg-muted rounded border border-border text-foreground font-mono">Infra: {infra.value}</span>;
                      return <span key={entityId} className="text-xs px-2 py-1 bg-muted rounded border border-border text-muted-foreground font-mono">{entityId}</span>;
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
