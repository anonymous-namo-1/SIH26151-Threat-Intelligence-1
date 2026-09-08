import { useState, useMemo, useRef, useCallback } from "react";
import { useCaseWorkspace, CaseScope } from "@/hooks/use-case-workspace";
import { 
  useListEntities, 
  useListRelationships, 
  useCreateEntity, 
  useGetMe, 
  EntityType,
  type Entity,
  type Relationship
} from "@workspace/api-client-react";
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogHeader, 
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { 
  Copy, 
  Check, 
  Wallet, 
  ArrowRightLeft, 
  Search, 
  Info, 
  Activity, 
  Plus, 
  Network, 
  FileText,
  AlertTriangle
} from "lucide-react";
import { Link } from "wouter";
import { format } from "date-fns";

const CRYPTO_TYPES = [EntityType.CRYPTO_WALLET, EntityType.CRYPTO_TRANSACTION];

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  
  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  
  return (
    <Button 
      variant="ghost" 
      size="icon" 
      className="h-6 w-6 ml-2 text-muted-foreground hover:text-foreground"
      onClick={handleCopy}
      title="Copy to clipboard"
    >
      {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
    </Button>
  );
}

function EntityInspector({ entity, relationships }: { entity: Entity; relationships: Relationship[] }) {
  if (!entity) return null;

  const entityRels = relationships.filter(
    r => r.source_id === entity.id || r.target_id === entity.id
  );

  const metaKeys = Object.keys(entity.metadata || {});

  return (
    <div className="flex flex-col h-full overflow-hidden animate-in slide-in-from-right-8 duration-300">
      <div className="p-4 border-b bg-muted/20">
        <div className="flex items-start justify-between">
          <div>
            <Badge variant="outline" className="mb-2 font-mono text-[10px] uppercase">
              {entity.type.replace('_', ' ')}
            </Badge>
            <div className="flex items-center">
              <h3 className="font-mono text-sm font-semibold break-all">{entity.value}</h3>
              <CopyButton text={entity.value} />
            </div>
            <p className="text-xs text-muted-foreground mt-1">Source: {entity.source || "Manual Entry"}</p>
          </div>
        </div>
      </div>
      
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-6">
          <div className="rounded-md border bg-warning/10 p-3 flex gap-3">
            <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
            <div className="text-xs text-warning-foreground leading-relaxed">
              <strong>Disclaimer:</strong> This record represents supplied intelligence evidence only. No live blockchain enrichment, balance checks, or on-chain verifications are performed automatically.
            </div>
          </div>

          {entity.description && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Description</h4>
              <p className="text-sm">{entity.description}</p>
            </div>
          )}

          {metaKeys.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Metadata</h4>
              <div className="grid grid-cols-1 gap-2">
                {metaKeys.map(k => (
                  <div key={k} className="flex justify-between border-b pb-1">
                    <span className="text-xs text-muted-foreground">{k.replace(/_/g, ' ')}</span>
                    <span className="text-xs font-mono text-right max-w-[200px] truncate" title={String(entity.metadata[k])}>
                      {String(entity.metadata[k])}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Relationships ({entityRels.length})</h4>
            {entityRels.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">No relationships mapped.</p>
            ) : (
              <div className="space-y-2">
                {entityRels.slice(0, 5).map(rel => {
                  const isSource = rel.source_id === entity.id;
                  const otherId = isSource ? rel.target_id : rel.source_id;
                  return (
                    <div key={rel.id} className="text-xs p-2 rounded border bg-card">
                      <div className="flex items-center gap-1.5 font-mono mb-1">
                        <span className="text-muted-foreground">{isSource ? 'Out' : 'In'}</span>
                        <Badge variant="secondary" className="text-[9px] px-1">{rel.type}</Badge>
                      </div>
                      <div className="flex justify-between items-center mt-2">
                        <span className="truncate max-w-[150px] opacity-80" title={otherId}>{otherId.substring(0, 12)}...</span>
                        {rel.evidence_ids.length > 0 && (
                          <Link href={`/evidence/${rel.evidence_ids[0]}`} className="text-primary hover:underline flex items-center">
                            <FileText className="h-3 w-3 mr-1" /> Ref
                          </Link>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </ScrollArea>
      
      <div className="p-4 border-t bg-muted/10 flex justify-between gap-2">
        <Button variant="outline" size="sm" className="w-full text-xs" asChild>
          <Link href="/graph">
            <Network className="h-3.5 w-3.5 mr-2" /> Explore Graph
          </Link>
        </Button>
        <Button variant="outline" size="sm" className="w-full text-xs" asChild>
          <Link href={`/entities/${entity.id}`}>
            <Info className="h-3.5 w-3.5 mr-2" /> Full Details
          </Link>
        </Button>
      </div>
    </div>
  );
}

function CreateIndicatorDialog({ caseId, onCreated }: { caseId: string, onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<EntityType>(EntityType.CRYPTO_WALLET);
  const [value, setValue] = useState("");
  const [source, setSource] = useState("");
  const [description, setDescription] = useState("");
  
  const createMutation = useCreateEntity();
  const mutateFnRef = useRef(createMutation.mutate);
  mutateFnRef.current = createMutation.mutate;

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (!value.trim()) return;
    
    mutateFnRef.current(
      { 
        caseId, 
        data: { 
          type, 
          value: value.trim(), 
          source: source.trim(), 
          description: description.trim(),
          confidence: 1.0
        } 
      },
      {
        onSuccess: () => {
          setOpen(false);
          setValue("");
          setSource("");
          setDescription("");
          onCreated();
        }
      }
    );
  }, [caseId, type, value, source, description, onCreated]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4 mr-2" /> Add Indicator
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Add Crypto Indicator</DialogTitle>
            <DialogDescription>Manually add a known wallet or transaction hash to the case.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Entity Type</Label>
              <Select value={type} onValueChange={(val) => setType(val as EntityType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={EntityType.CRYPTO_WALLET}>Crypto Wallet</SelectItem>
                  <SelectItem value={EntityType.CRYPTO_TRANSACTION}>Transaction Hash</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Value / Address / Hash</Label>
              <Input 
                value={value} 
                onChange={e => setValue(e.target.value)} 
                placeholder="0x..." 
                className="font-mono"
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Source (Optional)</Label>
              <Input 
                value={source} 
                onChange={e => setSource(e.target.value)} 
                placeholder="e.g. OFAC Sanctions List, Darkweb Forum" 
              />
            </div>
            <div className="space-y-2">
              <Label>Description & Notes (Optional)</Label>
              <Textarea 
                value={description} 
                onChange={e => setDescription(e.target.value)} 
                placeholder="Context for this indicator..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" type="button">Cancel</Button>
            </DialogClose>
            <Button type="submit" disabled={createMutation.isPending || !value.trim()}>
              {createMutation.isPending ? "Adding..." : "Add Indicator"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function WalletsContent() {
  const { caseId } = useCaseWorkspace();
  const { data: me } = useGetMe();
  const { data: entities = [], isLoading: isEntitiesLoading, refetch } = useListEntities(caseId);
  const { data: relationships = [] } = useListRelationships(caseId);

  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const canWrite = me?.permissions?.includes("case:edit") ?? false;

  const cryptoEntities = useMemo(() => {
    let result = entities.filter(e => CRYPTO_TYPES.includes(e.type as any));
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(e => 
        e.value.toLowerCase().includes(q) || 
        (e.source || "").toLowerCase().includes(q)
      );
    }
    return result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [entities, search]);

  const selectedEntity = useMemo(() => {
    return cryptoEntities.find(e => e.id === selectedId) || null;
  }, [cryptoEntities, selectedId]);

  return (
    <div className="h-full flex flex-col space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Crypto Intelligence</h1>
          <p className="text-muted-foreground mt-1">
            Track and analyze cryptocurrency wallets and transaction patterns.
          </p>
        </div>
        {canWrite && <CreateIndicatorDialog caseId={caseId} onCreated={() => refetch()} />}
      </div>

      <div className="flex flex-col lg:flex-row gap-6 h-[600px]">
        <Card className="flex-1 flex flex-col overflow-hidden">
          <CardHeader className="py-4 border-b shrink-0">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search addresses, hashes, or sources..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </CardHeader>
          <div className="flex-1 overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-card z-10 shadow-sm">
                <TableRow>
                  <TableHead className="w-[40px]"></TableHead>
                  <TableHead>Indicator</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Added</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isEntitiesLoading ? (
                  <TableRow>
                    <TableCell colSpan={4} className="h-32 text-center text-muted-foreground">
                      <Activity className="h-5 w-5 animate-pulse mx-auto mb-2" />
                      Loading indicators...
                    </TableCell>
                  </TableRow>
                ) : cryptoEntities.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="h-32 text-center text-muted-foreground">
                      No crypto intelligence found in this case.
                    </TableCell>
                  </TableRow>
                ) : (
                  cryptoEntities.map(entity => {
                    const isWallet = entity.type === EntityType.CRYPTO_WALLET;
                    const isSelected = selectedId === entity.id;
                    return (
                      <TableRow 
                        key={entity.id} 
                        className={`cursor-pointer transition-colors ${isSelected ? 'bg-primary/5 hover:bg-primary/10' : 'hover:bg-muted/50'}`}
                        onClick={() => setSelectedId(entity.id)}
                      >
                        <TableCell>
                          <div className={`p-1.5 rounded-md ${isWallet ? 'bg-blue-500/10 text-blue-500' : 'bg-purple-500/10 text-purple-500'}`}>
                            {isWallet ? <Wallet className="h-4 w-4" /> : <ArrowRightLeft className="h-4 w-4" />}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="font-mono text-sm font-medium max-w-[200px] sm:max-w-[300px] truncate" title={entity.value}>
                            {entity.value}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[120px] truncate">
                          {entity.source || "Manual Entry"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {format(new Date(entity.created_at), "MMM d, yyyy")}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </Card>

        {selectedEntity ? (
          <Card className="w-full lg:w-[400px] shrink-0 flex flex-col overflow-hidden">
            <EntityInspector entity={selectedEntity} relationships={relationships} />
          </Card>
        ) : (
          <Card className="w-full lg:w-[400px] shrink-0 flex flex-col justify-center items-center p-8 text-center bg-muted/10 border-dashed">
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-4">
              <Info className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="font-medium mb-1">Inspector</h3>
            <p className="text-sm text-muted-foreground">Select a wallet or transaction hash from the list to view metadata, relationships, and context.</p>
          </Card>
        )}
      </div>
    </div>
  );
}

export function Wallets() {
  return (
    <CaseScope>
      <WalletsContent />
    </CaseScope>
  );
}
