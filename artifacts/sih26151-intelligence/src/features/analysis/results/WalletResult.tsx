import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, ArrowRightLeft, ExternalLink, Activity } from "lucide-react";
import { formatUtc } from "./formatUtc";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ResponsiveContainer, CartesianGrid } from "recharts";

interface WalletData {
  transactions: Array<{
    hash: string;
    from_address: string;
    to_address: string;
    amount: string; // Exact decimal string
    asset: string;
    timestamp: string;
    labels?: string[];
    entity_id?: string;
    evidence_ids?: string[];
  }>;
  transaction_count: number;
  totals_by_asset: Record<string, string>; // Exact decimal string
  counterparties: Record<string, any>; // Not specifically detailed, maybe empty
  counterparty_graph: { edges: Array<{ from_address: string; to_address: string; label?: string; type?: string }> }; 
  timeline: Array<{ timestamp: string; amount: string; type: "in" | "out"; asset: string }>; 
  public_metadata?: Array<{ entity_id: string; metadata: Record<string, unknown> }>;
  balances: null;
  evidence_ids?: string[];
  warnings?: string[];
  explanation?: string;
}

export function WalletResult({ data }: { data: WalletData }) {
  const formatEthHash = (input: unknown) => {
    const hash = typeof input === "string" ? input : "(not supplied)";
    if (hash.length > 12) return `${hash.substring(0, 6)}...${hash.substring(hash.length - 4)}`;
    return hash;
  };

  const timelineEvents = [...(data.timeline || [])].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  // Prepare simple circular layout for SVG graph
  const edges = (data.counterparty_graph?.edges || []).filter(edge =>
    typeof edge.from_address === "string" && typeof edge.to_address === "string"
  );
  const nodes = Array.from(new Set(edges.flatMap(e => [e.from_address, e.to_address])));
  const cx = 150, cy = 150, r = 120;
  const nodePositions = nodes.map((node, i) => {
    const angle = (i / Math.max(nodes.length, 1)) * 2 * Math.PI;
    return {
      id: node,
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle)
    };
  });
  const getNodePos = (id: string) => nodePositions.find(n => n.id === id) || { x: cx, y: cy };

  return (
    <div className="space-y-6">
      {data.warnings && data.warnings.length > 0 && (
        <div className="bg-warning/10 text-warning p-4 rounded-md text-sm flex flex-col gap-2 border border-warning/20">
          <div className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <p>Wallet Analysis Warnings</p>
          </div>
          <ul className="list-disc pl-6 space-y-1">
            {data.warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      )}

      {data.public_metadata && data.public_metadata.length > 0 && (
        <Card className="border-info/30 bg-info/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <ExternalLink className="w-4 h-4" /> Public Metadata / OSINT
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {data.public_metadata.map((meta, i) => (
                <div key={i} className="flex flex-col gap-2 text-sm items-start border-b pb-4 last:border-0 last:pb-0">
                  <Badge variant="outline" className="bg-background font-mono">{meta.entity_id}</Badge>
                  <pre className="text-xs bg-muted/50 p-2 rounded w-full overflow-auto text-muted-foreground">
                    {JSON.stringify(meta.metadata, null, 2)}
                  </pre>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Volume Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <p className="text-xs text-muted-foreground mb-1 uppercase tracking-wider">Total Transactions</p>
              <p className="text-2xl font-mono">{data.transaction_count}</p>
            </div>
            
            <div>
              <p className="text-xs text-muted-foreground mb-3 uppercase tracking-wider">Observed Flow (Totals)</p>
              {Object.keys(data.totals_by_asset || {}).length === 0 ? (
                <p className="text-sm text-muted-foreground">No volume recorded</p>
              ) : (
                <div className="space-y-2">
                  {Object.entries(data.totals_by_asset).map(([asset, amount]) => (
                    <div key={asset} className="flex justify-between items-center bg-muted/50 p-2 rounded">
                      <span className="font-semibold">{asset}</span>
                      <span className="font-mono">{amount}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-3">
          <CardHeader>
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Activity Timeline</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[250px] w-full">
              {timelineEvents.length === 0 ? (
                <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm border-2 border-dashed border-border rounded-md">
                  No timeline data available
                </div>
              ) : (
                <ScrollArea className="h-full pr-4">
                  <div className="space-y-4 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-muted before:to-transparent">
                    {timelineEvents.map((evt, idx) => (
                      <div key={idx} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                        <div className="flex items-center justify-center w-10 h-10 rounded-full border border-border bg-background shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 shadow-sm">
                          <div className={`w-3 h-3 rounded-full ${evt.type === 'in' ? 'bg-emerald-500' : 'bg-destructive'}`}></div>
                        </div>
                        <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-3 rounded-md border border-border bg-card shadow-sm">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-mono text-xs text-muted-foreground">
                              {evt.timestamp ? (
                                (() => {
                                  try { return formatUtc(evt.timestamp); }
                                  catch (e) { return evt.timestamp; }
                                })()
                              ) : "-"}
                            </span>
                            <Badge variant="outline" className={`text-[10px] uppercase ${evt.type === 'in' ? 'text-emerald-500 border-emerald-500/30' : 'text-destructive border-destructive/30'}`}>
                              {evt.type}
                            </Badge>
                          </div>
                          <div className="font-mono text-sm font-bold">
                            {evt.amount} <span className="text-xs text-muted-foreground">{evt.asset}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <ArrowRightLeft className="w-4 h-4" /> Transactions
            </CardTitle>
            <CardDescription>Observed flows related to this wallet</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[350px] w-full">
              {(!data.transactions || data.transactions.length === 0) ? (
                <div className="p-8 text-center text-muted-foreground">No transactions found in evidence base.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Time / Hash</TableHead>
                      <TableHead>Flow</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.transactions.map((tx, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="font-mono text-xs">
                          <div className="text-muted-foreground">
                            {tx.timestamp ? (
                              (() => {
                                try { return formatUtc(tx.timestamp); }
                                catch (e) { return tx.timestamp; }
                              })()
                            ) : "-"}
                          </div>
                          <div className="text-primary truncate max-w-[120px]" title={tx.hash}>{formatEthHash(tx.hash)}</div>
                          {tx.labels && tx.labels.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {tx.labels.map((l, i) => <Badge key={i} variant="secondary" className="text-[9px] px-1 py-0">{l}</Badge>)}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          <div className="font-bold flex items-center gap-1">
                            {tx.amount} <span className="text-[10px] text-muted-foreground">{tx.asset}</span>
                          </div>
                          <div className="text-[10px] text-muted-foreground truncate max-w-[150px] mt-1" title={`${tx.from_address} -> ${tx.to_address}`}>
                            F: {formatEthHash(tx.from_address)}<br/>
                            T: {formatEthHash(tx.to_address)}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
        
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Activity className="w-4 h-4" /> Counterparty Graph
            </CardTitle>
            <CardDescription>Network structure of direct interactions</CardDescription>
          </CardHeader>
          <CardContent className="h-[350px] flex items-center justify-center bg-muted/10">
            {(!data.counterparty_graph || !data.counterparty_graph.edges || data.counterparty_graph.edges.length === 0) ? (
               <div className="text-sm text-muted-foreground">No counterparty edges found.</div>
            ) : (
               <div className="relative w-full max-w-[300px] aspect-square">
                 <svg viewBox="0 0 300 300" className="absolute inset-0 h-full w-full" role="img" aria-label="Supplied transaction counterparty graph">
                   <defs>
                     <marker id="arrowhead" markerWidth="6" markerHeight="4" refX="16" refY="2" orient="auto">
                       <polygon points="0 0, 6 2, 0 4" fill="hsl(var(--muted-foreground))" />
                     </marker>
                   </defs>
                   {/* Draw edges */}
                   {edges.map((edge, i) => {
                     const s = getNodePos(edge.from_address);
                     const t = getNodePos(edge.to_address);
                     return (
                       <g key={`edge-${i}`}>
                         <line x1={s.x} y1={s.y} x2={t.x} y2={t.y} stroke="hsl(var(--muted-foreground))" strokeWidth="1" opacity="0.5" markerEnd="url(#arrowhead)" />
                       </g>
                     );
                   })}
                   {/* Draw nodes */}
                   {nodePositions.map((pos) => (
                     <g key={pos.id} transform={`translate(${pos.x}, ${pos.y})`}>
                       <circle r="6" fill="hsl(var(--primary))" />
                       <text y="16" fontSize="8" fill="hsl(var(--foreground))" textAnchor="middle" className="font-mono">
                         {formatEthHash(pos.id)}
                       </text>
                     </g>
                   ))}
                 </svg>
               </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
