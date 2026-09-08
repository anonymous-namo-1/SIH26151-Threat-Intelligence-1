import { useState, useMemo } from "react";
import { useListCaseJobs, Job } from "@workspace/api-client-react";
import { ModuleResult } from "@workspace/api-client-react";

export function useSavedModuleResult(caseId: string, moduleName: string) {
  const { data: jobs } = useListCaseJobs(caseId);
  
  const savedResult = useMemo(() => {
    if (!jobs) return null;
    const moduleJobs = jobs
      .filter((j: any) => j.status === 'SUCCEEDED' && j.result && j.result.module === moduleName)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      
    if (moduleJobs.length > 0) {
      return moduleJobs[0].result as unknown as ModuleResult;
    }
    return null;
  }, [jobs, moduleName]);

  return savedResult;
}
