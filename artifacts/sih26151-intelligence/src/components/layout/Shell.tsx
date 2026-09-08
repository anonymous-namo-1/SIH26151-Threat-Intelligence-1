import { Link, useLocation } from 'wouter';
import { useEffect, useState } from 'react';
import { useUser, SignOutButton } from '@clerk/react';
import {
  ShieldAlert,
  Search,
  Network,
  Users,
  Server,
  Wallet as WalletIcon,
  Clock,
  FileText,
  Files,
  Settings,
  Bell,
  LayoutDashboard,
  ShieldCheck,
  LogOut,
  Menu,
  ActivitySquare,
  X,
  Layout
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useCaseWorkspace } from '@/hooks/use-case-workspace';

export function Shell({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const { user } = useUser();
  const { activeCase } = useCaseWorkspace();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems = [
    { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
    { name: 'Workspace', path: '/workspace', icon: Layout },
    { name: 'Investigations', path: '/investigations', icon: Search },
    { name: 'Entities', path: '/entities', icon: Users },
    { name: 'Analysis', path: '/analysis', icon: ActivitySquare },
    { name: 'Global Search', path: '/search', icon: Search },
    { name: 'Graph Analysis', path: '/graph', icon: Network },
    { name: 'Personas', path: '/personas', icon: Users },
    { name: 'Infrastructure', path: '/infrastructure', icon: Server },
    { name: 'Wallets', path: '/wallets', icon: WalletIcon },
    { name: 'Timeline', path: '/timeline', icon: Clock },
    { name: 'Evidence', path: '/evidence', icon: Files },
    { name: 'Reports', path: '/reports', icon: FileText },
    { name: 'Audit', path: '/audit', icon: FileText },
  ];

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setLocation('/search');
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [setLocation]);

  useEffect(() => {
    const activeItem = navItems.find(item => 
      location === item.path || (location.startsWith('/actors') && item.path.startsWith('/actors'))
    );
    const title = activeItem ? `${activeItem.name} - ARGUS Intel` : 'ARGUS Intel';
    document.title = title;
  }, [location, navItems]);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location]);

  return (
    <div className="flex h-[100dvh] w-full bg-background overflow-hidden font-sans">
      {/* Mobile overlay */}
      {mobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40 md:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed md:relative flex-shrink-0 w-64 h-[100dvh] z-50 border-r border-sidebar-border bg-sidebar text-sidebar-foreground flex flex-col transition-transform duration-200 ease-in-out md:translate-x-0",
        mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="h-14 flex items-center justify-between px-4 border-b border-sidebar-border">
          <div className="flex items-center">
            <ShieldAlert className="w-5 h-5 text-warning mr-2" />
            <span className="font-bold text-sm tracking-wide">ARGUS</span>
          </div>
          <Button variant="ghost" size="icon" className="md:hidden text-sidebar-foreground" onClick={() => setMobileMenuOpen(false)}>
            <X className="w-5 h-5" />
          </Button>
        </div>
        
        <div className="flex-1 overflow-y-auto py-4 flex flex-col gap-1 px-2">
          <div className="px-2 mb-2">
            <h3 className="text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider">
              Intelligence
            </h3>
          </div>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location === item.path || (item.path !== '/' && location.startsWith(item.path));
            return (
              <Link key={item.path} href={item.path} className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer",
                isActive 
                  ? "bg-sidebar-accent text-sidebar-accent-foreground" 
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              )}>
                <Icon className="w-4 h-4" />
                {item.name}
              </Link>
            );
          })}
        </div>

        <div className="p-4 border-t border-sidebar-border space-y-1">
          <Link href="/settings/security" className="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground cursor-pointer transition-colors">
            <Settings className="w-4 h-4" />
            Security & Profile
          </Link>
          <Link href="/admin" className="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground cursor-pointer transition-colors">
            <ShieldCheck className="w-4 h-4" />
            Admin
          </Link>
          <div className="pt-2 mt-2 border-t border-sidebar-border/50 px-3">
             <SignOutButton>
               <Button variant="ghost" className="w-full justify-start text-sidebar-foreground/70 hover:text-destructive hover:bg-destructive/10 px-0">
                 <LogOut className="w-4 h-4 mr-3" /> Sign Out
               </Button>
             </SignOutButton>
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b border-border bg-card flex items-center justify-between px-4 md:px-6 flex-shrink-0 z-10">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setMobileMenuOpen(true)}>
              <Menu className="w-5 h-5" />
            </Button>
            <div
              className="hidden md:flex items-center bg-muted/50 rounded-md px-3 py-1.5 w-80 lg:w-96 border border-border/50 focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/20 transition-all cursor-pointer"
              onClick={() => setLocation('/search')}
            >
              <Search className="w-4 h-4 text-muted-foreground mr-2" />
              <div className="text-sm text-muted-foreground flex-1">Quick search...</div>
              <div className="flex gap-1 ml-2">
                <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-background border border-border text-muted-foreground">⌘</kbd>
                <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-background border border-border text-muted-foreground">K</kbd>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary">
              <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              <span className="text-xs font-medium uppercase tracking-wider">{activeCase ? activeCase.classification : "Authorized Research"}</span>
            </div>
            <button className="relative p-2 text-muted-foreground hover:text-foreground transition-colors rounded-md hover:bg-muted">
              <Bell className="w-4 h-4" />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-auto bg-background p-4 md:p-6">
          <div className="max-w-7xl mx-auto space-y-6 pb-12 h-full">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
