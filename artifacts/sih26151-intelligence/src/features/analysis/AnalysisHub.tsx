import { useLocation, useSearch } from "wouter";
import { 
  Users, PenTool, Clock, Wallet, Server, Fingerprint, 
  Network, ShieldAlert, XCircle, LayoutList, ChevronLeft
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { ModuleName } from "@workspace/api-client-react";
import { PersonaModule } from "./modules/PersonaModule";
import { StylometryModule } from "./modules/StylometryModule";
import { TemporalModule } from "./modules/TemporalModule";
import { WalletModule } from "./modules/WalletModule";
import { InfrastructureModule, AliasModule, RelationshipModule, ReliabilityModule, ContradictionModule, TimelineModule } from "./modules";
import { ScoringRulesEditor } from "./ScoringRulesEditor";

const MODULES = [
  { id: ModuleName.persona, name: "Persona Correlation", icon: Users, desc: "Compare evidence-supported similarities, not identities." },
  { id: ModuleName.stylometry, name: "Stylometric Analysis", icon: PenTool, desc: "Analyze text features and writing patterns." },
  { id: ModuleName.temporal, name: "Temporal Analysis", icon: Clock, desc: "Find timing overlaps and activity patterns." },
  { id: ModuleName.wallet, name: "Wallet Analysis", icon: Wallet, desc: "Trace cryptocurrency transactions and flows." },
  { id: ModuleName.infrastructure, name: "Infrastructure Analysis", icon: Server, desc: "Correlate domains, IPs, and hosting data." },
  { id: ModuleName.alias, name: "Alias Analysis", icon: Fingerprint, desc: "Evaluate likelihood of shared aliases." },
  { id: ModuleName.relationship, name: "Relationship Analysis", icon: Network, desc: "Assess connection strength between entities." },
  { id: ModuleName.reliability, name: "Evidence Reliability", icon: ShieldAlert, desc: "Review provenance completeness and evidence gaps." },
  { id: ModuleName.contradiction, name: "Contradiction Detection", icon: XCircle, desc: "Find conflicting supplied claims requiring review." },
  { id: ModuleName.timeline, name: "Timeline Analysis", icon: LayoutList, desc: "Build sequential narratives of events." }
];

export function AnalysisHub({ caseId }: { caseId: string }) {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const searchParams = new URLSearchParams(search);
  const requestedModule = searchParams.get("module");
  const currentModule = MODULES.find(module => module.id === requestedModule)?.id ?? null;

  const navigateToModule = (id: string | null) => {
    if (id) {
      setLocation(`/analysis?module=${id}`);
    } else {
      setLocation(`/analysis`);
    }
  };

  if (!currentModule) {
    return (
      <div className="p-6">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h2 className="text-2xl font-bold tracking-tight mb-2">Analysis Engine</h2>
            <p className="text-muted-foreground">Select a module to correlate evidence and generate hypotheses.</p>
          </div>
          <ScoringRulesEditor caseId={caseId} />
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {MODULES.map(m => {
            const Icon = m.icon;
            return (
              <Card 
                key={m.id} 
                className="cursor-pointer hover:border-primary/50 hover:bg-muted/50 transition-all"
                 role="button"
                 tabIndex={0}
                 aria-label={`Open ${m.name}`}
                onClick={() => navigateToModule(m.id)}
                 onKeyDown={event => {
                   if (event.key === "Enter" || event.key === " ") {
                     event.preventDefault();
                     navigateToModule(m.id);
                   }
                 }}
              >
                <CardHeader className="pb-2">
                  <Icon className="w-8 h-8 text-primary mb-2" />
                  <CardTitle className="text-lg">{m.name}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription>{m.desc}</CardDescription>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    );
  }

  const activeModData = MODULES.find(m => m.id === currentModule);

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background">
      <div className="flex items-center justify-between p-4 border-b border-border bg-card shrink-0">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigateToModule(null)}>
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <div className="flex items-center gap-2">
            {activeModData && <activeModData.icon className="w-5 h-5 text-primary" />}
            <h2 className="text-lg font-bold">{activeModData?.name}</h2>
          </div>
        </div>
        <ScoringRulesEditor caseId={caseId} />
      </div>
      
      <div key={`${caseId}:${currentModule}`} className="flex-1 overflow-auto p-6">
        {currentModule === ModuleName.persona && <PersonaModule caseId={caseId} />}
        {currentModule === ModuleName.stylometry && <StylometryModule caseId={caseId} />}
        {currentModule === ModuleName.temporal && <TemporalModule caseId={caseId} />}
        {currentModule === ModuleName.wallet && <WalletModule caseId={caseId} />}
        {currentModule === ModuleName.infrastructure && <InfrastructureModule caseId={caseId} />}
        {currentModule === ModuleName.alias && <AliasModule caseId={caseId} />}
        {currentModule === ModuleName.relationship && <RelationshipModule caseId={caseId} />}
        {currentModule === ModuleName.reliability && <ReliabilityModule caseId={caseId} />}
        {currentModule === ModuleName.contradiction && <ContradictionModule caseId={caseId} />}
        {currentModule === ModuleName.timeline && <TimelineModule caseId={caseId} />}
      </div>
    </div>
  );
}
