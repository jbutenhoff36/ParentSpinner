import { useState, useCallback, useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearch } from "wouter";
import { Sparkles, Hourglass, Lock, Gift, Brush, Swords } from "lucide-react";
import type { Consequence, ChildProfile, SpinRequest } from "@shared/schema";
import { PrizeWheel, type PrizeWheelHandle, type WheelSlice } from "@/components/ui/prize-wheel";
import { PageHeader } from "@/components/app-shell";
import { KidAvatar } from "@/components/kid-avatar";
import { ProgressRing } from "@/components/progress-ring";
import { ConfettiCelebration } from "@/components/ui/confetti-celebration";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { playSuccessSound, initAudioSystem, playSpinnerStartSound, playWheelTick } from "@/lib/sound-utils";
import { errorMessage, useChildren, useConfig, TYPE_META, type ConsequenceType, type Me } from "@/lib/api";
import { cn } from "@/lib/utils";

type SpinResult = { id: number | null; text: string; type: string; section: number };
type ServerSpin = { spinId: string; type: string; section: number; consequence: SpinResult };

const PALETTES: Record<ConsequenceType, { colors: string[]; text: string }> = {
  good: { colors: ["#FFC93C", "#FF8F5E", "#FF7AA8", "#B794FF", "#5EC8FF", "#4FDC9A"], text: "#1A1436" },
  bad: { colors: ["#7FC6F5", "#7EDCC6", "#A4B5F8", "#68D2E3", "#B3C4E6", "#8FB2F7"], text: "#0F2238" },
  fighting: { colors: ["#FF8FA9", "#D99CF7", "#FFAA85", "#BFA0FA", "#FF9DC8", "#FF9B9B"], text: "#35121F" },
};
const ICONS: Record<ConsequenceType, typeof Gift> = { good: Gift, bad: Brush, fighting: Swords };

