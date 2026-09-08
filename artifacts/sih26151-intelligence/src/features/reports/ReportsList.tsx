import { useState } from 'react';
import { useListReports, useCreateReport, useDeleteReport, type Report } from '@workspace/api-client-react';
import { useCaseWorkspace } from '@/hooks/use-case-workspace';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import { FileText, Plus, Trash2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { getListReportsQueryKey } from '@workspace/api-client-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { usePermissions } from '@/hooks/use-permissions';

export function ReportsList({ onSelect }: { onSelect: (report: Report) => void }) {
  const { caseId } = useCaseWorkspace();
  const queryClient = useQueryClient();
  const { canWriteReport } = usePermissions();
  const { data: reports, isLoading, error } = useListReports(caseId);
  const createReport = useCreateReport({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListReportsQueryKey(caseId) });
        toast.success("Report created");
      }
    }
  });
  const deleteReport = useDeleteReport({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListReportsQueryKey(caseId) });
        toast.success("Report deleted");
      }
    }
  });

  if (isLoading) return <div className="space-y-4"><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" /></div>;
  if (error) return <div className="p-4 text-destructive border border-destructive/20 rounded-md">Error loading reports</div>;

  const handleCreate = () => {
    createReport.mutate({ caseId, data: { title: "Untitled Report", body: "", citations: [] } });
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold tracking-tight">Case Reports</h2>
        <Button onClick={handleCreate} size="sm" disabled={createReport.isPending || !canWriteReport}>
          <Plus className="h-4 w-4 mr-2" />
          New Report
        </Button>
      </div>

      {!reports?.length ? (
        <Card className="border-dashed bg-transparent">
          <CardContent className="flex flex-col items-center justify-center p-12 text-center space-y-3">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
              <FileText className="h-5 w-5 text-primary" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">No reports yet</p>
              <p className="text-xs text-muted-foreground">Draft investigation reports and summaries.</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
          {reports.map(report => (
            <Card key={report.id} className="cursor-pointer hover:border-primary/50 transition-colors group relative" onClick={() => onSelect(report)}>
              <CardHeader className="p-4">
                <CardTitle className="text-base line-clamp-1">{report.title || "Untitled"}</CardTitle>
                <CardDescription className="text-xs">
                  Updated {format(new Date(report.updated_at), 'MMM d, yyyy HH:mm')}
                </CardDescription>
              </CardHeader>
              <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                {canWriteReport && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={e => e.stopPropagation()}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent onClick={e => e.stopPropagation()}>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete report?</AlertDialogTitle>
                        <AlertDialogDescription>This action cannot be undone. The report will be permanently removed.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={() => deleteReport.mutate({ reportId: report.id })}>
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
