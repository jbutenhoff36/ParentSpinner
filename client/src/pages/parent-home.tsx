import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Disc3, MoreHorizontal, Plus, Sparkles, Pencil, SlidersHorizontal, KeyRound, CloudRain, Trash2, Link2 } from "lucide-react";
import { format, subDays } from "date-fns";
import type { ChildProfile, GoodDayLog } from "@shared/schema";
import { PageHeader } from "@/components/app-shell";
import ApprovalsInbox from "@/components/ApprovalsInbox";
import { InviteCard } from "@/components/invite-card";
import { KidAvatar } from "@/components/kid-avatar";
import { ProgressRing } from "@/components/progress-ring";
import { KidFormDialog, StatsDialog, PasswordDialog, ConfirmDialog } from "@/components/kid-dialogs";
import { ConfettiCelebration } from "@/components/ui/confetti-celebration";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { errorMessage, firstName, useChildren, useConfig, dayKey, type Me } from "@/lib/api";
import { cn } from "@/lib/utils";

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

type Dialogs =
  | { kind: "add" } | { kind: "edit"; kid: ChildProfile } | { kind: "stats"; kid: ChildProfile }
  | { kind: "password"; kid: ChildProfile } | { kind: "badday"; kid: ChildProfile } | { kind: "remove"; kid: ChildProfile }
  | { kind: "undo"; kid: ChildProfile; day: string } | null;

