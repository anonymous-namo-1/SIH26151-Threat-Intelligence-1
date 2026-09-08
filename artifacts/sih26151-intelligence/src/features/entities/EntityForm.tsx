import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { EntityType, useCreateEntity, getListEntitiesQueryKey, getGetCaseGraphQueryKey } from '@workspace/api-client-react';
import { useCaseWorkspace } from '@/hooks/use-case-workspace';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const entitySchema = z.object({
  type: z.nativeEnum(EntityType),
  value: z.string().min(1).max(2000),
  confidence: z.number().min(0).max(1),
  source: z.string().optional(),
  description: z.string().optional(),
});

type EntityFormProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
};

export function EntityForm({ open, onOpenChange, onSuccess }: EntityFormProps) {
  const { caseId } = useCaseWorkspace();
  const queryClient = useQueryClient();
  const createEntity = useCreateEntity();

  const form = useForm<z.infer<typeof entitySchema>>({
    resolver: zodResolver(entitySchema),
    defaultValues: {
      type: 'PERSONA',
      value: '',
      confidence: 1.0,
      source: 'Manual Entry',
      description: ''
    }
  });

  const onSubmit = (data: z.infer<typeof entitySchema>) => {
    if (!caseId) return;

    createEntity.mutate({
      caseId,
      data: {
        type: data.type,
        value: data.value,
        confidence: data.confidence,
        source: data.source,
        description: data.description,
      }
    }, {
      onSuccess: () => {
        toast.success("Entity created");
        queryClient.invalidateQueries({ queryKey: getListEntitiesQueryKey(caseId) });
        queryClient.invalidateQueries({ queryKey: getGetCaseGraphQueryKey(caseId) });
        form.reset();
        onOpenChange(false);
        onSuccess?.();
      },
      onError: () => toast.error("Failed to create entity")
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Add Entity</DialogTitle>
          <DialogDescription>Manually introduce a new entity into the investigation.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Entity Type</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {Object.values(EntityType).map((type) => (
                          <SelectItem key={type} value={type}>{type.replace('_', ' ')}</SelectItem>
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
              name="value"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Value / Identifier</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. John Doe, 192.168.1.1" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description & Notes</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Context for this entity..." className="h-20 resize-none" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={createEntity.isPending}>Add Entity</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
