import { useState, useMemo, useRef, useCallback } from "react";
import { useCaseWorkspace, CaseScope } from "@/hooks/use-case-workspace";
import { useListEntities, useCreateEntity, useGetMe, EntityType, type Entity } from "@workspace/api-client-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
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
import { Download, Search, Activity, CalendarClock, Shield, ArrowUp, ArrowDown, ArrowUpDown, Plus } from "lucide-react";
import { Link, useLocation } from "wouter";
import { format } from "date-fns";

const INFRA_TYPES = [
  EntityType.DOMAIN,
  EntityType.IP_ADDRESS,
  EntityType.ONION_SERVICE,
  EntityType.URL,
  EntityType.INFRASTRUCTURE,
  EntityType.DEVICE_INDICATOR
];

type SortField = "value" | "confidence" | "first_seen" | "last_seen";
type SortOrder = "asc" | "desc";

function escapeCsvFormula(field: unknown): string {
  if (field === null || field === undefined) return "";
  const str = String(field);
  if (/^[=+\-@]/.test(str)) {
    return "'" + str;
  }
  return str;
}

function CreateInfraIndicatorDialog({ caseId, onCreated }: { caseId: string, onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<EntityType>(EntityType.DOMAIN);
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
        <Button variant="outline" className="shrink-0">
          <Plus className="h-4 w-4 mr-2" /> Add Indicator
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Add Infrastructure Indicator</DialogTitle>
            <DialogDescription>Manually add an observable to the case.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Entity Type</Label>
              <Select value={type} onValueChange={(val) => setType(val as EntityType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INFRA_TYPES.map(t => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Observable Value</Label>
              <Input 
                value={value} 
                onChange={e => setValue(e.target.value)} 
                placeholder="e.g. example.com or 192.168.1.1" 
                className="font-mono"
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Source (Optional)</Label>
              <Input 
                value={source} 
                onChange={e => setSource(e.target.value)} 
                placeholder="e.g. Server Logs, VirusTotal" 
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

function InfrastructureContent() {
  const { caseId } = useCaseWorkspace();
  const [, setLocation] = useLocation();
  const { data: me } = useGetMe();
  const { data: entities = [], isLoading, refetch } = useListEntities(caseId);

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("ALL");
  const [sortField, setSortField] = useState<SortField>("value");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");

  const canExport = me?.permissions?.includes("report:export") ?? false;
  const canWrite = me?.permissions?.includes("case:edit") ?? false;

  const filteredAndSorted = useMemo(() => {
    let result = entities.filter(e => INFRA_TYPES.includes(e.type as any));
    
    if (typeFilter !== "ALL") {
      result = result.filter(e => e.type === typeFilter);
    }
    
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(e => 
        e.value.toLowerCase().includes(q) || 
        e.source.toLowerCase().includes(q) ||
        (e.description || "").toLowerCase().includes(q)
      );
    }

    result.sort((a, b) => {
      let aVal: any = a[sortField];
      let bVal: any = b[sortField];

      if (sortField === "first_seen" || sortField === "last_seen") {
        aVal = aVal ? new Date(aVal).getTime() : 0;
        bVal = bVal ? new Date(bVal).getTime() : 0;
      }
      
      if (aVal < bVal) return sortOrder === "asc" ? -1 : 1;
      if (aVal > bVal) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });

    return result;
  }, [entities, search, typeFilter, sortField, sortOrder]);

  const handleExport = () => {
    if (!canExport) return;
    
    const headers = ["ID", "Type", "Value", "Source", "Confidence", "First Seen", "Last Seen", "Tags"];
    const rows = filteredAndSorted.map(e => [
      e.id,
      e.type,
      escapeCsvFormula(e.value),
      escapeCsvFormula(e.source),
      e.confidence.toString(),
      e.first_seen ? new Date(e.first_seen).toISOString() : "",
      e.last_seen ? new Date(e.last_seen).toISOString() : "",
      e.tags.map(t => escapeCsvFormula(t)).join(";")
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    ].join("\\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `infrastructure_export_${caseId}_${new Date().toISOString()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("asc");
    }
  };

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) return <ArrowUpDown className="ml-2 h-4 w-4 text-muted-foreground/50" />;
    return sortOrder === "asc" ? <ArrowUp className="ml-2 h-4 w-4" /> : <ArrowDown className="ml-2 h-4 w-4" />;
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Infrastructure Intelligence</h1>
          <p className="text-muted-foreground mt-1">
            Track and analyze domains, IP addresses, and network observables.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          {canWrite && <CreateInfraIndicatorDialog caseId={caseId} onCreated={() => refetch()} />}
          {canExport && (
            <Button onClick={handleExport} variant="outline">
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader className="py-4 border-b">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search values, sources, descriptions..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="w-full sm:w-[200px]">
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Filter by type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Infrastructure</SelectItem>
                  {INFRA_TYPES.map(t => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[120px]">Type</TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => toggleSort("value")}
                  >
                    <div className="flex items-center">Observable {renderSortIcon("value")}</div>
                  </TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => toggleSort("confidence")}
                  >
                    <div className="flex items-center">Confidence {renderSortIcon("confidence")}</div>
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => toggleSort("first_seen")}
                  >
                    <div className="flex items-center">First Seen {renderSortIcon("first_seen")}</div>
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => toggleSort("last_seen")}
                  >
                    <div className="flex items-center">Last Seen {renderSortIcon("last_seen")}</div>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center">
                      <div className="flex items-center justify-center space-x-2 text-muted-foreground">
                        <Activity className="h-4 w-4 animate-pulse" />
                        <span>Loading infrastructure data...</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : filteredAndSorted.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                      No infrastructure indicators match your filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredAndSorted.map(entity => (
                    <TableRow 
                      key={entity.id} 
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setLocation(`/entities/${entity.id}`)}
                    >
                      <TableCell>
                        <Badge variant="secondary" className="text-[10px] font-mono uppercase">
                          {entity.type.replace('_', ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-sm font-medium">
                        {entity.value}
                        {entity.tags.length > 0 && (
                          <div className="flex gap-1 mt-1 flex-wrap">
                            {entity.tags.slice(0, 2).map(t => (
                              <span key={t} className="text-[9px] px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
                                {t}
                              </span>
                            ))}
                            {entity.tags.length > 2 && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                                +{entity.tags.length - 2}
                              </span>
                            )}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        <div className="flex items-center text-muted-foreground">
                          <Shield className="mr-1 h-3 w-3" />
                          {entity.source || "Unknown"}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center space-x-2">
                          <div className="h-1.5 w-16 bg-muted rounded-full overflow-hidden">
                            <div 
                              className={`h-full ${entity.confidence > 0.7 ? 'bg-emerald-500' : entity.confidence > 0.4 ? 'bg-warning' : 'bg-destructive'}`}
                              style={{ width: `${entity.confidence * 100}%` }}
                            />
                          </div>
                          <span className="text-xs font-mono">{Math.round(entity.confidence * 100)}%</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {entity.first_seen ? (
                          <div className="flex items-center">
                            <CalendarClock className="mr-1.5 h-3 w-3" />
                            {format(new Date(entity.first_seen), "MMM d, yyyy")}
                          </div>
                        ) : "-"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {entity.last_seen ? (
                          <div className="flex items-center">
                            <CalendarClock className="mr-1.5 h-3 w-3" />
                            {format(new Date(entity.last_seen), "MMM d, yyyy")}
                          </div>
                        ) : "-"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function Infrastructure() {
  return (
    <CaseScope>
      <InfrastructureContent />
    </CaseScope>
  );
}
