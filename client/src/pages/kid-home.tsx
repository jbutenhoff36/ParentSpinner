import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Sparkles, Hourglass, ChevronRight, Gift, Brush, Swords, Star } from "lucide-react";
import type { PendingConsequence, SpinRequest } from "@shared/schema";
import { ProgressRing } from "@/components/progress-ring";
import { KidAvatar } from "@/components/kid-avatar";
import { Button } from "@/components/ui/button";
import { useChildren, useConfig, firstName, type Me } from "@/lib/api";
import { cn } from "@/lib/utils";

const ICON: Record<string, typeof Gift> = { good: Gift, bad: Brush, fighting: Swords };

export default function KidHome({ me }: { me: Me }) {
  const { data: kids = [], isLoading } = useChildren();
  const { goodDaysRequired: goal } = useConfig();
  const { data: mine = [] } = useQuery<SpinRequest[]>({ queryKey: ["/api/spinrequests/mine"], refetchInterval: 15000 });
  const { data: items = [] } = useQuery<PendingConsequence[]>({ queryKey: ["/api/pending"] });
  const kid = kids[0];

  if (isLoading) return <div className="surface h-80 animate-pulse" />;
  if (!kid) {
    return (
      <div className="surface p-8 text-center">
        <h1 className="text-xl font-bold">Your profile isn't linked</h1>
        <p className="mt-1 text-muted-foreground">Ask your parent to check their family list.</p>
      </div>
    );
  }

  const waiting = mine.filter((r) => r.status === "pending" && r.type === "good").length;
  const spins = Math.max(0, kid.earnedSpins - waiting);
  const left = goal - kid.goodDayCount;
  const open = items.filter((i) => !i.completed);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <section className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#6D4AFF] via-[#8B5CF6] to-[#EC4899] p-6 text-white shadow-xl shadow-primary/20 md:p-8">
        <Star className="absolute -right-6 -top-6 h-40 w-40 rotate-12 text-white/10" aria-hidden="true" />
        <div className="relative flex items-center gap-3">
          <KidAvatar name={kid.name} avatar={kid.avatar} className="h-12 w-12 ring-white/40" />
          <div>
            <p className="text-sm text-white/80">Hi</p>
            <h1 className="text-2xl font-extrabold">{firstName(me) || kid.name}!</h1>
          </div>
        </div>

        <div className="relative mt-6 flex items-center gap-5">
          <ProgressRing value={kid.goodDayCount} max={goal} size={112} stroke={10} className="[&_circle:first-child]:stroke-white/25 [&_circle:last-child]:stroke-white" label={`${kid.goodDayCount} of ${goal} good days`}>
            <span className="text-4xl font-extrabold leading-none tabular-nums">{kid.goodDayCount}</span>
            <span className="text-xs font-semibold text-white/80">of {goal}</span>
          </ProgressRing>
          <div>
            <p className="text-lg font-bold leading-snug" data-testid="text-good-days">
              {kid.goodDayCount} of {goal} good days
            </p>
            <p className="text-white/85">{left === 1 ? "Just 1 more for a spin!" : `${left} more for your next spin`}</p>
          </div>
        </div>

        <div className="relative mt-6">
          {spins > 0 ? (
            <Button asChild size="lg" className="h-14 w-full bg-white text-[#5B3DF0] shadow-lg hover:bg-white/90" data-testid="button-go-spin">
              <Link href="/spin"><Sparkles /> You have {spins} spin{spins > 1 ? "s" : ""}! Spin now</Link>
            </Button>
          ) : waiting > 0 ? (
            <p className="flex items-center gap-2 rounded-2xl bg-white/15 px-4 py-3 font-semibold" data-testid="text-waiting">
              <Hourglass className="h-5 w-5" /> Your prize is waiting for your parent's OK
            </p>
          ) : (
            <p className="rounded-2xl bg-white/15 px-4 py-3 font-semibold" data-testid="text-no-spins">Keep going! Good days earn spins.</p>
          )}
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">My list</h2>
          <Link href="/todos" className="flex items-center text-sm font-semibold text-primary">See all <ChevronRight className="h-4 w-4" /></Link>
        </div>
        {open.length === 0 ? (
          <p className="surface p-5 text-muted-foreground">Nothing on your list right now.</p>
        ) : (
          <ul className="space-y-2">
            {open.slice(0, 4).map((i) => {
              const Icon = ICON[i.type] || Gift;
              return (
                <li key={i.id} className="surface flex items-center gap-3 p-4">
                  <span className={cn("flex h-10 w-10 items-center justify-center rounded-xl", i.type === "good" ? "bg-reward-soft text-amber-600" : i.type === "bad" ? "bg-chore-soft text-sky-600" : "bg-fight-soft text-rose-600")}>
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <span className="font-semibold">{i.text}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
