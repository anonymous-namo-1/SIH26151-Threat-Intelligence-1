import { FileText, Search, Shield, Info, Download, ShieldCheck, ShieldAlert } from 'lucide-react';
import { mockEvidence } from '@/data/mock';

export function Evidence() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Evidence Explorer</h1>
          <p className="text-sm text-muted-foreground mt-1">Raw intel artifacts, logs, and captured materials.</p>
        </div>
        <button className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors">
          Upload Artifact
        </button>
      </div>

      <div className="flex gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input 
            type="text" 
            placeholder="Search artifacts, contents, hashes..." 
            className="w-full pl-9 pr-4 py-2 bg-card border border-border rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-primary/50 transition-all"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {mockEvidence.map(ev => (
          <div key={ev.id} className="bg-card border border-border rounded-lg shadow-sm overflow-hidden flex flex-col group hover:border-primary/30 transition-colors">
            <div className="p-4 border-b border-border bg-muted/20 flex items-start justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-muted-foreground" />
                <h3 className="font-semibold text-sm line-clamp-1" title={ev.title}>{ev.title}</h3>
              </div>
              <div className={`px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wider ${
                ev.classification === 'CONFIDENTIAL' ? 'bg-warning/10 text-warning-foreground border border-warning/20' :
                ev.classification === 'RESTRICTED' || ev.classification === 'SECRET' ? 'bg-destructive/10 text-destructive border border-destructive/20' :
                'bg-muted text-muted-foreground border border-border'
              }`}>
                {ev.classification}
              </div>
            </div>
            
            <div className="p-4 flex-1">
              <div className="bg-background border border-border rounded p-3 mb-4 font-mono text-xs text-muted-foreground break-all h-24 overflow-hidden relative">
                {ev.contentSnippet}
                <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-background to-transparent" />
              </div>
              
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Type:</span>
                  <span className="font-medium bg-muted px-1.5 py-0.5 rounded text-xs">{ev.type}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Source:</span>
                  <span className="font-medium text-xs">{ev.source}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Date:</span>
                  <span className="font-mono text-xs">{ev.dateCollected.split('T')[0]}</span>
                </div>
              </div>
            </div>
            
            <div className="p-4 border-t border-border bg-muted/10 flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-medium">
                {ev.reliability > 90 ? (
                  <ShieldCheck className="w-4 h-4 text-chart-5" />
                ) : ev.reliability > 70 ? (
                  <Shield className="w-4 h-4 text-warning" />
                ) : (
                  <ShieldAlert className="w-4 h-4 text-destructive" />
                )}
                Reliability: {ev.reliability}/100
              </div>
              <button className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors" title="Download Artifact">
                <Download className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