export default function SpinPage({ me }: { me: Me }) {
  const isChild = me.role === "child";
  const search = new URLSearchParams(useSearch());
  const { toast } = useToast();
  const qc = useQueryClient();
  const wheelRef = useRef<PrizeWheelHandle>(null);
  const spinRef = useRef<ServerSpin | null>(null);

  const [type, setType] = useState<ConsequenceType>(() => {
    const t = search.get("type");
    return !isChild && (t === "bad" || t === "fighting") ? t : "good";
  });
  const [childId, setChildId] = useState<number | null>(() => Number(search.get("child")) || null);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<ServerSpin | null>(null);
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState("");
  const [celebrate, setCelebrate] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  const { data: kids = [] } = useChildren();
  const { goodDaysRequired: goal } = useConfig();
  const { data: consequences = [] } = useQuery<Consequence[]>({ queryKey: ["/api/consequences"] });
  const { data: mine = [] } = useQuery<SpinRequest[]>({ queryKey: ["/api/spinrequests/mine"], enabled: isChild, refetchInterval: 15000 });

  // Kids spin for themselves; with one kid a parent doesn't need to pick
  useEffect(() => {
    if (isChild && kids[0]) setChildId(kids[0].id);
    else if (!childId && kids.length === 1) setChildId(kids[0].id);
  }, [isChild, kids, childId]);

  const kid: ChildProfile | undefined = kids.find((k) => k.id === childId);
  const options = consequences.filter((c) => c.type === type).sort((a, b) => a.section - b.section);
  const palette = PALETTES[type];
  const slices: WheelSlice[] = (options.length ? options.map((o) => o.text) : ["Add prizes in Setup"]).map((label, i, arr) => ({
    label,
    color: palette.colors[(i === arr.length - 1 && arr.length % palette.colors.length === 1 ? i + 1 : i) % palette.colors.length],
    textColor: palette.text,
  }));

  const waiting = isChild ? mine.filter((r) => r.status === "pending" && r.type === "good").length : 0;
  const spinsLeft = Math.max(0, (kid?.earnedSpins || 0) - waiting);
  const needsSpin = type === "good";
  const canSpin = !!kid && options.length > 0 && !spinning && !result && (!needsSpin || spinsLeft > 0);

  const refreshAll = () => {
    ["/api/pending", "/api/children", "/api/spinrequests/mine", "pendingSpinRequests"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  };

  const closeReveal = () => {
    setResult(null);
    setAsking(false);
    setReason("");
    setCelebrate(false);
    spinRef.current = null;
  };

  const request = useMutation({
    mutationFn: () => apiRequest("POST", "/api/spinrequests", { spinId: result?.spinId, description: reason.trim() }),
    onSuccess: () => {
      refreshAll();
      toast({ title: "Sent! 📨", description: "Your parent will look at it soon." });
      closeReveal();
    },
    onError: (e) => toast({ title: "Couldn't send it", description: errorMessage(e), variant: "destructive" }),
  });

  const accept = useMutation({
    mutationFn: () => apiRequest("POST", `/api/spins/${result?.spinId}/accept`),
    onSuccess: () => {
      refreshAll();
      toast({ title: "Added to the list", description: `${kid?.name} will see it under To-dos.` });
      closeReveal();
    },
    onError: (e) => toast({ title: "Couldn't add it", description: errorMessage(e), variant: "destructive" }),
  });

  const explainBlocked = useCallback(() => {
    if (spinning || result) return;
    if (!kid) toast({ title: "Pick who this spin is for" });
    else if (!options.length) toast({ title: "This wheel is empty", description: "Add prizes to it in Setup." });
    else if (needsSpin && spinsLeft <= 0) {
      toast({
        title: "No spins yet",
        description: isChild
          ? waiting > 0 ? "Your last spin is waiting for your parent." : `Every ${goal} good days earns a spin. Keep going!`
          : `${kid.name} needs ${goal - kid.goodDayCount} more good day${goal - kid.goodDayCount === 1 ? "" : "s"} for a spin.`,
      });
    }
  }, [spinning, result, kid, options.length, needsSpin, spinsLeft, isChild, waiting, goal, toast]);

  const handleSpinEnd = useCallback(() => {
    const spin = spinRef.current;
    setSpinning(false);
    if (!spin) return;
    setResult(spin);
    setAnnouncement(`The wheel landed on ${spin.consequence.text}`);
    if (spin.type === "good") setCelebrate(true);
    else playSuccessSound(0.4);
  }, []);

  const handleSpinStart = useCallback(async (): Promise<number | null> => {
    initAudioSystem();
    setSpinning(true);
    setAnnouncement("Spinning…");
    playSpinnerStartSound(0.3);
    try {
      const spin = await apiRequest<ServerSpin>("POST", "/api/spins", { type, childId: isChild ? undefined : childId });
      spinRef.current = spin;
      let index = options.findIndex((c) => c.id === spin.consequence.id);
      if (index === -1) index = options.findIndex((c) => c.section === spin.section);
      if (index === -1) {
        qc.invalidateQueries({ queryKey: ["/api/consequences"] });
        setTimeout(handleSpinEnd, 0);
        return null;
      }
      return index;
    } catch (e) {
      setSpinning(false);
      setAnnouncement("");
      toast({ title: "Can't spin right now", description: errorMessage(e), variant: "destructive" });
      refreshAll();
      return null;
    }
  }, [type, isChild, childId, options.map((o) => o.id).join(","), toast, handleSpinEnd]);

  useEffect(closeReveal, [type, childId]);

  const isGood = result?.type === "good";
  const busy = accept.isPending || request.isPending;
  const meta = TYPE_META[type];

  return (
    <div>
      <div aria-live="polite" className="sr-only">{announcement}</div>
      <PageHeader eyebrow={isChild ? "Your reward wheel" : "Spin"} title={isChild ? "Spin to win" : `${meta.long}`} />

      <div className="grid items-start gap-8 md:grid-cols-[1fr_minmax(0,380px)]">
        {/* Controls */}
        <div className="order-1 space-y-5 md:order-2">
          {!isChild && (
            <div className="grid grid-cols-3 gap-1 rounded-2xl bg-muted p-1" role="group" aria-label="Which wheel">
              {(["good", "bad", "fighting"] as ConsequenceType[]).map((t) => {
                const Icon = ICONS[t];
                return (
                  <button
                    key={t}
                    onClick={() => setType(t)}
                    disabled={spinning}
                    aria-pressed={type === t}
                    data-testid={`button-type-${t}`}
                    className={cn(
                      "flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-semibold transition-all",
                      type === t ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" /> {TYPE_META[t].label}
                  </button>
                );
              })}
            </div>
          )}

          {!isChild && (
            <div>
              <p className="eyebrow mb-2">Spin for</p>
              {kids.length === 0 ? (
                <p className="text-sm text-muted-foreground">Add a kid on the Home screen first.</p>
              ) : (
                <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Spin for">
                  {kids.map((k) => (
                    <button
                      key={k.id}
                      role="radio"
                      aria-checked={childId === k.id}
                      disabled={spinning}
                      onClick={() => setChildId(k.id)}
                      data-testid={`chip-child-${k.id}`}
                      className={cn(
                        "flex items-center gap-2 rounded-full border py-1 pl-1 pr-4 text-sm font-semibold transition-colors",
                        childId === k.id ? "border-primary bg-secondary text-secondary-foreground" : "bg-card hover:bg-muted",
                      )}
                    >
                      <KidAvatar name={k.name} avatar={k.avatar} className="h-8 w-8 text-sm ring-0" />
                      {k.name}
                      {k.earnedSpins > 0 && <span className="rounded-full bg-reward px-1.5 text-[11px] font-bold text-white">{k.earnedSpins}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {kid && (
            <div className={cn("rounded-3xl p-5", needsSpin ? "bg-reward-soft" : meta.soft)} data-testid="card-spin-status">
              {needsSpin ? (
                <div className="flex items-center gap-4">
                  <ProgressRing value={kid.goodDayCount} max={goal} size={64} stroke={6} label={`${kid.goodDayCount} of ${goal} good days`}>
                    <span className="text-lg font-extrabold tabular-nums">{kid.goodDayCount}</span>
                  </ProgressRing>
                  <div>
                    <p className="font-bold" data-testid={spinsLeft > 0 ? "text-spins-available" : "text-no-spins"}>
                      {spinsLeft > 0 ? (
                        <><Sparkles className="mr-1 inline h-4 w-4 text-amber-600" />{isChild ? "You have" : `${kid.name} has`} {spinsLeft} spin{spinsLeft > 1 ? "s" : ""}!</>
                      ) : waiting > 0 ? (
                        <><Hourglass className="mr-1 inline h-4 w-4" />Waiting for your parent</>
                      ) : (
                        <><Lock className="mr-1 inline h-4 w-4" />No spins yet</>
                      )}
                    </p>
                    <p className="text-sm text-muted-foreground" data-testid="text-good-days">
                      {kid.goodDayCount} of {goal} good days toward the next one
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-sm">
                  <span className="font-bold">{type === "bad" ? "Chore wheel" : "Fighting wheel"}.</span>{" "}
                  Parents can spin this any time. Nothing gets added until you choose to keep it.
                </p>
              )}
            </div>
          )}

          <div className="hidden md:block">
            <SpinButton canSpin={canSpin} spinning={spinning} label={!kid ? "Pick a kid" : needsSpin && spinsLeft <= 0 ? "No spins yet" : "Spin!"} onClick={() => wheelRef.current?.spin()} testId="button-spin" />
          </div>
        </div>

        {/* Wheel */}
        <div className="order-2 flex flex-col items-center md:order-1">
          <div className={cn("w-full transition-opacity", canSpin || spinning ? "" : "opacity-80 saturate-[.75]")}>
            <PrizeWheel
              ref={wheelRef}
              slices={slices}
              canSpin={canSpin}
              onBlocked={explainBlocked}
              onSpinStart={handleSpinStart}
              onSpinEnd={handleSpinEnd}
              onTick={playWheelTick}
              onWeakSwipe={() => toast({ title: "Give it a bigger swipe! 💨", description: "Grab the arrow and flick it around to spin." })}
              ariaLabel={`${meta.long} with ${options.length} choices: ${options.map((o) => o.text).join(", ")}`}
            />
          </div>
          <div className="mt-6 w-full max-w-xs md:hidden">
            <SpinButton canSpin={canSpin} spinning={spinning} label={!kid ? "Pick a kid" : needsSpin && spinsLeft <= 0 ? "No spins yet" : "Spin!"} onClick={() => wheelRef.current?.spin()} testId="button-spin-mobile" />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">or grab the arrow and swipe it around</p>
        </div>
      </div>

      <ConfettiCelebration active={celebrate} duration={4000} onComplete={() => setCelebrate(false)} />

      <Dialog open={!!result} onOpenChange={(o) => { if (!o && !busy) closeReveal(); }}>
        <DialogContent className="overflow-hidden p-0 sm:max-w-sm" data-testid="spin-result">
          <div className={cn("px-6 pb-6 pt-8 text-center", isGood ? "bg-gradient-to-b from-reward-soft to-card" : `bg-gradient-to-b from-muted to-card`)}>
            <div className={cn("mx-auto mb-4 flex h-16 w-16 animate-pop-in items-center justify-center rounded-3xl", isGood ? "bg-reward text-white" : "bg-card text-foreground shadow-sm")}>
              {isGood ? <Gift className="h-8 w-8" /> : type === "fighting" ? <Swords className="h-8 w-8" /> : <Brush className="h-8 w-8" />}
            </div>
            <DialogHeader className="space-y-1 text-center">
              <DialogTitle className="text-center text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                {isGood ? (isChild ? "You won" : `${kid?.name} won`) : type === "fighting" ? "Fighting consequence" : "Chore"}
              </DialogTitle>
              <DialogDescription className="sr-only">The result of this spin</DialogDescription>
            </DialogHeader>
            <p className="mt-1 text-3xl font-extrabold leading-tight" data-testid="text-spin-result">{result?.consequence.text}</p>
          </div>

          <div className="grid gap-3 px-6 pb-6">
            {isChild && asking && (
              <div className="grid gap-2">
                <Label htmlFor="spin-description">What did you do to earn it?</Label>
                <Textarea
                  id="spin-description" value={reason} onChange={(e) => setReason(e.target.value)}
                  placeholder="I helped with dinner every night…" className="min-h-[90px]" maxLength={500}
                  data-testid="textarea-spin-description" autoFocus
                />
              </div>
            )}
            {isChild ? (
              asking ? (
                <Button size="lg" onClick={() => request.mutate()} disabled={!reason.trim() || busy} data-testid="button-submit-spin-request">
                  {request.isPending ? "Sending…" : "Send to my parent"}
                </Button>
              ) : (
                <Button size="lg" onClick={() => setAsking(true)} data-testid="button-accept-consequence">Ask to keep it</Button>
              )
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" size="lg" onClick={closeReveal} disabled={busy} data-testid="button-reset">Skip</Button>
                <Button size="lg" onClick={() => accept.mutate()} disabled={busy} data-testid="button-accept-consequence">
                  {accept.isPending ? "Adding…" : "Keep it"}
                </Button>
              </div>
            )}
            <p className="text-center text-xs text-muted-foreground">
              {isChild ? "You can close this and send it later. Spinning again shows the same prize." : `Keep it adds it to ${kid?.name}'s to-dos.`}
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SpinButton({ canSpin, spinning, label, onClick, testId }: { canSpin: boolean; spinning: boolean; label: string; onClick: () => void; testId: string }) {
  return (
    <Button
      size="lg"
      onClick={onClick}
      disabled={spinning}
      aria-disabled={!canSpin}
      data-testid={testId}
      className={cn("h-16 w-full text-lg font-extrabold", !canSpin && !spinning && "bg-muted text-muted-foreground shadow-none hover:bg-muted")}
    >
      {spinning ? "Spinning…" : label}
    </Button>
  );
}
