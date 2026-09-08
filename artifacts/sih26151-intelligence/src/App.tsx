import { type ReactNode, useEffect, useRef } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ClerkProvider, SignIn, SignUp, Show, useClerk, useUser } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
  Redirect,
} from 'wouter';

import { ErrorBoundary } from '@/components/error-boundary';
import { CaseWorkspaceProvider } from '@/hooks/use-case-workspace';
import { Toaster } from '@/components/ui/toaster';
import { Toaster as SonnerToaster } from 'sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/views/not-found';
import { Shell } from '@/components/layout/Shell';

// Pages
import { Landing } from '@/views/Landing';
import { Dashboard } from '@/views/Dashboard';
import { Investigations } from '@/views/Investigations';
import { CaseDetails } from '@/views/CaseDetails';
import { ActorProfile } from '@/views/ActorProfile';
import { GraphAnalysis } from '@/views/GraphAnalysis';
import { Personas } from '@/views/Personas';
import { Infrastructure } from '@/views/Infrastructure';
import { Wallets } from '@/views/Wallets';
import { Analysis } from '@/views/Analysis';
import { Timeline } from '@/views/Timeline';
import { Evidence } from '@/views/Evidence';
import { Reports } from '@/views/Reports';
import { Audit } from '@/views/Audit';
import { Security } from '@/views/Security';
import { Admin } from '@/views/Admin';
import { Entities } from '@/views/Entities';
import { Workspace } from '@/views/Workspace';
import { GlobalSearch } from '@/views/Search';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30000,
      refetchOnWindowFocus: true,
    },
  },
});

const basePath: string = "";

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const queryClient = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (
        prevUserIdRef.current !== undefined &&
        prevUserIdRef.current !== userId
      ) {
        queryClient.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, queryClient]);

  return null;
}

function HomeRedirect() {
  const { isLoaded, isSignedIn } = useUser();
  return isLoaded && isSignedIn ? <Redirect to="/dashboard" /> : <Landing />;
}

function SignInPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
      <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
    </div>
  );
}

function SignUpPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
      <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
    </div>
  );
}

function ProtectedRoute({ component: Component, ...rest }: any) {
  return (
    <Route {...rest}>
      {(params) => (
        <>
          <Show when="signed-in">
            <Component params={params} />
          </Show>
          <Show when="signed-out">
            <Redirect to="/sign-in" />
          </Show>
        </>
      )}
    </Route>
  );
}

function Router() {
  return (
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={HomeRedirect} />
        <Route path="/sign-in/*?" component={SignInPage} />
        <Route path="/sign-up/*?" component={SignUpPage} />
        <Route path="/login/*?">
          <Redirect to="/sign-in" />
        </Route>
        <Route path="/register/*?">
          <Redirect to="/sign-up" />
        </Route>
        <Route path="/forgot-password/*?">
          <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
            <SignIn routing="path" path={`${basePath}/forgot-password`} signUpUrl={`${basePath}/sign-up`} />
          </div>
        </Route>
        
        <Route>
          <Shell>
            <Switch>
              <ProtectedRoute path="/dashboard" component={Dashboard} />
              <ProtectedRoute path="/workspace" component={Workspace} />
              <ProtectedRoute path="/investigations" component={Investigations} />
              <ProtectedRoute path="/cases" component={Investigations} />
              <ProtectedRoute path="/cases/:id" component={CaseDetails} />
              <ProtectedRoute path="/entities" component={Entities} />
              <ProtectedRoute path="/search" component={GlobalSearch} />
              <ProtectedRoute path="/actors/:id" component={ActorProfile} />
              <ProtectedRoute path="/entities/:id" component={ActorProfile} />
              <ProtectedRoute path="/graph" component={GraphAnalysis} />
              <ProtectedRoute path="/analysis" component={Analysis} />
              <ProtectedRoute path="/personas" component={Personas} />
              <ProtectedRoute path="/infrastructure" component={Infrastructure} />
              <ProtectedRoute path="/wallets" component={Wallets} />
              <ProtectedRoute path="/timeline" component={Timeline} />
              <ProtectedRoute path="/evidence" component={Evidence} />
              <ProtectedRoute path="/reports" component={Reports} />
              <ProtectedRoute path="/audit" component={Audit} />
              <ProtectedRoute path="/settings/security" component={Security} />
              <ProtectedRoute path="/admin" component={Admin} />
              <Route component={NotFound} />
            </Switch>
          </Shell>
        </Route>
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

export default function App({ clerkPubKey, clerkProxyUrl }: { clerkPubKey: string, clerkProxyUrl: string }) {
  const [, setLocation] = useLocation();

  function stripBase(path: string): string {
    return basePath && path.startsWith(basePath)
      ? path.slice(basePath.length) || "/"
      : path;
  }

  const pubKey = publishableKeyFromHost(
    typeof window !== 'undefined' ? window.location.hostname : '',
    clerkPubKey
  );

  if (!pubKey) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4 text-center bg-background text-foreground">
        <div>
          <h1 className="text-2xl font-bold mb-2 text-destructive">Configuration Error</h1>
          <p className="text-muted-foreground">Missing Clerk Publishable Key in environment.</p>
        </div>
      </div>
    );
  }

  const clerkAppearance = {
    theme: shadcn,
    cssLayerName: "clerk",
    options: {
      logoPlacement: "inside" as const,
      logoLinkUrl: basePath || "/",
    },
    variables: {
      colorPrimary: "hsl(212 50% 45%)",
      colorBackground: "hsl(222 25% 14%)",
      colorText: "hsl(210 20% 98%)",
      colorTextSecondary: "hsl(215 15% 65%)",
      colorInputBackground: "hsl(220 20% 20%)",
      colorInputText: "hsl(210 20% 98%)",
    },
    elements: {
      rootBox: "w-full flex justify-center",
      cardBox: "bg-card rounded-2xl w-[440px] max-w-full overflow-hidden border border-border shadow-xl",
      card: "!shadow-none !border-0 !bg-transparent !rounded-none",
      headerTitle: "text-foreground",
      headerSubtitle: "text-muted-foreground",
      formFieldLabel: "text-foreground",
      formFieldInput: "bg-input text-foreground border-border",
      formButtonPrimary: "bg-primary text-primary-foreground hover:bg-primary/90",
    }
  };

  return (
    <ClerkProvider
      publishableKey={pubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <CaseWorkspaceProvider>
          <TooltipProvider>
            <WouterRouter base={basePath}>
              <Router />
            </WouterRouter>
            <Toaster />
            <SonnerToaster richColors position="bottom-right" />
          </TooltipProvider>
        </CaseWorkspaceProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}
