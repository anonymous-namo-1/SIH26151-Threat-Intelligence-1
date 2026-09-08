import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { 
  RelationshipType, 
  Attribution, 
  useCreateRelationship, 
  getGetCaseGraphQueryKey,
  useListEntities,
  getListEntitiesQueryKey
} from '@workspace/api-client-react';
import { useCaseWorkspace } from '@/hooks/use-case-workspace';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from 'react';

const relationshipSchema = z.object({
  source_id: z.string().min(1, "Source is required"),
  target_id: z.string().min(1, "Target is required"),
  type: z.nativeEnum(RelationshipType),
  confidence: z.number().min(0).max(1),
  explanation: z.string().min(1, "Reasoning is required"),
  evidence_ids: z.string().transform(str => str.split(',').map(s => s.trim()).filter(Boolean)),
});

type RelationshipFormProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultSourceId?: string;
  defaultTargetId?: string;
  onSuccess?: () => void;
};

export function RelationshipForm({ open, onOpenChange, defaultSourceId, defaultTargetId, onSuccess }: RelationshipFormProps) {
  const { caseId } = useCaseWorkspace();
  const queryClient = useQueryClient();
  const createRelationship = useCreateRelationship();
  const { data: entities = [] } = useListEntities(caseId, { query: { enabled: open && !!caseId, queryKey: getListEntitiesQueryKey(caseId) } });

  const form = useForm<z.infer<typeof relationshipSchema>>({
    resolver: zodResolver(relationshipSchema),
    defaultValues: {
      source_id: defaultSourceId || '',
      target_id: defaultTargetId || '',
      type: 'ASSOCIATED_WITH',
      confidence: 1.0,
      explanation: '',
      evidence_ids: [] as any,
    }
  });

  const onSubmit = (data: z.infer<typeof relationshipSchema>) => {
    if (!caseId) return;

    createRelationship.mutate({
      caseId,
      data: {
        source_id: data.source_id,
        target_id: data.target_id,
        type: data.type,
        confidence: data.confidence,
        explanation: data.explanation,
        attribution: Attribution.HUMAN,
        evidence_ids: data.evidence_ids.length > 0 ? data.evidence_ids : ["manual-entry"], // api requires minItems 1 usually for evidence, though real app would enforce valid ids.
      }
    }, {
      onSuccess: () => {
        toast.success("Relationship created");
        queryClient.invalidateQueries({ queryKey: getGetCaseGraphQueryKey(caseId) });
        form.reset();
        onOpenChange(false);
        onSuccess?.();
      },
      onError: (err) => {
        toast.error("Failed to create relationship");
        console.error(err);
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Add Relationship</DialogTitle>
          <DialogDescription>Link two entities with a hypothesis or evidence.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="source_id"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Source Entity</FormLabel>
                    <EntitySelector value={field.value} onChange={field.onChange} entities={entities} />
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="target_id"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Target Entity</FormLabel>
                    <EntitySelector value={field.value} onChange={field.onChange} entities={entities} />
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Relationship Type</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {Object.values(RelationshipType).map((type) => (
                          <SelectItem key={type} value={type}>{type.replace(/_/g, ' ')}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="confidence"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Confidence (0-1)</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.1" min="0" max="1" {...field} onChange={e => field.onChange(parseFloat(e.target.value))} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="explanation"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Hypothesis / Reasoning</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Explain why these are linked..." className="h-20 resize-none" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="evidence_ids"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Evidence IDs (comma separated)</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. ev_123, ev_456" {...field} value={field.value as any} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={createRelationship.isPending}>Add Relationship</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function EntitySelector({ value, onChange, entities }: { value: string, onChange: (v: string) => void, entities: any[] }) {
  const [open, setOpen] = useState(false);
  const selected = entities.find(e => e.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <FormControl>
          <Button
            variant="outline"
            role="combobox"
            className={cn("w-full justify-between font-normal", !value && "text-muted-foreground")}
          >
            {selected ? <span className="truncate max-w-[150px]">{selected.value}</span> : "Select entity"}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </FormControl>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search entity..." />
          <CommandList>
            <CommandEmpty>No entity found.</CommandEmpty>
            <CommandGroup>
              {entities.map((entity) => (
                <CommandItem
                  key={entity.id}
                  value={entity.value}
                  onSelect={() => {
                    onChange(entity.id);
                    setOpen(false);
                  }}
                >
                  <Check className={cn("mr-2 h-4 w-4", value === entity.id ? "opacity-100" : "opacity-0")} />
                  <span className="truncate">{entity.value}</span>
                  <span className="ml-2 text-xs text-muted-foreground uppercase">{entity.type.replace('_', '')}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
