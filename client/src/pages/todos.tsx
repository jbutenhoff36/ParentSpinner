import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { Check, Gift, Brush, Swords, X, PartyPopper, Hourglass } from "lucide-react";
import type { PendingConsequence, SpinRequest } from "@shared/schema";
import { PageHeader } from "@/components/app-shell";
import { KidAvatar } from "@/components/kid-avatar";
import { ConfirmDialog } from "@/components/kid-dialogs";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { errorMessage, useChildren, type ConsequenceType, type Me } from "@/lib/api";
import { cn } from "@/lib/utils";

const ICON: Record<string, typeof Gift> = { good: Gift, bad: Brush, fighting: Swords };
const TONE: Record<string, string> = {
  good: "bg-reward-soft text-amber-600 dark:text-amber-300",
  bad: "bg-chore-soft text-sky-600 dark:text-sky-300",
  fighting: "bg-fight-soft text-rose-600 dark:text-rose-300",
};
const LABEL: Record<string, string> = { good: "Reward", bad: "Chore", fighting: "Fighting" };

export default function TodosPage({ me }: { me: Me }) {
  const isParent = me.role === "parent";
  const { toast } = useToast();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<number | "all">("all");
  const [confirmClear, setConfirmClear] = useState(false);
  const { data: items = [], isLoading } = useQuery<PendingConsequence[]>({ queryKey: ["/api/pending"] });
  const { data: kids = [] } = useChildren();
  const { data: mine = [] } = useQuery<SpinRequest[]>({ queryKey: ["/api/spinrequests/mine"], enabled: !isParent });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["/api/pending"] });
    qc.invalidateQueries({ queryKey: ["/api/children"] });
  };
  const act = useMutation({
    mutationFn: ({ id, kind }: { id: number; kind: "complete" | "delete" }) =>
      kind === "complete" ? apiRequest("POST", `/api/pending/${id}/complete`) : apiRequest("DELETE", `/api/pending/${id}`),
    onSuccess: (_r, v) => {
      refresh();
      toast({ title: v.kind === "complete" ? "Done ✓" : "Removed" });
    },
    onError: (e) => {
      refresh();
      toast({ title: "That didn't work", description: errorMessage(e), variant: "destructive" });
    },
  });
  const clearAll = useMutation({
    mutationFn: () => apiRequest("DELETE", "/api/pending"),
    onSuccess: () => {
      refresh();
      toast({ title: "List cleared" });
    },
    onError: (e) => toast({ title: "Couldn't clear it", description: errorMessage(e), variant: "destructive" }),
  });

  const open = items.filter((i) => !i.completed && (filter === "all" || i.childId === filter));
  const kidName = (id: number) => kids.find((k) => k.id === id)?.name || "";
  const waiting = mine.filter((r) => r.status === "pending");
  const groups = (["good", "bad", "fighting"] as ConsequenceType[])
    .map((t) => ({ type: t, items: open.filter((i) => i.type === t) }))
    .filter((g) => g.items.length);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        eyebrow={isParent ? "Earned from spins" : "Your list"}
        title={isParent ? "To-dos" : "My prizes and chores"}
        action={isParent && open.length > 0 ? <Button variant="ghost" size="sm" onClick={() => setConfirmClear(true)}>Clear all</Button> : undefined}
      />

      {isParent && kids.length > 1 && (
        <div className="mb-5 flex flex-wrap gap-2" role="radiogroup" aria-label="Show">
          {[{ id: "all" as const, name: "Everyone" }, ...kids].map((k) => (
            <button
              key={k.id}
              role="radio"
              aria-checked={filter === k.id}
              onClick={() => setFilter(k.id)}
              className={cn(
                "rounded-full border px-4 py-1.5 text-sm font-semibold",
                filter === k.id ? "border-primary bg-secondary text-secondary-foreground" : "bg-card hover:bg-muted",
              )}
            >
              {k.name}
            </button>
          ))}
        </div>
      )}

      {!isParent && waiting.length > 0 && (
        <div className="mb-6 space-y-2">
          {waiting.map((r) => (
            <div key={r.id} className="flex items-center gap-3 rounded-2xl border border-dashed p-4" data-testid={`waiting-${r.id}`}>
              <Hourglass className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
              <div className="flex-1">
                <p className="font-semibold">{r.consequenceText}</p>
                <p className="text-sm text-muted-foreground">Waiting for your parent to OK it</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="surface h-20 animate-pulse" />)}</div>
      ) : open.length === 0 ? (
        <div className="surface flex flex-col items-center px-6 py-14 text-center">
          <span className="mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-success-soft text-success">
            <PartyPopper className="h-8 w-8" aria-hidden="true" />
          </span>
          <h2 className="text-xl font-bold">All clear</h2>
          <p className="mt-1 text-muted-foreground">
            {isParent ? "When you keep a spin, it shows up here until it's done." : "Prizes you win and chores you get show up here."}
          </p>
        </div>
      ) : (
        <div className="space-y-8" data-testid="pending-list">
          {groups.map((g) => (
            <section key={g.type}>
              <h2 className="eyebrow mb-3">{LABEL[g.type]}s · {g.items.length}</h2>
              <ul className="space-y-3">
                {g.items.map((item) => {
                  const Icon = ICON[item.type] || Gift;
                  const kid = kids.find((k) => k.id === item.childId);
                  return (
                    <li key={item.id} className="surface flex items-center gap-4 p-4" data-testid={`pending-item-${item.id}`}>
                      <span className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl", TONE[item.type])}>
                        <Icon className="h-6 w-6" aria-hidden="true" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="font-bold leading-snug">{item.text}</p>
                        <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
                          {isParent && kid && <><KidAvatar name={kid.name} avatar={kid.avatar} className="h-5 w-5 text-[10px] ring-0" />{kidName(item.childId)} ·</>}
                          {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
                        </p>
                      </div>
                      {isParent && (
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon-sm" aria-label="Remove" onClick={() => act.mutate({ id: item.id, kind: "delete" })} disabled={act.isPending}>
                            <X />
                          </Button>
                          <Button size="sm" className="bg-success hover:bg-success/90 shadow-success/30" onClick={() => act.mutate({ id: item.id, kind: "complete" })} disabled={act.isPending} data-testid={`button-complete-${item.id}`}>
                            <Check strokeWidth={3} /> Done
                          </Button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={confirmClear} onOpenChange={setConfirmClear} destructive
        title="Clear the whole list?" description="This removes every open to-do for all your kids. It can't be undone."
        confirmLabel="Clear all" onConfirm={() => clearAll.mutate()}
      />
    </div>
  );
}
