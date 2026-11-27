import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Gift, Brush, Swords, Plus, Trash2, Check, Pencil, X } from "lucide-react";
import type { Consequence } from "@shared/schema";
import { PageHeader } from "@/components/app-shell";
import { InviteCard } from "@/components/invite-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { errorMessage, useConfig, TYPE_META, type ConsequenceType, type Me } from "@/lib/api";
import { cn } from "@/lib/utils";

const ICONS: Record<ConsequenceType, typeof Gift> = { good: Gift, bad: Brush, fighting: Swords };

export default function SetupPage({ me }: { me: Me }) {
  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <PageHeader eyebrow="Setup" title="Your family's rules" />
      <WheelsEditor />
      <GoalCard />
      <InviteCard me={me} />
      <AccountCard me={me} />
    </div>
  );
}

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="surface p-5 md:p-6">
      <h2 className="text-lg font-bold">{title}</h2>
      {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

function WheelsEditor() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [type, setType] = useState<ConsequenceType>("good");
  const [newText, setNewText] = useState("");
  const [editing, setEditing] = useState<{ id: number; text: string } | null>(null);
  const { data: all = [] } = useQuery<Consequence[]>({ queryKey: ["/api/consequences"] });
  const list = all.filter((c) => c.type === type).sort((a, b) => a.section - b.section);
  const refresh = () => qc.invalidateQueries({ queryKey: ["/api/consequences"] });

  const add = useMutation({
    mutationFn: () => apiRequest("POST", "/api/consequences", { text: newText.trim(), type }),
    onSuccess: () => {
      setNewText("");
      refresh();
    },
    onError: (e) => toast({ title: "Couldn't add it", description: errorMessage(e), variant: "destructive" }),
  });
  const save = useMutation({
    mutationFn: (v: { id: number; text: string }) => apiRequest("PUT", `/api/consequences/${v.id}`, { text: v.text.trim() }),
    onSuccess: () => {
      setEditing(null);
      refresh();
    },
    onError: (e) => toast({ title: "Couldn't save", description: errorMessage(e), variant: "destructive" }),
  });
  const remove = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/consequences/${id}`),
    onSuccess: refresh,
    onError: (e) => toast({ title: "Couldn't remove it", description: errorMessage(e), variant: "destructive" }),
  });

  return (
    <Section title="Wheels" description="What can land on each wheel. Changes show up on the next spin.">
      <div className="mb-4 grid grid-cols-3 gap-1 rounded-2xl bg-muted p-1" role="tablist">
        {(["good", "bad", "fighting"] as ConsequenceType[]).map((t) => {
          const Icon = ICONS[t];
          return (
            <button
              key={t} role="tab" aria-selected={type === t} onClick={() => { setType(t); setEditing(null); }}
              data-testid={`tab-wheel-${t}`}
              className={cn("flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-semibold", type === t ? "bg-card shadow-sm" : "text-muted-foreground")}
            >
              <Icon className="h-4 w-4" aria-hidden="true" /> {TYPE_META[t].label}
            </button>
          );
        })}
      </div>

      <p className="eyebrow mb-2">{list.length} on this wheel</p>
      <ul className="divide-y rounded-2xl border" data-testid="wheel-items">
        {list.map((c) => (
          <li key={c.id} className="flex items-center gap-2 px-3 py-2">
            {editing?.id === c.id ? (
              <form className="flex flex-1 items-center gap-2" onSubmit={(e) => { e.preventDefault(); if (editing.text.trim()) save.mutate(editing); }}>
                <Input value={editing.text} onChange={(e) => setEditing({ id: c.id, text: e.target.value })} className="h-10" maxLength={200} autoFocus aria-label="Prize text" />
                <Button type="submit" size="icon-sm" aria-label="Save"><Check /></Button>
                <Button type="button" variant="ghost" size="icon-sm" aria-label="Cancel" onClick={() => setEditing(null)}><X /></Button>
              </form>
            ) : (
              <>
                <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", TYPE_META[type].tone)} aria-hidden="true" />
                <span className="flex-1 py-1.5 font-medium">{c.text}</span>
                <Button variant="ghost" size="icon-sm" aria-label={`Edit ${c.text}`} onClick={() => setEditing({ id: c.id, text: c.text })}><Pencil /></Button>
                <Button variant="ghost" size="icon-sm" aria-label={`Remove ${c.text}`} onClick={() => remove.mutate(c.id)} disabled={remove.isPending}><Trash2 /></Button>
              </>
            )}
          </li>
        ))}
        {list.length === 0 && <li className="px-4 py-6 text-center text-sm text-muted-foreground">Nothing here yet. Add the first one below.</li>}
      </ul>

      <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (newText.trim()) add.mutate(); }}>
        <Input
          value={newText} onChange={(e) => setNewText(e.target.value)} maxLength={200}
          placeholder={type === "good" ? "Add a reward, like Movie night" : type === "bad" ? "Add a chore, like Fold laundry" : "Add a consequence"}
          aria-label="New item" data-testid="input-new-consequence"
        />
        <Button type="submit" disabled={!newText.trim() || add.isPending || list.length >= 50} data-testid="button-add-consequence">
          <Plus /> Add
        </Button>
      </form>
    </Section>
  );
}

function GoalCard() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { goodDaysRequired, data } = useConfig();
  const [goal, setGoal] = useState(goodDaysRequired);
  useEffect(() => setGoal(goodDaysRequired), [goodDaysRequired]);
  const save = useMutation({
    mutationFn: (n: number) => apiRequest("POST", "/api/config", { goodDaysRequired: n }),
    onSuccess: (_r, n) => {
      qc.invalidateQueries({ queryKey: ["/api/config"] });
      qc.invalidateQueries({ queryKey: ["/api/children"] });
      toast({ title: "Saved", description: `Every ${n} good days now earns a spin.` });
    },
    onError: (e) => toast({ title: "Couldn't save", description: errorMessage(e), variant: "destructive" }),
  });
  return (
    <Section title="Good days for a spin" description="How many good days a kid needs to earn one spin on the reward wheel.">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 rounded-2xl border p-1.5">
          <Button variant="ghost" size="icon" onClick={() => setGoal(Math.max(1, goal - 1))} aria-label="Fewer days">−</Button>
          <span className="w-10 text-center text-2xl font-extrabold tabular-nums" data-testid="text-goal">{goal}</span>
          <Button variant="ghost" size="icon" onClick={() => setGoal(Math.min(30, goal + 1))} aria-label="More days">+</Button>
        </div>
        <span className="text-muted-foreground">good days</span>
        <Button className="ml-auto" disabled={goal === goodDaysRequired || !data || save.isPending} onClick={() => save.mutate(goal)} data-testid="button-save-goal">
          Save
        </Button>
      </div>
      {goal < goodDaysRequired && (
        <p className="mt-3 text-sm text-muted-foreground">Kids who already have {goal} or more good days will get their spin right away.</p>
      )}
    </Section>
  );
}

function AccountCard({ me }: { me: Me }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: providers } = useQuery<{ google: boolean }>({ queryKey: ["/api/auth/providers"] });
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const setPw = useMutation({
    mutationFn: () => apiRequest("POST", "/api/auth/password", { currentPassword: current || undefined, newPassword: next }),
    onSuccess: () => {
      setCurrent("");
      setNext("");
      qc.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({ title: "Password saved" });
    },
    onError: (e) => toast({ title: "Couldn't save password", description: errorMessage(e), variant: "destructive" }),
  });
  const unlink = useMutation({
    mutationFn: () => apiRequest("POST", "/api/auth/google/unlink"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({ title: "Google disconnected" });
    },
    onError: (e) => toast({ title: "Couldn't disconnect", description: errorMessage(e), variant: "destructive" }),
  });

  return (
    <Section title="Your account" description={`Signed in as @${me.username}${me.email ? ` · ${me.email}` : ""}`}>
      {providers?.google && (
        <div className="mb-6 flex flex-wrap items-center gap-3 rounded-2xl border p-4">
          <GoogleG />
          <div className="flex-1">
            <p className="font-semibold">Sign in with Google</p>
            <p className="text-sm text-muted-foreground">{me.googleLinked ? "Connected" : "Not connected"}</p>
          </div>
          {me.googleLinked ? (
            <Button variant="outline" size="sm" disabled={!me.hasPassword || unlink.isPending} onClick={() => unlink.mutate()} title={me.hasPassword ? "" : "Set a password first"}>
              Disconnect
            </Button>
          ) : (
            <Button variant="outline" size="sm" asChild data-testid="button-connect-google">
              <a href="/api/auth/google?mode=link">Connect</a>
            </Button>
          )}
        </div>
      )}
      <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); setPw.mutate(); }}>
        <p className="font-semibold">{me.hasPassword ? "Change password" : "Add a password"}</p>
        {me.hasPassword && (
          <div className="grid gap-1.5">
            <Label htmlFor="pw-current">Current password</Label>
            <Input id="pw-current" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
          </div>
        )}
        <div className="grid gap-1.5">
          <Label htmlFor="pw-new">New password</Label>
          <Input id="pw-new" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} placeholder="At least 6 characters" />
        </div>
        <Button type="submit" variant="outline" className="justify-self-start" disabled={next.length < 6 || (me.hasPassword && !current) || setPw.isPending}>
          Save password
        </Button>
      </form>
    </Section>
  );
}

export function GoogleG({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={cn("h-5 w-5", className)} aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/>
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/>
    </svg>
  );
}
