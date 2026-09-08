import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Type } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface StylometryData {
  similarity: number | null;
  reliability: string;
  sample_size_warning: string | null;
  features: {
    left: Record<string, unknown>;
    right: Record<string, unknown>;
  };
  explanation?: string;
}

export function StylometryResult({ data }: { data: StylometryData }) {
  const formatFeature = (value: unknown): string => {
    if (typeof value === "number") return value.toFixed(2);
    if (value == null) return "Not observed";
    if (Array.isArray(value)) return value.map(String).join(", ");
    if (typeof value === "object") return Object.entries(value)
      .map(([key, count]) => `${key}: ${String(count)}`).join(" · ");
    return String(value);
  };
  const featureKeys = Array.from(new Set([
    ...Object.keys(data.features?.left || {}),
    ...Object.keys(data.features?.right || {})
  ])).filter(k => k !== "word_count" && k !== "character_count"); // exclude raw lengths from features if they were dumped there

  const getReliabilityColor = (rel: string) => {
    switch (rel.toLowerCase()) {
      case 'high': return 'bg-emerald-500/20 text-emerald-600 border-emerald-500/30';
      case 'medium': return 'bg-warning/20 text-warning border-warning/30';
      case 'low': return 'bg-destructive/20 text-destructive border-destructive/30';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const lCount = Number(data.features?.left?.words ?? 0);
  const rCount = Number(data.features?.right?.words ?? 0);

  return (
    <div className="space-y-6">
      {data.sample_size_warning && (
        <div className="bg-destructive/10 text-destructive border border-destructive/20 p-4 rounded-md text-sm flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <div>
            <strong className="block mb-1">Sample Size Warning</strong>
            {data.sample_size_warning}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Match Metrics</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <p className="text-xs text-muted-foreground mb-1 uppercase tracking-wider">Similarity Score</p>
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-mono font-bold">{data.similarity == null ? "Unavailable" : `${data.similarity.toFixed(1)}%`}</span>
              </div>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-2 uppercase tracking-wider">Reliability</p>
              <Badge variant="outline" className={`uppercase ${getReliabilityColor(data.reliability || 'low')}`}>
                {data.reliability || 'Unknown'}
              </Badge>
            </div>
            
            <div className="pt-4 border-t border-border">
              <p className="text-xs text-muted-foreground mb-2 uppercase tracking-wider">Word Counts</p>
              <div className="flex justify-between items-center text-sm font-mono bg-muted/50 p-2 rounded mb-1">
                <span>Corpus A</span>
                <span className={lCount < 500 ? 'text-destructive font-bold' : ''}>{lCount} words</span>
              </div>
              <div className="flex justify-between items-center text-sm font-mono bg-muted/50 p-2 rounded">
                <span>Corpus B</span>
                <span className={rCount < 500 ? 'text-destructive font-bold' : ''}>{rCount} words</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Type className="w-4 h-4" /> Linguistic Features
            </CardTitle>
            <CardDescription>
              Descriptive features of each corpus. Only vocabulary overlap (50%), sentence-length similarity (30%), and average word-length similarity (20%) drive this offline score. Other features provide context, not additional scoring points.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {featureKeys.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">No extractable features found.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Feature Metric</TableHead>
                    <TableHead className="text-right">Corpus A</TableHead>
                    <TableHead className="text-right">Corpus B</TableHead>
                    <TableHead className="text-right">Delta</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {featureKeys.map(key => {
                    const l = data.features?.left?.[key];
                    const r = data.features?.right?.[key];
                    const delta = typeof l === "number" && typeof r === "number" ? Math.abs(l - r) : null;
                    const formattedName = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                    
                    return (
                      <TableRow key={key}>
                        <TableCell className="font-medium text-xs">{formattedName}</TableCell>
                        <TableCell className="text-right font-mono text-xs max-w-[240px] whitespace-normal break-words">{formatFeature(l)}</TableCell>
                        <TableCell className="text-right font-mono text-xs max-w-[240px] whitespace-normal break-words">{formatFeature(r)}</TableCell>
                        <TableCell className="text-right font-mono text-xs text-muted-foreground">
                          {delta == null ? "—" : `±${delta.toFixed(2)}`}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
