import { useUser, UserProfile } from '@clerk/react';
import { Loader2 } from 'lucide-react';

export function Security() {
  const { isLoaded, isSignedIn } = useUser();

  if (!isLoaded || !isSignedIn) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Security & Profile</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage your account credentials, MFA, and profile.</p>
      </div>

      <div className="bg-card border border-border rounded-lg shadow-sm p-1 overflow-hidden">
        <UserProfile routing="hash" />
      </div>
    </div>
  );
}
