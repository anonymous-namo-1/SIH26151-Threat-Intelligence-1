import { useState } from 'react';
import { exportReport, ExportFormat } from '@workspace/api-client-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { FileDown, Download, Printer } from 'lucide-react';

export function ReportExportModal({ reportId, open, onOpenChange }: { reportId: string, open: boolean, onOpenChange: (open: boolean) => void }) {
  const [format, setFormat] = useState<ExportFormat>(ExportFormat.markdown);
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async (print: boolean = false) => {
    setIsExporting(true);
    try {
      const response = await exportReport(reportId, { format: print ? ExportFormat.html : format });
      
      if (print) {
        const printWindow = window.open('', '_blank');
        if (printWindow) {
          printWindow.document.write(response.content);
          printWindow.document.close();
          printWindow.focus();
          // Short delay to ensure content loads
          setTimeout(() => {
            printWindow.print();
            // We do not close the window automatically in case they cancel print dialog
          }, 250);
        } else {
          toast.error("Popup blocked. Please allow popups to print.");
        }
      } else {
        const blob = new Blob([response.content], { type: response.media_type });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = response.filename || `report-${reportId}.${format}`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }
      
      toast.success(print ? "Print dialog opened" : "Report exported successfully");
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
            Export Draft Report
          </DialogTitle>
          <DialogDescription>
            Choose a format to export the human-authored draft report. Included citations will be appended as traceable links.
            <br/><br/>
            <span className="font-semibold text-warning-foreground font-mono">CAUTION:</span> Evidence precedes AI output. AI hypotheses are clearly marked and require human verification. This is a draft, not finalized intelligence.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="format" className="text-xs uppercase tracking-wider text-muted-foreground">Export Format</Label>
            <Select value={format} onValueChange={(v) => setFormat(v as ExportFormat)}>
              <SelectTrigger id="format" className="font-mono text-sm">
                <SelectValue placeholder="Select format" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ExportFormat.markdown}>Markdown (.md)</SelectItem>
                <SelectItem value={ExportFormat.json}>JSON (.json)</SelectItem>
                <SelectItem value={ExportFormat.html}>HTML Document (.html)</SelectItem>
                <SelectItem value={ExportFormat.csv}>CSV (.csv)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => handleExport(true)} disabled={isExporting} className="w-full sm:w-auto">
            <Printer className="h-4 w-4 mr-2" />
            Print HTML
          </Button>
          <div className="flex gap-2 w-full sm:w-auto">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">Cancel</Button>
            <Button onClick={() => handleExport(false)} disabled={isExporting} className="flex-1">
              <Download className="h-4 w-4 mr-2" />
              {isExporting ? "..." : "Export"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}