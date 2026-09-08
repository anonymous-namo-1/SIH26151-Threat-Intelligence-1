import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Server, Share2, Shield, Globe, HardDrive } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

import { Link } from "wouter";

interface InfrastructureData {
  reuse_paths: Array<{
    kind: string; // 'domains', 'ips', 'certs', etc.
    value: string;
    entity_ids: string[];
    evidence_ids: string[];
  }>;
  observed_counts: Record<string, number>;
  timestamps: string[];
  explanation?: string;
}

export function InfrastructureResult({ data }: { data: InfrastructureData }) {
  const getKindIcon = (kind: string) => {
    switch (kind.toLowerCase()) {
      case 'domains': return <Globe className="w-4 h-4" />;
      case 'ips': return <Server className="w-4 h-4" />;
      case 'certs': return <Shield className="w-4 h-4" />;
      default: return <HardDrive className="w-4 h-4" />;
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Object.entries(data.observed_counts || {}).map(([kind, count]) => (
          <Card key={kind}>
            <CardContent className="p-4 flex flex-col items-center text-center justify-center space-y-2">
              <div className="p-3 bg-primary/10 rounded-full text-primary">
                {getKindIcon(kind)}
              </div>
              <div className="text-2xl font-mono font-bold">{count}</div>
              <div className="text-xs text-muted-foreground uppercase tracking-wider">{kind}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <Share2 className="w-4 h-4" /> Infrastructure Overlaps
          </CardTitle>
          <CardDescription>Shared resources indicating common management or administration</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[400px]">
            {(!data.reuse_paths || data.reuse_paths.length === 0) ? (
              <div className="p-8 text-center text-muted-foreground text-sm">No significant infrastructure reuse detected.</div>
            ) : (
              <div className="divide-y divide-border">
                {data.reuse_paths.map((path, idx) => (
                  <div key={idx} className="p-4 hover:bg-muted/30 transition-colors flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-muted rounded-md text-muted-foreground">
                        {getKindIcon(path.kind)}
                      </div>
                      <div>
                        <div className="font-mono text-sm font-semibold">{path.value}</div>
                        <div className="text-xs text-muted-foreground uppercase tracking-wider mt-1">{path.kind}</div>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 md:justify-end">
                      {path.entity_ids.map(eid => (
                        <Badge key={eid} variant="outline" className="font-mono text-[10px]">
                          Entity: {eid.substring(0,8)}
                        </Badge>
                      ))}
                      {path.evidence_ids.map(evid => (
                        <Link key={evid} href={`/evidence?evidence=${encodeURIComponent(evid)}`}>
                          <Badge variant="secondary" className="font-mono text-[10px] bg-primary/10 text-primary hover:bg-primary/20 border-primary/20 cursor-pointer">
                            Ref: {evid.substring(0,8)}
                          </Badge>
                        </Link>
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
