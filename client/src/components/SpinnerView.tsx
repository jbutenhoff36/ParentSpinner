import { useState, useCallback, useEffect, useRef } from "react";
import { PrizeWheel, PrizeWheelHandle, WheelSlice } from "./ui/prize-wheel";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ConfettiCelebration } from "@/components/ui/confetti-celebration";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Sparkles, AlertTriangle, Sword, User, Lock, Hourglass } from "lucide-react";
import { Consequence, ChildProfile, SpinRequest } from "@shared/schema";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { playSuccessSound, initAudioSystem, playSpinnerStartSound } from "@/lib/sound-utils";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type ConsequenceType = "good" | "bad" | "fighting";
type SpinResult = { id: number | null; text: string; type: string; section: number };
type ServerSpin = { spinId: string; type: string; section: number; consequence: SpinResult };

interface SpinnerViewProps {
  initialChildId?: number;
  initialType?: ConsequenceType;
  onChildIdChange?: (childId: string) => void;
}

// Calm palettes: warm for rewards, cool for chores, soft rose/violet for fighting.
const PALETTES: Record<ConsequenceType, { colors: string[]; text: string }> = {
  good: { colors: ["#FCD581", "#F9B27C", "#F6A6A6", "#FFE3A3", "#F7C59F", "#F4B6C2", "#FBD38D", "#F9C784"], text: "#3F2A1D" },
  bad: { colors: ["#BFD7EA", "#A7C4D9", "#CFE3D4", "#B3CDE0", "#C9D6DF", "#A9CBB7"], text: "#1E2F3D" },
  fighting: { colors: ["#E9B8C3", "#D7B4DC", "#F0C5BC", "#CDB4DB", "#E7BFD0", "#D9B8C4"], text: "#3A1F2B" },
};

const TYPE_INFO: Record<ConsequenceType, { label: string; icon: typeof Sparkles; active: string; idle: string }> = {
  good: { label: "Good", icon: Sparkles, active: "bg-amber-500 text-white ring-2 ring-amber-300", idle: "bg-amber-50 text-amber-800 hover:bg-amber-100" },
  bad: { label: "Chores", icon: AlertTriangle, active: "bg-slate-600 text-white ring-2 ring-slate-300", idle: "bg-slate-100 text-slate-700 hover:bg-slate-200" },
  fighting: { label: "Fighting", icon: Sword, active: "bg-rose-500 text-white ring-2 ring-rose-300", idle: "bg-rose-50 text-rose-700 hover:bg-rose-100" },
};

// apiRequest errors look like `403: {"message":"..."}`; pull out the message.
function errorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  const match = error.message.match(/^\d+: (.*)$/s);
  if (match) {
    try {
      return JSON.parse(match[1]).message || fallback;
    } catch {
      return match[1] || fallback;
    }
  }
  return error.message || fallback;
}

