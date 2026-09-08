import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Zap, AlertCircle } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

import { Link } from "wouter";

interface ContradictionData {
  findings: Array<{
    kind: string;
    entity_ids?: string[];
    relationship_ids?: string[];
    field?: string;
    values?: Record<string, unknown>;
    reason: string;
    evidence_ids: string[];
    warning?: string | null;
  }>;
  explanation?: string;
}

export function ContradictionResult({ data }: { data: ContradictionData }) {
  return (
    <Card className="border-destructive/30 bg-destructive/5">
      <CardHeader>
        <CardTitle className="text-sm font-semibold uppercase tracking-wider text-destructive flex items-center gap-2">
          <Zap className="w-4 h-4" /> Detected Contradictions
        </CardTitle>
        <CardDescription>Hypothesis conflicts requiring review</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[400px]">
          {(!data.findings || data.findings.length === 0) ? (
            <div className="p-12 flex flex-col items-center justify-center text-center text-muted-foreground space-y-3">
              <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                <AlertCircle className="w-6 h-6" />
              </div>
              <p>No contradictions detected in the current case context.</p>
            </div>
          ) : (
            <div className="divide-y divide-destructive/10">
              {data.findings.map((finding, idx) => (
                <div key={idx} className="p-5 hover:bg-destructive/10 transition-colors">
                  <div className="flex flex-col md:flex-row gap-4 justify-between items-start">
                    <div className="space-y-3 flex-1">
                      <div className="flex items-center gap-3">
                        <Badge variant="destructive" className="uppercase tracking-widest text-[10px]">
                          {finding.kind.replace(/_/g, " ")}
                        </Badge>
                        {finding.field && <span className="font-mono text-xs text-muted-foreground">{finding.field}</span>}
                      </div>
                      
                      <div className="flex items-center gap-3 font-mono text-sm bg-background/50 p-2 rounded border border-destructive/20 inline-flex">
                        {(finding.entity_ids ?? []).map(id => <span key={id}>{id.substring(0,8)}</span>)}
                      </div>

                      {(finding.reason || finding.warning) && (
                        <p className="text-sm text-foreground/80 leading-relaxed border-l-2 border-destructive pl-3">
                          {finding.reason || finding.warning}
                        </p>
                      )}
                    </div>

                    {finding.evidence_ids && finding.evidence_ids.length > 0 && (
                      <div className="flex flex-col items-end gap-2 min-w-[120px]">
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Conflicting Sources</span>
                        <div className="flex flex-col gap-1 w-full text-right">
                          {finding.evidence_ids.map(eid => (
                            <Link key={eid} href={`/evidence?evidence=${encodeURIComponent(eid)}`} className="text-xs font-mono text-destructive hover:underline">
                              {eid.substring(0,8)}
                            </Link>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
