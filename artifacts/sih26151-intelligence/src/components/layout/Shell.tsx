import { Link, useLocation } from 'wouter';
import { useEffect } from 'react';
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
  User,
  LayoutDashboard
} from 'lucide-react';
import { cn } from '@/lib/utils';

export function Shell({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  const navItems = [
    { name: 'Dashboard', path: '/', icon: LayoutDashboard },
    { name: 'Investigations', path: '/investigations', icon: Search },
    { name: 'Actors', path: '/actors/nyx-collective', icon: ShieldAlert },
    { name: 'Graph Analysis', path: '/graph', icon: Network },
    { name: 'Personas', path: '/personas', icon: Users },
    { name: 'Infrastructure', path: '/infrastructure', icon: Server },
    { name: 'Wallets', path: '/wallets', icon: WalletIcon },
    { name: 'Timeline', path: '/timeline', icon: Clock },
    { name: 'Evidence', path: '/evidence', icon: Files },
    { name: 'Reports', path: '/reports', icon: FileText },
  ];

  useEffect(() => {
    const activeItem = navItems.find(item => 
      location === item.path || (location.startsWith('/actors') && item.path.startsWith('/actors'))
    );
    const title = activeItem ? `${activeItem.name} - SIH26151 Intel` : 'SIH26151 Intel';
    document.title = title;
  }, [location]);

  return (
    <div className="flex h-[100dvh] w-full bg-background overflow-hidden font-sans">
      {/* Sidebar */}
      <aside className="w-64 flex-shrink-0 border-r border-sidebar-border bg-sidebar text-sidebar-foreground flex flex-col">
        <div className="h-14 flex items-center px-4 border-b border-sidebar-border">
          <ShieldAlert className="w-5 h-5 text-warning mr-2" />
          <span className="font-bold text-sm tracking-wide">SIH26151</span>
          <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] bg-sidebar-accent text-sidebar-accent-foreground font-mono">
            CLASSIFIED
          </span>
        </div>
        
        <div className="flex-1 overflow-y-auto py-4 flex flex-col gap-1 px-2">
          <div className="px-2 mb-2">
            <h3 className="text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider">
              Intelligence
            </h3>
          </div>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location === item.path || (location.startsWith('/actors') && item.path.startsWith('/actors'));
            return (
              <Link key={item.path} href={item.path} className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
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

        <div className="p-4 border-t border-sidebar-border">
          <div className="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground cursor-pointer transition-colors">
            <Settings className="w-4 h-4" />
            Settings
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-14 border-b border-border bg-card flex items-center justify-between px-6 flex-shrink-0 z-10">
          <div className="flex items-center bg-muted/50 rounded-md px-3 py-1.5 w-96 border border-border/50 focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/20 transition-all">
            <Search className="w-4 h-4 text-muted-foreground mr-2" />
            <input 
              type="text" 
              placeholder="Search entities, IPs, hashes..." 
              className="bg-transparent border-none outline-none text-sm w-full placeholder:text-muted-foreground"
            />
            <div className="flex gap-1 ml-2">
              <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-background border border-border text-muted-foreground">⌘</kbd>
              <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-background border border-border text-muted-foreground">K</kbd>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-warning/10 border border-warning/20">
              <div className="w-2 h-2 rounded-full bg-warning animate-pulse" />
              <span className="text-xs font-medium text-warning-foreground">DEFCON 3</span>
            </div>
            <button className="relative p-2 text-muted-foreground hover:text-foreground transition-colors rounded-md hover:bg-muted">
              <Bell className="w-4 h-4" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-destructive rounded-full" />
            </button>
            <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-sm border border-primary/30">
              <User className="w-4 h-4" />
            </div>
          </div>
        </header>

        {/* Scrollable Page Content */}
        <div className="flex-1 overflow-auto bg-background p-6">
          <div className="max-w-7xl mx-auto space-y-6 pb-12">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
