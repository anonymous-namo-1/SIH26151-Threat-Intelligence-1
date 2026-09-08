import { ModuleResult } from "@workspace/api-client-react";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileText, Download, ShieldCheck, Clock, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { formatUtc } from "./results/formatUtc";

// Results imports
import { TemporalResult } from "./results/TemporalResult";
import { WalletResult } from "./results/WalletResult";
import { StylometryResult } from "./results/StylometryResult";
import { InfrastructureResult } from "./results/InfrastructureResult";
import { AliasResult } from "./results/AliasResult";
import { RelationshipResult } from "./results/RelationshipResult";
import { ReliabilityResult } from "./results/ReliabilityResult";
import { ContradictionResult } from "./results/ContradictionResult";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

export function ModuleResultView({ result }: { result: ModuleResult }) {
  const scoreColor = (score: number | null) => {
    if (score === null) return "text-muted-foreground";
    if (score >= 70) return "text-emerald-500";
    if (score >= 40) return "text-warning";
    return "text-destructive";
  };

  const handleDownload = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(result, null, 2));
    const downloadAnchorNode = document.createElement("a");
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `${result.module}_result_${result.job_id || Date.now()}.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const renderModuleSpecificData = () => {
    switch (result.module) {
      case "temporal":
      case "timeline":
        return <TemporalResult data={result.data as any} module={result.module} />;
      case "wallet":
        return <WalletResult data={result.data as any} />;
      case "stylometry":
        return <StylometryResult data={result.data as any} />;
      case "infrastructure":
        return <InfrastructureResult data={result.data as any} />;
      case "alias":
        return <AliasResult data={result.data as any} />;
      case "relationship":
        return <RelationshipResult data={result.data as any} />;
      case "reliability":
        return <ReliabilityResult data={result.data as any} />;
      case "contradiction":
        return <ContradictionResult data={result.data as any} />;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6 mt-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-8 items-start">
            <div className="flex-1 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex flex-col gap-1">
                  <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Engine Output</h3>
                  {result.generated_at && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Clock className="w-3 h-3" />
                      {formatUtc(result.generated_at)}
                    </div>
                  )}
                </div>
                <Button variant="outline" size="sm" onClick={handleDownload}>
                  <Download className="w-4 h-4 mr-2" /> Export JSON
                </Button>
              </div>
              
              <div className="flex items-start gap-2 bg-warning/10 text-warning p-3 rounded-md text-sm">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <p><strong>Heuristic Notice:</strong> Scores and findings represent automated heuristic correlation, not probabilistic identity or objective truth. Verify claims against primary evidence.</p>
              </div>

              <p className="text-base leading-relaxed text-foreground">{result.explanation}</p>
              
              <div className="flex flex-wrap gap-6 pt-4 border-t border-primary/10">
                {result.confidence !== null && result.confidence !== undefined && (
                  <div>
                    <span className="text-xs text-muted-foreground uppercase tracking-wider block mb-1">Total Confidence</span>
                    <div className="flex items-end gap-2">
                      <span className={`text-4xl font-mono font-bold ${scoreColor(result.confidence)}`}>
                        {result.confidence.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                )}
                <div>
                  <span className="text-xs text-muted-foreground uppercase tracking-wider block mb-1">Model Version</span>
                  <div className="flex items-center gap-1.5 h-10">
                    <ShieldCheck className="w-4 h-4 text-primary" />
                    <span className="font-mono text-sm">{result.model_version}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Module Specific UI */}
      {renderModuleSpecificData()}

      {/* Standard Factors (Positive / Negative / Unknown) */}
      {(result.positive_evidence?.length > 0 || result.negative_evidence?.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm uppercase tracking-wider text-muted-foreground">Positive Factors (+)</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[300px]">
                {result.positive_evidence?.length === 0 ? (
                  <div className="p-6 text-center text-muted-foreground text-sm">No positive correlations found.</div>
                ) : (
                  <div className="divide-y divide-border">
                    {result.positive_evidence?.map((f, i) => (
                      <FactorRow key={i} factor={f} isPositive={true} />
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm uppercase tracking-wider text-muted-foreground">Negative Factors (-)</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[300px]">
                {result.negative_evidence?.length === 0 ? (
                  <div className="p-6 text-center text-muted-foreground text-sm">No conflicting evidence found.</div>
                ) : (
                  <div className="divide-y divide-border">
                    {result.negative_evidence?.map((f, i) => (
                      <FactorRow key={i} factor={f} isPositive={false} />
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      )}

      {result.unknown_factors?.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm uppercase tracking-wider text-muted-foreground">Unknown Factors</CardTitle>
            <CardDescription>Metrics missing from the evidence pool</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="list-disc pl-5 space-y-1">
              {result.unknown_factors.map((u, i) => (
                <li key={i} className="text-sm text-muted-foreground font-mono">{u}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* JSON Collapsible */}
      {Object.keys(result.data || {}).length > 0 && (
        <Collapsible>
          <CollapsibleTrigger asChild>
            <Button variant="outline" className="w-full justify-between mb-2">
              View Raw JSON Data
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <Card>
              <CardContent className="p-4">
                <pre className="text-xs font-mono bg-muted p-4 rounded-md overflow-x-auto text-muted-foreground">
                  {JSON.stringify(result.data, null, 2)}
                </pre>
              </CardContent>
            </Card>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}

function FactorRow({ factor, isPositive }: { factor: any, isPositive: boolean }) {
  return (
    <div className="p-4 hover:bg-muted/50 transition-colors">
      <div className="flex justify-between items-start mb-2">
        <h4 className="font-medium flex items-center gap-2">
          {factor.name}
          <Badge variant="outline" className={`text-xs ${isPositive ? 'text-emerald-500 border-emerald-500/30 bg-emerald-500/10' : 'text-destructive border-destructive/30 bg-destructive/10'}`}>
            {isPositive ? '+' : ''}{factor.contribution?.toFixed(1) || factor.score?.toFixed(1) || '0'}
          </Badge>
        </h4>
      </div>
      <p className="text-sm text-muted-foreground mb-3">{factor.reason}</p>
      {factor.evidence_ids && factor.evidence_ids.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          {factor.evidence_ids.map((eid: string) => (
            <Button key={eid} variant="secondary" size="sm" className="h-6 text-xs" asChild>
              <Link href={`/evidence?evidence=${encodeURIComponent(eid)}`}>
                <FileText className="w-3 h-3 mr-1" />
                Ref: {eid.substring(0, 8)}
              </Link>
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