export default function SpinnerView({ initialChildId, initialType, onChildIdChange }: SpinnerViewProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const wheelRef = useRef<PrizeWheelHandle>(null);
  const [isSpinning, setIsSpinning] = useState(false);
  const [result, setResult] = useState<SpinResult | null>(null);
  const [spinId, setSpinId] = useState<string | null>(null);
  const [showReveal, setShowReveal] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const [activeType, setActiveType] = useState<ConsequenceType>(initialType || "good");
  const [selectedChildId, setSelectedChildId] = useState<string>(initialChildId?.toString() || "");
  const [askingReason, setAskingReason] = useState(false);
  const [reason, setReason] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const spinRef = useRef<ServerSpin | null>(null);

  const { data: currentUser } = useQuery<any>({ queryKey: ['/api/auth/me'] });
  const isChild = currentUser?.role === 'child';

  const { data: childProfile } = useQuery<ChildProfile>({ queryKey: ['/api/auth/me/profile'], enabled: isChild });
  const { data: children = [] } = useQuery<ChildProfile[]>({ queryKey: ['/api/children'] });
  const { data: consequences = [] } = useQuery<Consequence[]>({ queryKey: ['/api/consequences'] });
  const { data: config } = useQuery<any>({ queryKey: ['/api/config'] });
  const goodDaysRequired: number = config?.goodDaysRequired || 7;
  const { data: myRequests = [] } = useQuery<SpinRequest[]>({
    queryKey: ['/api/spinrequests/mine'],
    enabled: isChild,
    refetchInterval: 15000,
  });

  useEffect(() => {
    if (childProfile?.id) {
      const idStr = childProfile.id.toString();
      setSelectedChildId(idStr);
      onChildIdChange?.(idStr);
    }
  }, [childProfile, onChildIdChange]);

  useEffect(() => {
    if (initialChildId) setSelectedChildId(initialChildId.toString());
    if (initialType && ["good", "bad", "fighting"].includes(initialType)) setActiveType(initialType);
  }, [initialChildId, initialType]);

  // With one child, pick them automatically
  useEffect(() => {
    if (!isChild && !selectedChildId && children.length === 1) {
      const idStr = children[0].id.toString();
      setSelectedChildId(idStr);
      onChildIdChange?.(idStr);
    }
  }, [isChild, selectedChildId, children, onChildIdChange]);

  // Children only spin the Good wheel
  useEffect(() => {
    if (isChild && activeType !== "good") setActiveType("good");
  }, [isChild, activeType]);

  const options = consequences
    .filter((c) => c.type === activeType)
    .sort((a, b) => a.section - b.section);

  const palette = PALETTES[activeType];
  const slices: WheelSlice[] = (options.length > 0 ? options.map((c) => c.text) : ["Add items in Setup"]).map((label, i, arr) => ({
    label,
    // Avoid two neighbours sharing a colour where the wheel wraps around
    color: palette.colors[(i === arr.length - 1 && arr.length % palette.colors.length === 1 ? i + 1 : i) % palette.colors.length],
    textColor: palette.text,
  }));

  const selectedChild: ChildProfile | undefined = isChild
    ? childProfile
    : children.find((c) => c.id === parseInt(selectedChildId || "0"));

  const waitingGoodRequests = isChild ? myRequests.filter((r) => r.status === "pending" && r.type === "good").length : 0;
  const spinsLeft = Math.max(0, (selectedChild?.earnedSpins || 0) - waitingGoodRequests);
  const needsEarnedSpin = activeType === "good";
  const canSpin = !!selectedChild && options.length > 0 && !isSpinning && !showReveal && (!needsEarnedSpin || spinsLeft > 0);

  const refreshAll = () => {
    queryClient.invalidateQueries({ queryKey: ['/api/pending'] });
    queryClient.invalidateQueries({ queryKey: ['/api/children'] });
    queryClient.invalidateQueries({ queryKey: ['/api/auth/me/profile'] });
    queryClient.invalidateQueries({ queryKey: ['/api/spinrequests/mine'] });
    queryClient.invalidateQueries({ queryKey: ['pendingSpinRequests'] });
  };

  const closeReveal = () => {
    setShowReveal(false);
    setAskingReason(false);
    setReason("");
    setCelebrate(false);
    setResult(null);
    setSpinId(null);
    spinRef.current = null;
  };

  const requestMutation = useMutation({
    mutationFn: async () => apiRequest('POST', '/api/spinrequests', { spinId, description: reason.trim() }),
    onSuccess: () => {
      refreshAll();
      toast({ title: "Sent to your parent!", description: "They'll approve it soon." });
      closeReveal();
    },
    onError: (error) => toast({ title: "Couldn't send it", description: errorMessage(error, "Please try again."), variant: "destructive" }),
  });

  const acceptMutation = useMutation({
    mutationFn: async () => apiRequest('POST', `/api/spins/${spinId}/accept`),
    onSuccess: () => {
      refreshAll();
      toast({ title: "Added", description: `Added to ${selectedChild?.name}'s list.` });
      closeReveal();
    },
    onError: (error) => toast({ title: "Couldn't add it", description: errorMessage(error, "Please try again."), variant: "destructive" }),
  });

  const explainBlocked = useCallback(() => {
    if (isSpinning || showReveal) return;
    if (!selectedChild) {
      toast({ title: "Pick a child first", description: "Choose who this spin is for." });
    } else if (options.length === 0) {
      toast({ title: "This wheel is empty", description: "Add items to it in Setup." });
    } else if (needsEarnedSpin && spinsLeft <= 0) {
      toast({
        title: "No spins yet",
        description: isChild
          ? waitingGoodRequests > 0 ? "Your last spin is waiting for your parent." : "Good days earn you spins. Keep going!"
          : `${selectedChild.name} hasn't earned a spin yet.`,
      });
    }
  }, [isSpinning, showReveal, selectedChild, options.length, needsEarnedSpin, spinsLeft, isChild, waitingGoodRequests, toast]);

  const handleSpinStart = useCallback(async (): Promise<number | null> => {
    initAudioSystem();
    setIsSpinning(true);
    setAnnouncement("Spinning…");
    playSpinnerStartSound(0.3);
    try {
      const spin = await apiRequest<ServerSpin>('POST', '/api/spins', {
        type: activeType,
        childId: isChild ? undefined : parseInt(selectedChildId),
      });
      spinRef.current = spin;
      let index = options.findIndex((c) => c.id === spin.consequence.id);
      if (index === -1) index = options.findIndex((c) => c.section === spin.section);
      if (index === -1) {
        // The wheel changed under us: show the result without the animation.
        queryClient.invalidateQueries({ queryKey: ['/api/consequences'] });
        setTimeout(() => handleSpinEnd(), 0);
        return null;
      }
      return index;
    } catch (error) {
      setIsSpinning(false);
      setAnnouncement("");
      toast({ title: "Can't spin right now", description: errorMessage(error, "Please try again."), variant: "destructive" });
      refreshAll();
      return null;
    }
  }, [activeType, isChild, selectedChildId, options.map((o) => o.id).join(","), toast]);

  const handleSpinEnd = useCallback(() => {
    const spin = spinRef.current;
    setIsSpinning(false);
    if (!spin) return;
    setResult(spin.consequence);
    setSpinId(spin.spinId);
    setShowReveal(true);
    setAnnouncement(`The wheel landed on ${spin.consequence.text}`);
    if (spin.type === "good") {
      setCelebrate(true);
    } else {
      playSuccessSound(0.4);
    }
  }, []);

  useEffect(() => {
    closeReveal();
  }, [activeType, selectedChildId]);

  const progress = selectedChild ? Math.min(100, (selectedChild.goodDayCount / goodDaysRequired) * 100) : 0;
  const isGood = result?.type === "good";
  const busy = acceptMutation.isPending || requestMutation.isPending;

  return (
    <div className="p-4 flex flex-col items-center w-full max-w-md md:max-w-lg mx-auto">
      <div aria-live="polite" className="sr-only">{announcement}</div>

      {/* Kid: my progress */}
      {isChild && selectedChild && (
        <Card className="w-full p-4 mb-4 border-amber-200 bg-amber-50" data-testid="card-my-progress">
          <div className="flex items-center justify-between mb-2">
            <span className="font-bold text-amber-900">Next spin</span>
            <span className="text-sm text-amber-800" data-testid="text-good-days">
              {selectedChild.goodDayCount} of {goodDaysRequired} good days
            </span>
          </div>
          <Progress value={progress} className="h-3 bg-amber-100" aria-label={`${selectedChild.goodDayCount} of ${goodDaysRequired} good days`} />
          <p className="mt-3 text-sm text-amber-900" data-testid={spinsLeft > 0 ? "text-spins-available" : "text-no-spins"}>
            {spinsLeft > 0
              ? <><Sparkles className="inline w-4 h-4 mr-1" />You have <strong>{spinsLeft}</strong> spin{spinsLeft > 1 ? "s" : ""} to use!</>
              : waitingGoodRequests > 0
                ? <><Hourglass className="inline w-4 h-4 mr-1" />Waiting for your parent to approve your last spin.</>
                : "No spins right now. Every good day gets you closer."}
          </p>
        </Card>
      )}

      {/* Parent: type + child */}
      {!isChild && (
        <>
          <div className="w-full mb-4" role="group" aria-label="Which wheel">
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(TYPE_INFO) as ConsequenceType[]).map((type) => {
                const info = TYPE_INFO[type];
                const Icon = info.icon;
                return (
                  <button
                    key={type}
                    onClick={() => setActiveType(type)}
                    disabled={isSpinning}
                    aria-pressed={activeType === type}
                    data-testid={`button-type-${type}`}
                    className={`py-2 rounded-lg font-bold text-sm transition-colors flex flex-col items-center gap-1 ${activeType === type ? info.active : info.idle}`}
                  >
                    <Icon className="w-5 h-5" aria-hidden="true" />
                    {info.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="w-full mb-4 flex items-center justify-between gap-3">
            <Label htmlFor="spin-child" className="flex items-center gap-2 text-sm font-medium text-gray-700">
              <User className="h-4 w-4" aria-hidden="true" /> Spin for
            </Label>
            <Select
              value={selectedChildId}
              onValueChange={(value) => {
                setSelectedChildId(value);
                onChildIdChange?.(value);
              }}
              disabled={isSpinning}
            >
              <SelectTrigger id="spin-child" className="w-[200px]" data-testid="select-child">
                <SelectValue placeholder="Select a child" />
              </SelectTrigger>
              <SelectContent>
                {children.length === 0 ? (
                  <div className="p-2 text-sm text-gray-500">No children yet. Add one in the Family tab.</div>
                ) : (
                  children.map((child) => (
                    <SelectItem key={child.id} value={child.id.toString()}>{child.name}</SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          {needsEarnedSpin && selectedChild && (
            <p className="w-full mb-3 text-sm text-center text-gray-600" data-testid={spinsLeft > 0 ? "text-spins-available" : "text-no-spins"}>
              {spinsLeft > 0
                ? <>{selectedChild.name} has <strong>{spinsLeft}</strong> spin{spinsLeft > 1 ? "s" : ""} to use</>
                : <><Lock className="inline w-4 h-4 mr-1" aria-hidden="true" />{selectedChild.name} hasn't earned a spin yet ({selectedChild.goodDayCount} of {goodDaysRequired} good days)</>}
            </p>
          )}
          {!needsEarnedSpin && (
            <p className="w-full mb-3 text-sm text-center text-gray-500">No earned spin needed for this wheel.</p>
          )}
        </>
      )}

      <div className={`relative w-full mb-5 transition-opacity ${canSpin || isSpinning ? "" : "opacity-60"}`}>
        <PrizeWheel
          ref={wheelRef}
          slices={slices}
          canSpin={canSpin}
          onBlocked={explainBlocked}
          onSpinStart={handleSpinStart}
          onSpinEnd={handleSpinEnd}
          ariaLabel={`${TYPE_INFO[activeType].label} wheel with ${options.length} choices: ${options.map((o) => o.text).join(", ")}`}
        />
      </div>

      <Button
        size="lg"
        onClick={() => wheelRef.current?.spin()}
        disabled={isSpinning}
        aria-disabled={!canSpin}
        data-testid="button-spin"
        className={`w-full max-w-xs h-14 text-lg font-extrabold rounded-full shadow-md ${
          canSpin ? "bg-indigo-600 hover:bg-indigo-700 text-white" : "bg-gray-300 text-gray-600 hover:bg-gray-300"
        }`}
      >
        {isSpinning ? "Spinning…" : canSpin ? "SPIN" : !selectedChild ? "Pick a child" : needsEarnedSpin && spinsLeft <= 0 ? "No spins yet" : "SPIN"}
      </Button>
      <p className="mt-2 text-xs text-gray-400">or tap / swipe the wheel</p>

      <ConfettiCelebration active={celebrate} duration={4000} onComplete={() => setCelebrate(false)} />

      {/* Reveal */}
      <Dialog open={showReveal} onOpenChange={(open) => { if (!open && !busy) closeReveal(); }}>
        <DialogContent
          className={`sm:max-w-[420px] text-center ${isGood ? "border-amber-300 bg-gradient-to-b from-amber-50 to-white" : "border-slate-200 bg-slate-50"}`}
          data-testid="spin-result"
        >
          <DialogHeader>
            <DialogTitle className="text-center text-base font-semibold text-gray-600">
              {isGood ? (isChild ? "You won!" : `${selectedChild?.name} won!`) : activeType === "fighting" ? "Fighting consequence" : "Chore"}
            </DialogTitle>
            <DialogDescription className="sr-only">The result of this spin</DialogDescription>
          </DialogHeader>
          <p className={`text-3xl font-extrabold my-2 ${isGood ? "text-amber-700" : "text-slate-800"}`} data-testid="text-spin-result">
            {result?.text}
          </p>

          {isChild && askingReason ? (
            <div className="text-left grid gap-2 mt-2">
              <Label htmlFor="spin-description">Why do you deserve this?</Label>
              <Textarea
                id="spin-description"
                placeholder="Tell your parent what you did to earn this spin..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="min-h-[90px] bg-white"
                maxLength={500}
                data-testid="textarea-spin-description"
                autoFocus
              />
            </div>
          ) : null}

          <DialogFooter className="sm:justify-center gap-2 mt-2">
            {isChild ? (
              askingReason ? (
                <Button
                  onClick={() => requestMutation.mutate()}
                  disabled={!reason.trim() || busy}
                  className="bg-indigo-600 hover:bg-indigo-700"
                  data-testid="button-submit-spin-request"
                >
                  {requestMutation.isPending ? "Sending…" : "Send to my parent"}
                </Button>
              ) : (
                <Button onClick={() => setAskingReason(true)} className="bg-indigo-600 hover:bg-indigo-700" data-testid="button-accept-consequence">
                  Ask to keep it
                </Button>
              )
            ) : (
              <>
                <Button variant="outline" onClick={closeReveal} disabled={busy} data-testid="button-reset">
                  Don't keep
                </Button>
                <Button onClick={() => acceptMutation.mutate()} disabled={busy} className="bg-green-600 hover:bg-green-700" data-testid="button-accept-consequence">
                  {acceptMutation.isPending ? "Adding…" : `Add to ${selectedChild?.name}'s list`}
                </Button>
              </>
            )}
          </DialogFooter>
          {isChild && (
            <p className="text-xs text-gray-500">You can close this and send it later. Spinning again shows the same prize.</p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
