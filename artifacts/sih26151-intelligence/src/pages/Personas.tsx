import { Users, SplitSquareHorizontal, Clock, MessageSquare, AlertTriangle } from 'lucide-react';
import { mockPersonas, mockActors } from '@/data/mock';

export function Personas() {
  const p1 = mockPersonas[0];
  const p2 = mockPersonas[1];
  
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Persona Analysis</h1>
          <p className="text-sm text-muted-foreground mt-1">Compare operator handles, schedules, and linguistic traits.</p>
        </div>
        <button className="px-4 py-2 bg-card border border-border rounded-md text-sm font-medium hover:bg-muted transition-colors flex items-center gap-2">
          <SplitSquareHorizontal className="w-4 h-4" /> Compare
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {[p1, p2].map((persona, idx) => {
          const actor = mockActors.find(a => a.id === persona.associatedActorId);
          return (
            <div key={persona.id} className="bg-card border border-border rounded-lg shadow-sm overflow-hidden flex flex-col">
              <div className="p-5 border-b border-border bg-muted/10">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20">
                      <Users className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold">{persona.handle}</h2>
                      <p className="text-xs text-muted-foreground font-mono">{persona.id}</p>
                    </div>
                  </div>
                  {idx === 1 && (
                    <span className="text-[10px] font-bold tracking-wider bg-warning/10 text-warning-foreground border border-warning/20 px-2 py-0.5 rounded">
                      SUSPECTED MATCH
                    </span>
                  )}
                </div>
              </div>
              
              <div className="p-5 space-y-6 flex-1">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Primary Platform</div>
                    <div className="font-medium text-sm flex items-center gap-2">
                      <MessageSquare className="w-4 h-4 text-muted-foreground" />
                      {persona.platform}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Language</div>
                    <div className="font-medium text-sm">{persona.language}</div>
                  </div>
                </div>

                <div>
                  <div className="text-xs text-muted-foreground mb-2 flex items-center gap-2">
                    <Clock className="w-4 h-4" /> Activity Schedule
                  </div>
                  <div className="bg-background border border-border rounded p-3 text-sm font-mono flex items-center justify-center">
                    {persona.activitySchedule}
                  </div>
                </div>

                <div>
                  <div className="text-xs text-muted-foreground mb-2">Behavioral Traits</div>
                  <div className="flex flex-wrap gap-2">
                    {persona.traits.map((trait, i) => (
                      <span key={i} className="text-xs px-2 py-1 bg-muted border border-border rounded text-foreground">
                        {trait}
                      </span>
                    ))}
                  </div>
                </div>

                {actor && (
                  <div className="mt-auto pt-4 border-t border-border">
                    <div className="text-xs flex items-center justify-between">
                      <span className="text-muted-foreground flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 text-warning" />
                        Attributed to
                      </span>
                      <span className="font-medium">{actor.name}</span>
                    </div>
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