export default function ParentHome({ me }: { me: Me }) {
  const { data: kids = [], isLoading } = useChildren();
  const { goodDaysRequired: goal } = useConfig();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [dialog, setDialog] = useState<Dialogs>(null);
  const [celebrate, setCelebrate] = useState(false);
  const close = () => setDialog(null);

  const refresh = (kidId?: number) => {
    qc.invalidateQueries({ queryKey: ["/api/children"] });
    if (kidId) qc.invalidateQueries({ queryKey: ["gooddays", kidId] });
  };

  const logDay = useMutation({
    mutationFn: ({ kid, day }: { kid: ChildProfile; day: string }) =>
      apiRequest<{ isSpinAvailable: boolean; child: ChildProfile }>("POST", `/api/children/${kid.id}/goodday`, { day }),
    onSuccess: (r, { kid, day }) => {
      refresh(kid.id);
      if (r.isSpinAvailable) {
        setCelebrate(true);
        toast({ title: `${kid.name} earned a spin! 🎉`, description: "They can spin the reward wheel now." });
      } else {
        const left = goal - r.child.goodDayCount;
        toast({
          title: day === dayKey() ? `Good day for ${kid.name}` : `Logged ${format(new Date(day + "T12:00"), "EEEE")} for ${kid.name}`,
          description: `${left} more to the next spin.`,
        });
      }
    },
    onError: (e, { kid }) => {
      refresh(kid.id);
      toast({ title: "Couldn't log it", description: errorMessage(e), variant: "destructive" });
    },
  });

  const undoDay = useMutation({
    mutationFn: ({ kid, day }: { kid: ChildProfile; day: string }) => apiRequest("DELETE", `/api/children/${kid.id}/goodday/${day}`),
    onSuccess: (_r, { kid }) => {
      refresh(kid.id);
      toast({ title: "Good day removed" });
    },
    onError: (e, { kid }) => {
      refresh(kid.id);
      toast({ title: "Couldn't remove it", description: errorMessage(e), variant: "destructive" });
    },
  });

  const saveKid = useMutation({
    mutationFn: ({ id, data }: { id?: number; data: { name: string; avatar: string | null } }) =>
      id ? apiRequest("PUT", `/api/children/${id}`, data) : apiRequest("POST", "/api/children", data),
    onSuccess: (_r, v) => {
      refresh();
      close();
      toast({ title: v.id ? "Saved" : `${v.data.name} added` });
    },
    onError: (e) => toast({ title: "Couldn't save", description: errorMessage(e), variant: "destructive" }),
  });

  const saveStats = useMutation({
    mutationFn: ({ kid, data }: { kid: ChildProfile; data: { goodDayCount: number; earnedSpins: number } }) =>
      apiRequest<ChildProfile>("PUT", `/api/children/${kid.id}/statistics`, data),
    onSuccess: (r, { kid }) => {
      refresh(kid.id);
      close();
      toast({ title: "Counts updated", description: `${kid.name}: ${r.goodDayCount} good days, ${r.earnedSpins} spins ready.` });
    },
    onError: (e) => toast({ title: "Couldn't save", description: errorMessage(e), variant: "destructive" }),
  });

  const setPassword = useMutation({
    mutationFn: ({ kid, password }: { kid: ChildProfile; password: string }) => apiRequest("POST", `/api/children/${kid.id}/password`, { password }),
    onSuccess: (_r, { kid }) => {
      close();
      toast({ title: "Password set", description: `${kid.name} can sign in with the new password.` });
    },
    onError: (e) => toast({ title: "Couldn't set password", description: errorMessage(e), variant: "destructive" }),
  });

  const simple = useMutation({
    mutationFn: ({ url, method }: { url: string; method: string; done: string }) => apiRequest(method, url),
    onSuccess: (_r, v) => {
      refresh();
      close();
      toast({ title: v.done });
    },
    onError: (e) => toast({ title: "That didn't work", description: errorMessage(e), variant: "destructive" }),
  });

  return (
    <div>
      <PageHeader eyebrow={format(new Date(), "EEEE, MMMM d")} title={`${greeting()}, ${firstName(me)}`}>
        {kids.length > 0 ? "Tap Good day when someone earns it." : "Let's set up your family."}
      </PageHeader>

      <ApprovalsInbox />

      <section aria-labelledby="kids-heading">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="kids-heading" className="text-lg font-bold">Your kids</h2>
          {kids.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => setDialog({ kind: "add" })} data-testid="button-add-child">
              <Plus /> Add kid
            </Button>
          )}
        </div>

        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2">
            {[0, 1].map((i) => <div key={i} className="surface h-64 animate-pulse" />)}
          </div>
        ) : kids.length === 0 ? (
          <div className="surface flex flex-col items-center px-6 py-12 text-center">
            <div className="mb-4 flex -space-x-3">
              {["A", "M", "J"].map((l, i) => <KidAvatar key={l} name={l + i} className="h-14 w-14" />)}
            </div>
            <h3 className="text-xl font-bold">Add your first kid</h3>
            <p className="mt-1 max-w-sm text-muted-foreground">Each kid gets their own progress. Every {goal} good days earns a spin on the reward wheel.</p>
            <Button className="mt-6" size="lg" onClick={() => setDialog({ kind: "add" })} data-testid="button-add-child">
              <Plus /> Add a kid
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {kids.map((kid) => (
              <KidCard
                key={kid.id}
                kid={kid}
                goal={goal}
                busy={logDay.isPending || undoDay.isPending}
                onLog={(day) => logDay.mutate({ kid, day })}
                onUndo={(day) => setDialog({ kind: "undo", kid, day })}
                onMenu={(kind) => setDialog({ kind, kid } as Dialogs)}
              />
            ))}
          </div>
        )}
      </section>

      <div className="mt-8">
        <InviteCard me={me} />
      </div>

      <ConfettiCelebration active={celebrate} duration={4000} onComplete={() => setCelebrate(false)} />

      <KidFormDialog
        open={dialog?.kind === "add" || dialog?.kind === "edit"}
        onOpenChange={(o) => !o && close()}
        kid={dialog?.kind === "edit" ? dialog.kid : null}
        saving={saveKid.isPending}
        onSave={(data) => saveKid.mutate({ id: dialog?.kind === "edit" ? dialog.kid.id : undefined, data })}
      />
      <StatsDialog
        open={dialog?.kind === "stats"} onOpenChange={(o) => !o && close()}
        kid={dialog?.kind === "stats" ? dialog.kid : null} goal={goal} saving={saveStats.isPending}
        onSave={(data) => dialog?.kind === "stats" && saveStats.mutate({ kid: dialog.kid, data })}
      />
      <PasswordDialog
        open={dialog?.kind === "password"} onOpenChange={(o) => !o && close()}
        kid={dialog?.kind === "password" ? dialog.kid : null} saving={setPassword.isPending}
        onSave={(password) => dialog?.kind === "password" && setPassword.mutate({ kid: dialog.kid, password })}
      />
      <ConfirmDialog
        open={dialog?.kind === "badday"} onOpenChange={(o) => !o && close()}
        title={`Start ${dialog && "kid" in dialog ? dialog.kid.name : ""}'s count over?`}
        description="Their good days go back to 0. Spins they already earned are kept."
        confirmLabel="Start over"
        onConfirm={() => dialog?.kind === "badday" && simple.mutate({ url: `/api/children/${dialog.kid.id}/badspin`, method: "POST", done: "Count reset to 0" })}
      />
      <ConfirmDialog
        open={dialog?.kind === "remove"} onOpenChange={(o) => !o && close()} destructive
        title={`Remove ${dialog && "kid" in dialog ? dialog.kid.name : ""}?`}
        description="This deletes their progress, to-dos and history. Their login stops working. This can't be undone."
        confirmLabel="Remove"
        onConfirm={() => dialog?.kind === "remove" && simple.mutate({ url: `/api/children/${dialog.kid.id}`, method: "DELETE", done: `${dialog.kid.name} removed` })}
      />
      <ConfirmDialog
        open={dialog?.kind === "undo"} onOpenChange={(o) => !o && close()}
        title="Remove this good day?"
        description={dialog?.kind === "undo" ? `${format(new Date(dialog.day + "T12:00"), "EEEE, MMM d")} for ${dialog.kid.name}. If it had just earned a spin, that spin is taken back.` : ""}
        confirmLabel="Remove good day"
        onConfirm={() => dialog?.kind === "undo" && undoDay.mutate({ kid: dialog.kid, day: dialog.day })}
      />
    </div>
  );
}

