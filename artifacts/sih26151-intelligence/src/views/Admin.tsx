import { useListUsers, useUpdateUser, useGetMe, Role } from '@workspace/api-client-react';
import { Loader2, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';

export function Admin() {
  const { data: users, isLoading } = useListUsers();
  const { data: me } = useGetMe();
  const updateUser = useUpdateUser();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const canManageUsers = me?.permissions.includes('users:manage');

  const handleRoleChange = (userId: string, newRole: Role) => {
    updateUser.mutate({ userId, data: { role: newRole } }, {
      onSuccess: () => {
        toast({ title: 'User role updated' });
        queryClient.invalidateQueries({ queryKey: ['/api/argus/users'] });
      },
      onError: () => toast({ title: 'Failed to update user', variant: 'destructive' })
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Admin & Access</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage team members and role-based access control.</p>
        </div>
        <ShieldCheck className="w-8 h-8 text-primary" />
      </div>

      <div className="bg-card border border-border rounded-lg shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b border-border text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Name</th>
              <th className="px-4 py-3 text-left font-medium">Status</th>
              <th className="px-4 py-3 text-left font-medium">Joined</th>
              <th className="px-4 py-3 text-right font-medium">Role</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {users?.map(user => (
              <tr key={user.id} className="hover:bg-muted/30 transition-colors">
                <td className="px-4 py-3 font-medium text-primary">
                  {user.name}
                  <div className="text-xs font-mono text-muted-foreground mt-0.5">{user.id}</div>
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold ${
                    user.active ? 'bg-green-500/10 text-green-500' : 'bg-destructive/10 text-destructive'
                  }`}>
                    {user.active ? 'Active' : 'Disabled'}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {new Date(user.created_at).toLocaleDateString()}
                </td>
                <td className="px-4 py-3 text-right flex justify-end">
                  <Select value={user.role} onValueChange={(val: Role) => handleRoleChange(user.id, val)} disabled={!canManageUsers || updateUser.isPending}>
                    <SelectTrigger className="w-[180px] h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ADMIN">Admin</SelectItem>
                      <SelectItem value="LEAD_INVESTIGATOR">Lead Investigator</SelectItem>
                      <SelectItem value="INVESTIGATOR">Investigator</SelectItem>
                      <SelectItem value="ANALYST">Analyst</SelectItem>
                      <SelectItem value="VIEWER">Viewer</SelectItem>
                    </SelectContent>
                  </Select>
                </td>
              </tr>
            ))}
            {!users?.length && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                  No users found or permission denied.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
