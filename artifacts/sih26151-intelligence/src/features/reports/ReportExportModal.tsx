import { useState } from 'react';
import { exportReport, ExportFormat } from '@workspace/api-client-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { FileDown, Download } from 'lucide-react';

export function ReportExportModal({ reportId, open, onOpenChange }: { reportId: string, open: boolean, onOpenChange: (open: boolean) => void }) {
  const [format, setFormat] = useState<ExportFormat>(ExportFormat.markdown);
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const response = await exportReport(reportId, { format });
      
      const blob = new Blob([response.content], { type: response.media_type });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = response.filename || `report-${reportId}.${format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast.success("Report exported successfully");
      onOpenChange(false);
    } catch (error) {
      toast.error("Failed to export report");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileDown className="h-5 w-5" />
            Export Report
          </DialogTitle>
          <DialogDescription>
            Choose a format to export the finalized report. Citations will be included as traceable links.
            <br/><br/>
            <span className="font-semibold text-warning-foreground">Disclaimer:</span> AI hypotheses are clearly marked and require human verification.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="format">Export Format</Label>
            <Select value={format} onValueChange={(v) => setFormat(v as ExportFormat)}>
              <SelectTrigger id="format">
                <SelectValue placeholder="Select format" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ExportFormat.markdown}>Markdown (.md)</SelectItem>
                <SelectItem value={ExportFormat.json}>JSON (.json)</SelectItem>
                <SelectItem value={ExportFormat.html}>HTML Document (.html)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleExport} disabled={isExporting}>
            <Download className="h-4 w-4 mr-2" />
            {isExporting ? "Exporting..." : "Download"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
