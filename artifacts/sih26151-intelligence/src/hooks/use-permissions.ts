import { useGetMe } from '@workspace/api-client-react';

export function usePermissions() {
  const { data: me } = useGetMe();
  const permissions = me?.permissions || [];

  return {
    canWriteEvidence: permissions.includes('evidence:write'),
    canRunAnalysis: permissions.includes('analysis:run'),
    canWriteReport: permissions.includes('report:write'),
    canExportReport: permissions.includes('report:export'),
  };
}
