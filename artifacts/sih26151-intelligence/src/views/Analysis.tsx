import { useState } from "react";
import { useLocation } from "wouter";
import { CaseScope, useCaseWorkspace } from "@/hooks/use-case-workspace";
import { AnalysisHub } from "@/features/analysis/AnalysisHub";
import { CaseAssistant } from "@/features/assistant/CaseAssistant";

function AnalysisContent() {
  const { caseId } = useCaseWorkspace();

  return (
    <div className="min-w-0 flex flex-col xl:flex-row gap-6 xl:h-[calc(100dvh-120px)] animate-in fade-in duration-500">
      <div className="min-w-0 max-w-full flex-1 overflow-auto bg-card border border-border rounded-xl shadow-sm relative">
        <AnalysisHub key={caseId} caseId={caseId} />
      </div>
      
      <div className="min-w-0 w-full xl:w-[350px] shrink-0">
        <CaseAssistant key={caseId} caseId={caseId} />
      </div>
    </div>
  );
}

export function Analysis() {
  return (
    <CaseScope>
      <AnalysisContent />
    </CaseScope>
  );
}
