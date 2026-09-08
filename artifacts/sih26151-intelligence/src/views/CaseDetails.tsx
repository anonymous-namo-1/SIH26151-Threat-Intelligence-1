import { useEffect, useState, useRef } from 'react';
import { useRoute, useLocation } from 'wouter';
import { 
  useGetCase, 
  getGetCaseQueryKey,
  useCreateCase, 
  useUpdateCase, 
  useDeleteCase,
  useGetMe,
  getListCasesQueryKey,
  Priority, 
  CaseStatus, 
  Classification 
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { useListUsers } from '@workspace/api-client-react';
import { Loader2, ArrowLeft, Save, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Link } from 'wouter';
import { useCaseWorkspace } from '@/hooks/use-case-workspace';

export function CaseDetails() {
  const [, params] = useRoute('/cases/:id');
  const [, setLocation] = useLocation();
  const id = params?.id;
  const isNew = !id || id === 'new';
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { setCaseId } = useCaseWorkspace();

  const { data: me } = useGetMe();
  const canDelete = me?.permissions.includes('case:delete');
  const canEdit = me?.permissions.includes('case:edit');
  const canCreate = me?.permissions.includes('case:create');

  const { data: existingCase, isLoading: isLoadingCase } = useGetCase(id || '', {
    query: { enabled: !isNew, queryKey: getGetCaseQueryKey(id || '') }
  });

  const createCase = useCreateCase();
  const updateCase = useUpdateCase();
  const deleteCase = useDeleteCase();
  
  const { data: usersData } = useListUsers();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [priority, setPriority] = useState<Priority>('MEDIUM');
  const [status, setStatus] = useState<CaseStatus>('OPEN');
  const [classification, setClassification] = useState<Classification>('UNCLASSIFIED');
  const [tags, setTags] = useState('');
  const [assignments, setAssignments] = useState('');

  const initializedRef = useRef(false);

  useEffect(() => {
    initializedRef.current = false;
  }, [id]);

  useEffect(() => {
    if (id && id !== 'new') {
      setCaseId(id);
    }
  }, [id, setCaseId]);

  useEffect(() => {
    if (existingCase && !initializedRef.current) {
      setTitle(existingCase.title);
      setDescription(existingCase.description || '');
      setNotes(existingCase.notes || '');
      setPriority(existingCase.priority);
      setStatus(existingCase.status);
      setClassification(existingCase.classification);
      setTags(existingCase.tags?.join(', ') || '');
      setAssignments(existingCase.assignments?.map(u => u.id).join(', ') || '');
      initializedRef.current = true;
    }
  }, [existingCase]);

  const handleSave = () => {
    // Validate UUIDs
    const assignmentList = assignments.split(',').map(t => t.trim()).filter(Boolean);
    if (assignmentList.length > 0 && usersData) {
      const validIds = usersData.map(u => u.id);
      const invalidIds = assignmentList.filter(id => !validIds.includes(id));
      if (invalidIds.length > 0) {
        toast({ title: 'Invalid User IDs', description: `These UUIDs do not exist: ${invalidIds.join(', ')}`, variant: 'destructive' });
        return;
      }
    }

    const payload = {
      title,
      description,
      notes,
      priority,
      status,
      classification,
      tags: tags.split(',').map(t => t.trim()).filter(Boolean),
      assignment_ids: assignmentList
    };

    if (isNew) {
      createCase.mutate({ data: payload }, {
        onSuccess: (newCase) => {
          toast({ title: 'Case created successfully' });
          queryClient.invalidateQueries({ queryKey: getListCasesQueryKey({ limit: 100 }) });
          setLocation(`/cases/${newCase.id}`);
        },
        onError: () => toast({ title: 'Error creating case', variant: 'destructive' })
      });
    } else {
      updateCase.mutate({ caseId: id, data: payload }, {
        onSuccess: (updated) => {
          toast({ title: 'Case updated successfully' });
          queryClient.invalidateQueries({ queryKey: getListCasesQueryKey({ limit: 100 }) });
          queryClient.setQueryData(getGetCaseQueryKey(id), updated);
        },
        onError: () => toast({ title: 'Error updating case', variant: 'destructive' })
      });
    }
  };

  const handleDelete = () => {
    if (!id || !confirm('Are you sure you want to delete this case? This action cannot be undone.')) return;
    deleteCase.mutate({ caseId: id }, {
      onSuccess: () => {
        toast({ title: 'Case deleted successfully' });
        queryClient.invalidateQueries({ queryKey: getListCasesQueryKey({ limit: 100 }) });
        setCaseId("");
        setLocation('/cases');
      },
      onError: () => toast({ title: 'Error deleting case', variant: 'destructive' })
    });
  };

  if (!isNew && isLoadingCase) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const isPending = createCase.isPending || updateCase.isPending || deleteCase.isPending;
  const isReadOnly = !(isNew ? canCreate : canEdit);

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/cases"><ArrowLeft className="w-4 h-4" /></Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {isNew ? 'New Investigation Case' : 'Case Details'}
            </h1>
            {!isNew && <p className="text-sm font-mono text-muted-foreground mt-1">ID: {id}</p>}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {!isNew && canDelete && (
             <Button variant="destructive" size="icon" onClick={handleDelete} disabled={isPending} title="Delete Case">
               <Trash2 className="w-4 h-4" />
             </Button>
          )}
          {(isNew ? canCreate : canEdit) && (
            <Button onClick={handleSave} disabled={isPending}>
              {isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              {isNew ? 'Create Case' : 'Save Changes'}
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-4 md:col-span-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">Title</label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Case title" disabled={isReadOnly} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Description</label>
            <Textarea 
              value={description} 
              onChange={e => setDescription(e.target.value)} 
              placeholder="Detailed description of the investigation..." 
              className="min-h-[100px]"
              disabled={isReadOnly}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Internal Notes</label>
            <Textarea 
              value={notes} 
              onChange={e => setNotes(e.target.value)} 
              placeholder="Private notes for investigators..." 
              className="min-h-[150px]"
              disabled={isReadOnly}
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Priority</label>
          <Select value={priority} onValueChange={(val: Priority) => setPriority(val)} disabled={isReadOnly}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="LOW">Low</SelectItem>
              <SelectItem value="MEDIUM">Medium</SelectItem>
              <SelectItem value="HIGH">High</SelectItem>
              <SelectItem value="CRITICAL">Critical</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Status</label>
          <Select value={status} onValueChange={(val: CaseStatus) => setStatus(val)} disabled={isNew || isReadOnly}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="OPEN">Open</SelectItem>
              <SelectItem value="INVESTIGATING">Investigating</SelectItem>
              <SelectItem value="REVIEW_REQUIRED">Review Required</SelectItem>
              <SelectItem value="CLOSED">Closed</SelectItem>
              <SelectItem value="ARCHIVED">Archived</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Classification</label>
          <Select value={classification} onValueChange={(val: Classification) => setClassification(val)} disabled={isReadOnly}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="UNCLASSIFIED">Unclassified</SelectItem>
              <SelectItem value="RESTRICTED">Restricted</SelectItem>
              <SelectItem value="CONFIDENTIAL">Confidential</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Tags (comma-separated)</label>
          <Input value={tags} onChange={e => setTags(e.target.value)} placeholder="e.g. apt, ransomware, external" disabled={isReadOnly} />
        </div>
        
        <div className="space-y-2 md:col-span-2">
          <label className="text-sm font-medium">Assigned Users (comma-separated UUIDs)</label>
          <Input value={assignments} onChange={e => setAssignments(e.target.value)} placeholder="e.g. 550e8400-e29b-41d4-a716-446655440000" disabled={isReadOnly} />
        </div>
      </div>
    </div>
  );
}