function KidCard({
  kid, goal, busy, onLog, onUndo, onMenu,
}: {
  kid: ChildProfile; goal: number; busy: boolean;
  onLog: (day: string) => void; onUndo: (day: string) => void;
  onMenu: (kind: "edit" | "stats" | "password" | "badday" | "remove") => void;
}) {
  const [, setLocation] = useLocation();
  const { data: logs = [] } = useQuery<GoodDayLog[]>({
    queryKey: ["gooddays", kid.id],
    queryFn: () => apiRequest("GET", `/api/children/${kid.id}/gooddays`),
  });
  const logged = new Set(logs.map((l) => l.day));
  const today = dayKey();
  const loggedToday = logged.has(today);
  const days = Array.from({ length: 7 }, (_, i) => subDays(new Date(), 6 - i));
  const left = goal - kid.goodDayCount;

  return (
    <article className="surface flex min-w-0 flex-col p-5" data-testid={`card-child-${kid.id}`}>
      <div className="flex items-start gap-3">
        <KidAvatar name={kid.name} avatar={kid.avatar} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-lg font-bold" data-testid={`text-child-name-${kid.id}`}>{kid.name}</h3>
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            {kid.childUserId ? <><Link2 className="h-3 w-3" /> Has a login</> : "No login yet"}
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`More for ${kid.name}`} data-testid={`button-child-menu-${kid.id}`}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem onClick={() => onMenu("edit")}><Pencil /> Edit name or photo</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onMenu("stats")} data-testid={`button-edit-stats-${kid.id}`}><SlidersHorizontal /> Adjust counts</DropdownMenuItem>
            {kid.childUserId && <DropdownMenuItem onClick={() => onMenu("password")} data-testid={`button-set-password-${kid.id}`}><KeyRound /> Set their password</DropdownMenuItem>}
            <DropdownMenuItem onClick={() => onMenu("badday")} data-testid={`button-bad-day-${kid.id}`}><CloudRain /> Bad day: start count over</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onMenu("remove")} className="text-destructive focus:text-destructive"><Trash2 /> Remove</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="mt-5 flex items-center gap-4">
        <ProgressRing value={kid.goodDayCount} max={goal} size={84} stroke={8} label={`${kid.goodDayCount} of ${goal} good days`}>
          <span className="text-2xl font-extrabold leading-none tabular-nums" data-testid={`text-good-days-${kid.id}`}>{kid.goodDayCount}</span>
          <span className="text-[11px] font-semibold text-muted-foreground">of {goal}</span>
        </ProgressRing>
        <div className="min-w-0">
          {kid.earnedSpins > 0 ? (
            <p className="inline-flex items-center gap-1.5 rounded-full bg-reward-soft px-3 py-1 text-sm font-bold text-amber-700 dark:text-amber-300" data-testid={`text-spins-${kid.id}`}>
              <Sparkles className="h-4 w-4" aria-hidden="true" /> {kid.earnedSpins} spin{kid.earnedSpins > 1 ? "s" : ""} ready
            </p>
          ) : (
            <p className="text-sm font-semibold" data-testid={`text-spins-${kid.id}`}>No spins yet</p>
          )}
          <p className="mt-1 text-sm text-muted-foreground">
            {left === 1 ? "1 more good day to the next spin" : `${left} more good days to the next spin`}
          </p>
        </div>
      </div>

      {/* Last 7 days: tap to log a missed day, tap a logged day to remove it */}
      <div className="mt-5">
        <p className="eyebrow mb-2">This week</p>
        <ol className="grid grid-cols-7 gap-1.5">
          {days.map((d) => {
            const key = dayKey(d);
            const on = logged.has(key);
            const isToday = key === today;
            return (
              <li key={key}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => (on ? onUndo(key) : onLog(key))}
                  aria-pressed={on}
                  aria-label={`${format(d, "EEEE MMM d")}: ${on ? "good day, tap to remove" : "tap to log a good day"}`}
                  data-testid={`day-${kid.id}-${key}`}
                  className={cn(
                    "flex w-full flex-col items-center gap-1 rounded-2xl py-2 text-[11px] font-semibold transition-colors",
                    on ? "bg-success text-white" : "bg-muted text-muted-foreground hover:bg-secondary",
                    isToday && !on && "ring-2 ring-primary/40",
                  )}
                >
                  <span>{format(d, "EEEEE")}</span>
                  <span className="flex h-5 items-center">{on ? <Check className="h-4 w-4" strokeWidth={3} /> : <span className="text-sm">{format(d, "d")}</span>}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="mt-5 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
        <Button
          size="lg"
          className={cn("h-12 px-4", loggedToday && "bg-success-soft text-success shadow-none hover:bg-success-soft")}
          disabled={busy || loggedToday}
          onClick={() => onLog(today)}
          data-testid={`button-good-day-${kid.id}`}
        >
          <Check strokeWidth={3} /> {loggedToday ? "Good day logged" : "Good day"}
        </Button>
        <Button
          size="lg" variant="outline" className="h-12 px-5"
          onClick={() => setLocation(`/spin?child=${kid.id}`)}
          data-testid={`button-spin-child-${kid.id}`}
        >
          <Disc3 /> Spin
        </Button>
      </div>
    </article>
  );
}
