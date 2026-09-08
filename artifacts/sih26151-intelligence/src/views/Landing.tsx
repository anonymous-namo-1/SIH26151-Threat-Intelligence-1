import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Shield } from "lucide-react";

export function Landing() {
  return (
    <div className="min-h-[100dvh] flex flex-col bg-background text-foreground">
      <header className="px-6 py-4 flex items-center justify-between border-b border-border bg-card">
        <div className="flex items-center gap-2 text-primary">
          <Shield className="w-6 h-6" />
          <span className="font-bold text-lg tracking-tight">ARGUS</span>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/sign-in">
            <Button variant="ghost">Sign In</Button>
          </Link>
          <Link href="/sign-up">
            <Button>Get Started</Button>
          </Link>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center p-6 text-center">
        <Shield className="w-16 h-16 text-primary mb-6" />
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight max-w-3xl mb-4">
          Evidence-Led Case Investigation
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl mb-8">
          An evidence-led workbench for authorized cybersecurity research. Manage cases, preserve source material, explore relationships, and write traceable investigation reports.
        </p>
        <Link href="/sign-up">
          <Button size="lg" className="h-12 px-8 text-base">
            Start Investigating
          </Button>
        </Link>
      </main>
      
      <footer className="py-6 text-center text-sm text-muted-foreground border-t border-border">
        &copy; {new Date().getFullYear()} ARGUS Intelligence. All rights reserved.
      </footer>
    </div>
  );
}
