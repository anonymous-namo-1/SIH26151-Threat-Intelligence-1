import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { UserPlus, Hash } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface AliasData {
  aliases: Array<{
    normalized_alias: string;
    entity_ids: string[];
  }>;
  overlaps: Array<{
    normalized_alias: string;
    entity_ids: string[];
    uncertainty?: boolean;
  }>;
  explanation?: string;
}

export function AliasResult({ data }: { data: AliasData }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <Hash className="w-4 h-4" /> Detected Aliases
          </CardTitle>
          <CardDescription>Distinct normalized handles found</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[400px]">
            {(!data.aliases || data.aliases.length === 0) ? (
              <div className="p-8 text-center text-muted-foreground text-sm">No aliases detected.</div>
            ) : (
              <div className="divide-y divide-border">
                {data.aliases.map((alias, idx) => (
                  <div key={idx} className="p-4 hover:bg-muted/30">
                    <div className="font-mono font-semibold text-lg mb-2">{alias.normalized_alias}</div>
                    <div className="flex flex-wrap gap-1">
                      {alias.entity_ids.map(eid => (
                        <Badge key={eid} variant="outline" className="text-[10px] font-mono">
                          {eid.substring(0, 8)}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      <Card className="border-primary/20">
        <CardHeader>
          <CardTitle className="text-sm font-semibold uppercase tracking-wider text-primary flex items-center gap-2">
            <UserPlus className="w-4 h-4" /> Exact Overlaps
          </CardTitle>
          <CardDescription>Handles shared across distinct entities</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[400px]">
            {(!data.overlaps || data.overlaps.length === 0) ? (
              <div className="p-8 text-center text-muted-foreground text-sm">No overlapping alias usage found.</div>
            ) : (
              <div className="divide-y divide-border">
                {data.overlaps.map((overlap, idx) => (
                  <div key={idx} className="p-4 bg-primary/5 hover:bg-primary/10 transition-colors">
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-mono font-bold text-lg text-primary">{overlap.normalized_alias}</div>
                      {overlap.uncertainty && (
                        <Badge variant="secondary" className="bg-warning/20 text-warning hover:bg-warning/30 border-warning/30 text-[10px]">
                          Uncertain Resolution
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-muted-foreground">Used by:</span>
                      {overlap.entity_ids.map(eid => (
                        <Badge key={eid} variant="outline" className="text-[10px] font-mono border-primary/30">
                          {eid.substring(0, 8)}
                        </Badge>
                      ))}
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
