import { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

import { Shell } from '@/components/layout/Shell';
import { Dashboard } from '@/pages/Dashboard';
import { Investigations } from '@/pages/Investigations';
import { ActorProfile } from '@/pages/ActorProfile';
import { GraphAnalysis } from '@/pages/GraphAnalysis';
import { Personas } from '@/pages/Personas';
import { Infrastructure } from '@/pages/Infrastructure';
import { Wallets } from '@/pages/Wallets';
import { Timeline } from '@/pages/Timeline';
import { Evidence } from '@/pages/Evidence';
import { Reports } from '@/pages/Reports';

const queryClient = new QueryClient();

function Router() {
  return (
    <Shell>
      <RoutedErrorBoundary>
        <Switch>
          <Route path="/" component={Dashboard} />
          <Route path="/investigations" component={Investigations} />
          <Route path="/actors/:id" component={ActorProfile} />
          <Route path="/graph" component={GraphAnalysis} />
          <Route path="/personas" component={Personas} />
          <Route path="/infrastructure" component={Infrastructure} />
          <Route path="/wallets" component={Wallets} />
          <Route path="/timeline" component={Timeline} />
          <Route path="/evidence" component={Evidence} />
          <Route path="/reports" component={Reports} />
          <Route component={NotFound} />
        </Switch>
      </RoutedErrorBoundary>
    </Shell>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
