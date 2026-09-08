import { useParams, Link } from 'wouter';
import { ShieldAlert, Crosshair, AlertTriangle, Fingerprint, Network, Info, CheckCircle2, Server } from 'lucide-react';
import { mockActors, mockInvestigations, mockPersonas, mockInfrastructure } from '@/data/mock';

export function ActorProfile() {
  // Hardcoded for demo to nyx-collective if params.id matches or not found
  const actor = mockActors.find(a => a.id === 'act-nyx-1') || mockActors[0];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight text-primary">{actor.name}</h1>
            <span className={`px-2.5 py-1 rounded text-xs font-bold ${
              actor.threatLevel === 'CRITICAL' ? 'bg-destructive/10 text-destructive border border-destructive/20' :
              actor.threatLevel === 'HIGH' ? 'bg-warning/10 text-warning-foreground border border-warning/20' :
              'bg-muted text-muted-foreground'
            }`}>
              {actor.threatLevel} THREAT
            </span>
          </div>
          <p className="text-muted-foreground mt-1 flex items-center gap-2">
            <span className="font-mono text-xs border border-border px-1.5 py-0.5 rounded bg-muted/50">{actor.id}</span>
            <span>Type: <span className="font-medium text-foreground">{actor.type.replace('_', ' ')}</span></span>
            <span>•</span>
            <span>Active Since: <span className="font-medium text-foreground">{actor.activeSince}</span></span>
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/graph" className="px-4 py-2 bg-card border border-border rounded-md text-sm font-medium hover:bg-muted transition-colors flex items-center gap-2">
            <Network className="w-4 h-4" /> View in Graph
          </Link>
          <button className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors">
            Generate Report
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Col */}
        <div className="space-y-6">
          <div className="bg-card border border-border rounded-lg shadow-sm p-5">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">Profile Summary</h3>
            <p className="text-sm leading-relaxed">{actor.description}</p>
            
            <div className="mt-6 space-y-4">
              <div>
                <div className="text-xs text-muted-foreground mb-1">Motivation</div>
                <div className="text-sm font-medium">{actor.motivation}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">Suspected Origin</div>
                <div className="text-sm font-medium flex items-center gap-2">
                  <Crosshair className="w-4 h-4 text-muted-foreground" />
                  {actor.origin}
                </div>
              </div>
            </div>
          </div>

          <div className="bg-card border border-border rounded-lg shadow-sm p-5">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">Known Aliases</h3>
            <ul className="space-y-3">
              {actor.aliases.map(alias => (
                <li key={alias.id} className="flex flex-col">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm text-primary">{alias.name}</span>
                    <span className="text-xs text-muted-foreground">{alias.context}</span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1 flex justify-between">
                    <span>First: {alias.firstSeen.split('T')[0]}</span>
                    <span>Last: {alias.lastSeen.split('T')[0]}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Right Col */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-card border border-border rounded-lg shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Confidence Assessment</h3>
              <span className={`px-2 py-0.5 rounded text-xs font-bold border bg-card ${
                actor.confidenceLevel === 'HIGH' || actor.confidenceLevel === 'CONFIRMED' ? 'text-chart-5 border-chart-5/30' : 'text-warning-foreground border-warning/30'
              }`}>
                {actor.confidenceLevel} CONFIDENCE
              </span>
            </div>
            
            <div className="space-y-4">
              {actor.confidenceFactors.map(factor => (
                <div key={factor.id} className="p-3 border border-border bg-muted/20 rounded-md">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 font-medium text-sm">
                      {factor.corroborated ? (
                        <CheckCircle2 className="w-4 h-4 text-chart-5" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-warning" />
                      )}
                      {factor.factor}
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-1.5 bg-border rounded-full overflow-hidden">
                        <div 
                          className={`h-full ${factor.reliabilityScore > 80 ? 'bg-chart-5' : factor.reliabilityScore > 60 ? 'bg-warning' : 'bg-destructive'}`} 
                          style={{ width: `${factor.reliabilityScore}%` }} 
                        />
                      </div>
                      <span className="text-xs font-mono text-muted-foreground w-8 text-right">{factor.reliabilityScore}</span>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">{factor.description}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
             <div className="bg-card border border-border rounded-lg shadow-sm p-4">
               <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2 mb-3">
                 <Server className="w-4 h-4" /> Active Infrastructure
               </h4>
               <div className="text-2xl font-bold">
                 {mockInfrastructure.filter(i => i.relatedActorId === actor.id).length}
               </div>
               <Link href="/infrastructure" className="text-xs text-primary hover:underline mt-2 inline-block">View assets →</Link>
             </div>
             
             <div className="bg-card border border-border rounded-lg shadow-sm p-4">
               <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2 mb-3">
                 <Fingerprint className="w-4 h-4" /> Tracked Personas
               </h4>
               <div className="text-2xl font-bold">
                 {mockPersonas.filter(p => p.associatedActorId === actor.id).length}
               </div>
               <Link href="/personas" className="text-xs text-primary hover:underline mt-2 inline-block">View personas →</Link>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
}
