import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Home, Disc3, ListChecks, Settings2, LogOut, Copy, ChevronDown } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { ThemeToggle } from "@/components/theme-toggle";
import { APP_NAME } from "@/lib/brand";
import { useMe, useChildren, type Me } from "@/lib/api";
import { usePendingApprovals } from "@/components/ApprovalsInbox";
import { useQuery } from "@tanstack/react-query";
import type { PendingConsequence, SpinRequest } from "@shared/schema";
import { authService } from "@/lib/auth-service";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type NavItem = { href: string; label: string; icon: typeof Home; badge?: number; badgeTone?: string; testId: string };

function useNav(me: Me): NavItem[] {
  const isParent = me.role === "parent";
  const { data: approvals = [] } = usePendingApprovals(isParent);
  const { data: children = [] } = useChildren();
  const { data: pending = [] } = useQuery<PendingConsequence[]>({ queryKey: ["/api/pending"] });
  const { data: mine = [] } = useQuery<SpinRequest[]>({ queryKey: ["/api/spinrequests/mine"], enabled: !isParent, refetchInterval: 15000 });
  const todos = pending.filter((p) => !p.completed).length;
  if (isParent) {
    return [
      { href: "/", label: "Home", icon: Home, badge: approvals.length, badgeTone: "bg-rose-500", testId: "nav-home" },
      { href: "/spin", label: "Spin", icon: Disc3, testId: "nav-spin" },
      { href: "/todos", label: "To-dos", icon: ListChecks, badge: todos, badgeTone: "bg-primary", testId: "nav-todos" },
      { href: "/setup", label: "Setup", icon: Settings2, testId: "nav-setup" },
    ];
  }
  const waiting = mine.filter((r) => r.status === "pending" && r.type === "good").length;
  const spins = Math.max(0, (children[0]?.earnedSpins || 0) - waiting);
  return [
    { href: "/", label: "Home", icon: Home, testId: "nav-home" },
    { href: "/spin", label: "Spin", icon: Disc3, badge: spins, badgeTone: "bg-amber-500", testId: "nav-spin" },
    { href: "/todos", label: "My list", icon: ListChecks, badge: todos, badgeTone: "bg-primary", testId: "nav-todos" },
  ];
}

function Badge({ n, tone, className }: { n?: number; tone?: string; className?: string }) {
  if (!n) return null;
  return (
    <span className={cn("min-w-[1.25rem] h-5 px-1.5 rounded-full text-[11px] font-bold text-white flex items-center justify-center", tone, className)} data-testid="nav-badge">
      {n > 99 ? "99+" : n}
    </span>
  );
}

export function AppShell({ me, children }: { me: Me; children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const nav = useNav(me);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Result of "Connect Google" in Setup comes back as ?google=...
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const g = params.get("google");
    if (!g) return;
    if (g === "linked") {
      toast({ title: "Google connected", description: "You can now sign in with Google." });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    } else {
      toast({ title: "Couldn't connect Google", description: g, variant: "destructive" });
    }
    window.history.replaceState(null, "", window.location.pathname);
  }, []);

  const logout = async () => {
    try {
      await authService.logout();
    } catch {
      /* clear local state anyway */
    }
    queryClient.clear();
    queryClient.setQueryData(["/api/auth/me"], null);
    setLocation("/login");
  };

  const isActive = (href: string) => (href === "/" ? location === "/" : location.startsWith(href));
  const name = me.displayName || me.username;

  return (
    <div className="min-h-[100dvh] bg-background">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-5xl items-center gap-3 px-4">
          <Link href="/" className="flex min-w-0 items-center gap-2.5 whitespace-nowrap font-extrabold text-[16px] tracking-tight sm:text-[17px]">
            <BrandMark className="h-8 w-8 shrink-0" />
            <span className="truncate" data-testid="text-app-name">{APP_NAME}</span>
          </Link>

          <nav className="ml-6 hidden items-center gap-1 md:flex" aria-label="Main">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                data-testid={item.testId}
                aria-current={isActive(item.href) ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors",
                  isActive(item.href) ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <item.icon className="h-4 w-4" aria-hidden="true" />
                {item.label}
                <Badge n={item.badge} tone={item.badgeTone} />
              </Link>
            ))}
          </nav>

          <div className="ml-auto shrink-0">
            <DropdownMenu>
              <DropdownMenuTrigger
                className="flex items-center gap-2 rounded-full border border-border bg-card p-1 text-sm font-semibold hover:bg-muted sm:pr-3"
                data-testid="button-user-menu"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-secondary-foreground font-bold">
                  {name.charAt(0).toUpperCase()}
                </span>
                <span className="hidden max-w-[7rem] truncate sm:inline">{name.split(" ")[0]}</span>
                <ChevronDown className="hidden h-4 w-4 text-muted-foreground sm:block" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuLabel className="font-normal">
                  <div className="font-semibold">{name}</div>
                  <div className="text-xs text-muted-foreground">{me.role === "parent" ? "Parent" : "Kid"} · @{me.username}</div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {me.role === "parent" && me.joinCode && (
                  <DropdownMenuItem
                    onClick={() => {
                      navigator.clipboard?.writeText(me.joinCode || "");
                      toast({ title: "Parent code copied", description: `Kids enter ${me.joinCode} when they sign up.` });
                    }}
                  >
                    <Copy /> Parent code <span className="ml-auto font-mono tracking-widest">{me.joinCode}</span>
                  </DropdownMenuItem>
                )}
                {me.role === "parent" && (
                  <DropdownMenuItem onClick={() => setLocation("/setup")}>
                    <Settings2 /> Setup and account
                  </DropdownMenuItem>
                )}
                <div className="px-2 pb-1.5 pt-1">
                  <p className="mb-1.5 text-xs font-medium text-muted-foreground">Appearance</p>
                  <ThemeToggle />
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={logout} data-testid="button-logout">
                  <LogOut /> Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 pb-28 pt-5 md:pb-12 md:pt-8">{children}</main>

      {/* Phone tab bar */}
      <nav
        className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-border/60 bg-background/90 backdrop-blur-xl md:hidden"
        aria-label="Main"
      >
        <div className={cn("mx-auto grid max-w-md", nav.length === 4 ? "grid-cols-4" : "grid-cols-3")}>
          {nav.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                data-testid={`${item.testId}-mobile`}
                aria-current={active ? "page" : undefined}
                className={cn("flex flex-col items-center gap-1 pt-2.5 pb-1 text-[11px] font-semibold", active ? "text-primary" : "text-muted-foreground")}
              >
                <span className={cn("relative flex h-8 w-14 items-center justify-center rounded-full transition-colors", active && "bg-secondary")}>
                  <item.icon className="h-[22px] w-[22px]" aria-hidden="true" />
                  <Badge n={item.badge} tone={item.badgeTone} className="absolute -right-0.5 -top-1 ring-2 ring-background" />
                </span>
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

/** Page title block used at the top of each screen. */
export function PageHeader({ eyebrow, title, action, children }: { eyebrow?: string; title: string; action?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        {eyebrow && <p className="eyebrow mb-1">{eyebrow}</p>}
        <h1 className="text-[28px] font-extrabold leading-tight md:text-3xl">{title}</h1>
        {children && <div className="mt-1 text-muted-foreground">{children}</div>}
      </div>
      {action}
    </div>
  );
}
