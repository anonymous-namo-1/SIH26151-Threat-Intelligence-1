import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Network, Link2, Link2Off } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

import { Link } from "wouter";

interface RelationshipData {
  edges: Array<{
    source_entity_id: string;
    target_entity_id: string;
    type: string;
    confidence?: number;
    evidence_ids?: string[];
  }>;
  cited_edge_count: number;
  uncited_edge_count: number;
  explanation?: string;
}

export function RelationshipResult({ data }: { data: RelationshipData }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 flex flex-col items-center text-center justify-center space-y-2">
            <Network className="w-5 h-5 text-muted-foreground mb-1" />
            <div className="text-3xl font-mono font-bold">{data.edges?.length || 0}</div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider">Supplied Relationships</div>
          </CardContent>
        </Card>
        <Card className="border-emerald-500/20 bg-emerald-500/5">
          <CardContent className="p-4 flex flex-col items-center text-center justify-center space-y-2">
            <Link2 className="w-5 h-5 text-emerald-500 mb-1" />
            <div className="text-3xl font-mono font-bold text-emerald-600">{data.cited_edge_count || 0}</div>
            <div className="text-xs text-emerald-600/70 uppercase tracking-wider">Cited Edges</div>
          </CardContent>
        </Card>
        <Card className="border-warning/20 bg-warning/5 col-span-2 md:col-span-1">
          <CardContent className="p-4 flex flex-col items-center text-center justify-center space-y-2">
            <Link2Off className="w-5 h-5 text-warning mb-1" />
            <div className="text-3xl font-mono font-bold text-warning">{data.uncited_edge_count || 0}</div>
            <div className="text-xs text-warning/70 uppercase tracking-wider">Uncited Edges</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Case Relationship Review</CardTitle>
          <CardDescription>Existing case relationships and their supporting evidence references</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[400px]">
            {(!data.edges || data.edges.length === 0) ? (
              <div className="p-8 text-center text-muted-foreground text-sm">No relationships inferred.</div>
            ) : (
              <div className="divide-y divide-border">
                {data.edges.map((edge, idx) => (
                  <div key={idx} className="p-4 hover:bg-muted/30 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className="font-mono text-sm">{edge.source_entity_id?.substring(0, 8) ?? "Unknown"}</div>
                      <Badge variant="outline" className="px-2 py-0.5 rounded-full bg-primary/5 text-primary text-[10px] uppercase tracking-widest border-primary/20">
                        {edge.type}
                      </Badge>
                      <div className="font-mono text-sm">{edge.target_entity_id?.substring(0, 8) ?? "Unknown"}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      {edge.confidence !== undefined && (
                        <div className="text-xs font-mono text-muted-foreground">
                          {edge.confidence.toFixed(1)}% conf
                        </div>
                      )}
                      {edge.evidence_ids && edge.evidence_ids.length > 0 ? (
                        <div className="flex flex-col gap-1 items-end">
                          <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 text-[10px]">
                            {edge.evidence_ids.length} Citations
                          </Badge>
                          <div className="flex flex-wrap gap-1 justify-end max-w-[150px]">
                            {edge.evidence_ids.map(eid => (
                              <Link key={eid} href={`/evidence?evidence=${encodeURIComponent(eid)}`} className="text-[10px] text-emerald-600/80 hover:text-emerald-500 hover:underline">
                                {eid.substring(0,8)}
                              </Link>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <Badge variant="outline" className="text-warning border-warning/30 text-[10px]">
                          Uncited Heuristic
                        </Badge>
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
