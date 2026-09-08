import { useState } from 'react';
import { Save, Download, FileText, Plus, GripVertical, Settings, ShieldAlert } from 'lucide-react';
import { mockReports, mockEvidence } from '@/data/mock';

export function Reports() {
  const [activeReport] = useState(mockReports[0]);
  
  return (
    <div className="space-y-6 h-[calc(100vh-120px)] flex flex-col">
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Report Builder</h1>
          <p className="text-sm text-muted-foreground mt-1">Compile intelligence into structured analytical products.</p>
        </div>
        <div className="flex gap-2">
          <button className="px-4 py-2 bg-card border border-border rounded-md text-sm font-medium hover:bg-muted transition-colors flex items-center gap-2">
            <Save className="w-4 h-4" /> Save Draft
          </button>
          <button className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors flex items-center gap-2">
            <Download className="w-4 h-4" /> Export PDF
          </button>
        </div>
      </div>

      <div className="flex gap-6 flex-1 min-h-0">
        {/* Editor Area */}
        <div className="flex-1 flex flex-col bg-card border border-border rounded-lg shadow-sm overflow-hidden">
          <div className="border-b border-border p-4 bg-muted/20 flex items-center justify-between">
            <input 
              type="text" 
              defaultValue={activeReport.title}
              className="text-lg font-bold bg-transparent border-none outline-none focus:ring-0 flex-1 px-2 py-1 hover:bg-muted/50 rounded transition-colors"
            />
            <div className="flex items-center gap-3 ml-4 border-l border-border pl-4">
              <div className="text-xs text-muted-foreground">Classification:</div>
              <select 
                defaultValue={activeReport.classification}
                className="text-xs font-bold px-2 py-1 bg-warning/10 text-warning-foreground border border-warning/20 rounded outline-none appearance-none"
              >
                <option value="UNCLASSIFIED">UNCLASSIFIED</option>
                <option value="CONFIDENTIAL">CONFIDENTIAL</option>
                <option value="SECRET">SECRET</option>
                <option value="TOP_SECRET">TOP_SECRET</option>
              </select>
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto p-8 space-y-8 bg-background">
            {activeReport.sections.map(section => (
              <div key={section.id} className="group relative">
                <div className="absolute -left-6 top-1 opacity-0 group-hover:opacity-100 cursor-move text-muted-foreground hover:text-foreground transition-opacity">
                  <GripVertical className="w-4 h-4" />
                </div>
                <input 
                  type="text" 
                  defaultValue={section.title}
                  className="text-lg font-semibold bg-transparent border-none outline-none focus:ring-0 w-full mb-2 placeholder:text-muted-foreground"
                />
                <textarea 
                  defaultValue={section.content}
                  className="w-full min-h-[100px] resize-none bg-transparent border-none outline-none focus:ring-0 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground"
                />
                
                {section.evidenceIds.length > 0 && (
                  <div className="mt-4 p-4 border border-border bg-muted/10 rounded-md">
                    <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
                      <FileText className="w-4 h-4" /> Supporting Evidence
                    </div>
                    <div className="space-y-2">
                      {section.evidenceIds.map(evId => {
                        const ev = mockEvidence.find(e => e.id === evId);
                        if (!ev) return null;
                        return (
                          <div key={ev.id} className="flex items-center justify-between text-sm bg-background border border-border p-2 rounded">
                            <span className="font-medium">{ev.title}</span>
                            <span className="text-xs font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{ev.type}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ))}
            
            <button className="w-full py-4 border-2 border-dashed border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-muted-foreground transition-colors flex items-center justify-center gap-2 text-sm font-medium">
              <Plus className="w-4 h-4" /> Add Section
            </button>
          </div>
        </div>

        {/* Sidebar */}
        <div className="w-80 flex-shrink-0 flex flex-col gap-6">
          <div className="bg-card border border-border rounded-lg shadow-sm flex-1 flex flex-col overflow-hidden">
            <div className="p-4 border-b border-border bg-muted/20">
              <h3 className="font-semibold text-sm">Evidence Library</h3>
            </div>
            <div className="p-3 border-b border-border">
              <input 
                type="text" 
                placeholder="Search to attach..." 
                className="w-full px-3 py-1.5 bg-background border border-border rounded text-xs focus:outline-none focus:ring-1 focus:ring-primary/50"
              />
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {mockEvidence.map(ev => (
                <div key={ev.id} className="p-3 border border-border rounded bg-background hover:border-primary/30 cursor-grab active:cursor-grabbing transition-colors">
                  <div className="font-medium text-xs mb-1 line-clamp-1">{ev.title}</div>
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                    <span className="font-mono">{ev.type}</span>
                    <span className="flex items-center gap-1">Rel: {ev.reliability}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
