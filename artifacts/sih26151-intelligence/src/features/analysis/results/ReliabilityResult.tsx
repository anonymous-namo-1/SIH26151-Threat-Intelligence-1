import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShieldAlert, CheckCircle2, ShieldQuestion } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ReliabilityData {
  items: Array<{
    evidence_id: string;
    score: number;
    warnings: string[];
  }>;
  average_score: number | null;
  explanation?: string;
}

export function ReliabilityResult({ data }: { data: ReliabilityData }) {
  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-emerald-500";
    if (score >= 50) return "text-warning";
    return "text-destructive";
  };
  
  const getScoreIcon = (score: number) => {
    if (score >= 80) return <CheckCircle2 className="w-5 h-5 text-emerald-500" />;
    if (score >= 50) return <ShieldQuestion className="w-5 h-5 text-warning" />;
    return <ShieldAlert className="w-5 h-5 text-destructive" />;
  };

  return (
    <div className="space-y-6">
      <div className="bg-muted p-4 rounded-md border border-border flex items-start gap-3 text-sm">
        <ShieldQuestion className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
        <div>
          <strong className="block mb-1">Completeness, Not Truth</strong>
          Reliability scores measure structural provenance completeness (source labels, integrity hashes, observed timestamps, and parsable content), not the factual truth of the evidence content itself.
        </div>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Graph Reliability</CardTitle>
              <CardDescription>Average structural integrity score</CardDescription>
            </div>
            <div className={`text-4xl font-bold font-mono ${data.average_score == null ? "text-muted-foreground" : getScoreColor(data.average_score)}`}>
              {data.average_score == null ? "Unavailable" : data.average_score.toFixed(1)}
            </div>
          </div>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Item Level Analysis</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[400px]">
            {(!data.items || data.items.length === 0) ? (
              <div className="p-8 text-center text-muted-foreground text-sm">No evidence items analyzed.</div>
            ) : (
              <div className="divide-y divide-border">
                {data.items.map((item, idx) => (
                  <div key={idx} className="p-4 hover:bg-muted/30 flex flex-col md:flex-row md:items-start gap-4">
                    <div className="flex items-center gap-3 md:w-48 shrink-0">
                      {getScoreIcon(item.score)}
                      <div>
                        <div className={`font-mono font-bold text-lg ${getScoreColor(item.score)}`}>{item.score}</div>
                        <div className="text-xs text-muted-foreground uppercase tracking-wider">Ref: {item.evidence_id.substring(0,8)}</div>
                      </div>
                    </div>
                    <div className="flex-1 space-y-2">
                      {item.warnings && item.warnings.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {item.warnings.map((w, i) => (
                            <Badge key={i} variant="secondary" className="bg-destructive/10 text-destructive border-destructive/20 text-xs font-normal">
                              {w}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <span className="text-sm text-emerald-600 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Structurally sound, no warnings.
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
