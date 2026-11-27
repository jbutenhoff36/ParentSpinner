import { useState, useCallback, useEffect, useRef } from "react";
import { SpinningWheel } from "./ui/new-spinner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { RotateCcw, CheckIcon, Sparkles, AlertTriangle, Sword, User, Clock, Lock } from "lucide-react";
import { Consequence, PendingConsequence, ChildProfile, SpinRequest } from "@shared/schema";
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

const defaultWheelColors = [
  "#FF0080", "#00FFFF", "#FFD700", "#FF00FF", "#00FF00", "#FF4500", "#9400D3", "#FFFF00", "#FF1493",
  "#00CED1", "#FF6347", "#7FFF00", "#FF69B4", "#00BFFF", "#FFA500", "#FF00FF", "#32CD32", "#FFB6C1",
];

export default function SpinnerView({ initialChildId, initialType, onChildIdChange }: SpinnerViewProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isSpinning, setIsSpinning] = useState(false);
  const [currentResult, setCurrentResult] = useState<SpinResult | null>(null);
  const [activeType, setActiveType] = useState<ConsequenceType>(initialType || "good");
  const [selectedChildId, setSelectedChildId] = useState<string>(initialChildId?.toString() || "");
  const [isRequestDialogOpen, setIsRequestDialogOpen] = useState(false);
  const [spinRequestDescription, setSpinRequestDescription] = useState("");
  // The server's answer for the spin in progress / on screen
  const spinRef = useRef<ServerSpin | null>(null);
  const [currentSpinId, setCurrentSpinId] = useState<string | null>(null);

  const { data: currentUser } = useQuery<any>({ queryKey: ['/api/auth/me'] });
  const isChild = currentUser?.role === 'child';

  const { data: childProfile } = useQuery<ChildProfile>({
    queryKey: ['/api/auth/me/profile'],
    enabled: isChild,
  });

  const { data: children = [] } = useQuery<ChildProfile[]>({ queryKey: ['/api/children'] });

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

  // Children only spin the Good wheel.
  useEffect(() => {
    if (isChild && activeType !== "good") setActiveType("good");
  }, [isChild, activeType]);

  const { data: consequences = [] } = useQuery<Consequence[]>({ queryKey: ['/api/consequences'] });
  const { data: config = { wheelSettings: {} } } = useQuery<any>({ queryKey: ['/api/config'] });
  const { data: pendingConsequences = [] } = useQuery<PendingConsequence[]>({ queryKey: ['/api/pending'] });

  const { data: myRequests = [] } = useQuery<SpinRequest[]>({
    queryKey: ['/api/spinrequests/mine'],
    enabled: isChild,
    refetchInterval: 10000,
  });

  const filteredConsequences = consequences.filter((c) => c.type === activeType);

  const getPendingCount = (type: ConsequenceType) => {
    if (!selectedChildId) return 0;
    return pendingConsequences.filter(
      (p) => p.type === type && p.childId === parseInt(selectedChildId) && !p.completed,
    ).length;
  };

  const selectedChild: ChildProfile | undefined = isChild
    ? childProfile
    : children.find((c) => c.id === parseInt(selectedChildId || "0"));

  // Earned spins not already waiting on a parent's approval
  const waitingGoodRequests = isChild
    ? myRequests.filter((r) => r.status === "pending" && r.type === "good").length
    : 0;
  const getEarnedSpinsCount = () => Math.max(0, (selectedChild?.earnedSpins || 0) - waitingGoodRequests);
  const hasEarnedSpins = () => getEarnedSpinsCount() > 0;

  const needsEarnedSpin = activeType === "good";
  const canSpin =
    !!selectedChild &&
    filteredConsequences.length > 0 &&
    !isSpinning &&
    !currentResult &&
    (!needsEarnedSpin || hasEarnedSpins());

  // Wheel slices
  const wheelSections = (() => {
    const unique = Array.from(new Set(filteredConsequences.map((c) => c.section))).sort((a, b) => a - b);
    return unique.length > 0 ? unique : Array.from({ length: 8 }, (_, i) => i + 1);
  })();
  const colors: string[] = config?.wheelSettings?.wheelColors || defaultWheelColors;
  const wheelColors = wheelSections.map((_, i) => colors[i % colors.length]);

  const refreshAfterSpin = () => {
    queryClient.invalidateQueries({ queryKey: ['/api/pending'] });
    queryClient.invalidateQueries({ queryKey: ['/api/children'] });
    queryClient.invalidateQueries({ queryKey: ['/api/auth/me/profile'] });
    queryClient.invalidateQueries({ queryKey: ['/api/spinrequests/mine'] });
  };

  const resetSpinner = () => {
    setCurrentResult(null);
    setCurrentSpinId(null);
    spinRef.current = null;
  };

  // Child: send the result to a parent for approval
  const createSpinRequestMutation = useMutation({
    mutationFn: async ({ spinId, description }: { spinId: string; description: string }) =>
      apiRequest('POST', '/api/spinrequests', { spinId, description }),
    onSuccess: () => {
      refreshAfterSpin();
      setIsRequestDialogOpen(false);
      setSpinRequestDescription("");
      toast({
        title: "Spin request sent!",
        description: "Your parent will review and approve the spin result.",
        duration: 5000,
      });
      resetSpinner();
    },
    onError: (error) => {
      toast({ title: "Error", description: errorMessage(error, "Failed to send the spin request."), variant: "destructive" });
    },
  });

  // Parent: keep the result; it goes straight onto the child's earned list
  const acceptSpinMutation = useMutation({
    mutationFn: async (spinId: string) => apiRequest<PendingConsequence>('POST', `/api/spins/${spinId}/accept`),
    onSuccess: () => {
      refreshAfterSpin();
      toast({
        title: "Consequence accepted!",
        description: "The consequence has been added to the earned consequences.",
      });
      resetSpinner();
    },
    onError: (error) => {
      toast({ title: "Error", description: errorMessage(error, "Failed to add the consequence."), variant: "destructive" });
    },
  });

  const explainBlocked = useCallback(() => {
    if (isSpinning) return;
    if (currentResult) {
      toast({
        title: isChild ? "Send or reset first" : "Accept or reset first",
        description: isChild ? "Send this result to your parent, or tap Reset." : "Accept this result, or tap Reset to spin again.",
      });
    } else if (!selectedChild) {
      toast({ title: "Select a child first", description: "Choose a child above before spinning.", variant: "destructive" });
    } else if (filteredConsequences.length === 0) {
      toast({
        title: "No consequences available",
        description: `There are no "${activeType}" consequences defined yet.`,
        variant: "destructive",
      });
    } else if (needsEarnedSpin && !hasEarnedSpins()) {
      toast({
        title: "No spins available",
        description: isChild
          ? "You don't have any earned spins. Good days will earn you spin opportunities!"
          : "This child doesn't have any earned spins yet.",
        variant: "destructive",
      });
    }
  }, [isSpinning, currentResult, isChild, selectedChild, filteredConsequences.length, activeType, needsEarnedSpin, toast, getEarnedSpinsCount()]);

  // Wheel was flicked: ask the server for the result, then let the wheel land on it.
  const handleSpinStart = useCallback(async (): Promise<number | null> => {
    initAudioSystem();
    setCurrentResult(null);
    setIsSpinning(true);
    playSpinnerStartSound(0.4);
    try {
      const spin = await apiRequest<ServerSpin>('POST', '/api/spins', {
        type: activeType,
        childId: isChild ? undefined : parseInt(selectedChildId),
      });
      spinRef.current = spin;
      const index = wheelSections.indexOf(spin.section);
      if (index === -1) {
        // The wheel changed under us; refresh it and show the result anyway.
        queryClient.invalidateQueries({ queryKey: ['/api/consequences'] });
        setTimeout(() => handleSpinEnd(-1), 0);
        return null;
      }
      return index;
    } catch (error) {
      setIsSpinning(false);
      toast({ title: "Can't spin right now", description: errorMessage(error, "Please try again."), variant: "destructive" });
      refreshAfterSpin();
      return null;
    }
  }, [activeType, isChild, selectedChildId, wheelSections.join(","), toast]);

  const handleSpinEnd = useCallback((_sectionIndex: number) => {
    const spin = spinRef.current;
    setIsSpinning(false);
    if (!spin) return;
    const result = spin.consequence;
    setCurrentResult(result);
    setCurrentSpinId(spin.spinId);
    playSuccessSound(result.type === 'good' ? 0.7 : result.type === 'bad' ? 0.5 : 0.6);
    if (navigator.vibrate) {
      navigator.vibrate(result.type === 'good' ? [30, 20, 40] : 30);
    }
  }, []);

  useEffect(() => {
    resetSpinner();
  }, [activeType, selectedChildId]);

  const acceptResult = () => {
    if (!currentResult || !currentSpinId) return;
    if (isChild) {
      setSpinRequestDescription("");
      setIsRequestDialogOpen(true);
      return;
    }
    acceptSpinMutation.mutate(currentSpinId);
  };

  const submitSpinRequest = () => {
    if (!currentSpinId || !spinRequestDescription.trim()) {
      toast({
        title: "Description required",
        description: "Please tell your parent why you deserve this spin!",
        variant: "destructive",
      });
      return;
    }
    createSpinRequestMutation.mutate({ spinId: currentSpinId, description: spinRequestDescription.trim() });
  };

  const getBackgroundColorClass = (type: string | undefined) => {
    switch (type) {
      case 'good': return 'bg-blue-600 text-white';
      case 'bad': return 'bg-gray-700 text-white';
      case 'fighting': return 'bg-red-600 text-white';
      default: return 'bg-purple-600 text-white';
    }
  };

  const getTextColorClass = (type: string | undefined) => {
    switch (type) {
      case 'good': return 'text-blue-600 font-bold';
      case 'bad': return 'text-gray-700 font-bold';
      case 'fighting': return 'text-red-600 font-bold';
      default: return 'text-gray-700 font-bold';
    }
  };

  const showLock = needsEarnedSpin && !!selectedChild && !hasEarnedSpins() && !currentResult && !isSpinning;
  const busy = acceptSpinMutation.isPending || createSpinRequestMutation.isPending;

  return (
    <div className="p-4 flex flex-col items-center max-w-md mx-auto">
      {/* Type selector tabs */}
      <div className="w-full mb-6">
        <h3 className="text-center text-xs sm:text-sm font-medium mb-2 text-gray-600">Select Consequence Type:</h3>
        <div className="flex space-x-1 sm:space-x-2 w-full">
          <button
            onClick={() => setActiveType("good")}
            disabled={isSpinning}
            data-testid="button-type-good"
            className={`flex-1 py-2 px-1 sm:px-2 font-bold rounded-md shadow-md transition-all text-xs sm:text-sm ${
              activeType === 'good'
                ? 'bg-gradient-to-br from-blue-500 to-blue-600 text-white ring-2 ring-blue-300 ring-offset-1'
                : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
            }`}
          >
            <div className="flex flex-col items-center justify-center space-y-1">
              <div className="relative">
                <Sparkles className="w-5 h-5" />
              </div>
              <span>Good</span>
            </div>
          </button>
          {!isChild && (
            <>
              <button
                onClick={() => setActiveType("bad")}
                disabled={isSpinning}
                data-testid="button-type-bad"
                className={`flex-1 py-2 px-1 sm:px-2 font-bold rounded-md shadow-md transition-all text-xs sm:text-sm ${
                  activeType === 'bad'
                    ? 'bg-gradient-to-br from-gray-600 to-gray-700 text-white ring-2 ring-gray-300 ring-offset-1'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                <div className="flex flex-col items-center justify-center space-y-1">
                  <div className="relative">
                    <AlertTriangle className="w-5 h-5" />
                    {getPendingCount("bad") > 0 && (
                      <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                        {getPendingCount("bad")}
                      </span>
                    )}
                  </div>
                  <span>Bad</span>
                </div>
              </button>
              <button
                onClick={() => setActiveType("fighting")}
                disabled={isSpinning}
                data-testid="button-type-fighting"
                className={`flex-1 py-2 px-1 sm:px-2 font-bold rounded-md shadow-md transition-all text-xs sm:text-sm ${
                  activeType === 'fighting'
                    ? 'bg-gradient-to-br from-red-500 to-red-600 text-white ring-2 ring-red-300 ring-offset-1'
                    : 'bg-red-100 text-red-700 hover:bg-red-200'
                }`}
              >
                <div className="flex flex-col items-center justify-center space-y-1">
                  <div className="relative">
                    <Sword className="w-5 h-5" />
                    {getPendingCount("fighting") > 0 && (
                      <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                        {getPendingCount("fighting")}
                      </span>
                    )}
                  </div>
                  <span>Fighting</span>
                </div>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Child selector (parents only) */}
      {!isChild && (
        <div className="w-full mb-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center space-x-2">
              <User className="text-gray-500 h-5 w-5" />
              <span className="text-sm font-medium text-gray-700">Select Child:</span>
            </div>
            <Select
              value={selectedChildId}
              onValueChange={(value) => {
                setSelectedChildId(value);
                onChildIdChange?.(value);
              }}
              disabled={isSpinning}
            >
              <SelectTrigger className="w-[220px]" data-testid="select-child">
                <SelectValue placeholder="Select a child" />
              </SelectTrigger>
              <SelectContent>
                {children.length === 0 ? (
                  <div className="p-2 text-sm text-gray-500">No children added yet. Go to Children tab to add.</div>
                ) : (
                  children.map((child) => (
                    <SelectItem key={child.id} value={child.id.toString()}>
                      {child.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {/* Earned spins (Good wheel only; Bad and Fighting don't need one) */}
      {needsEarnedSpin && selectedChild && (
        <div className="w-full mb-4 flex justify-center">
          {getEarnedSpinsCount() > 0 ? (
            <div className="bg-gradient-to-r from-green-400 to-blue-500 text-white px-6 py-3 rounded-lg font-bold flex items-center space-x-2 shadow-lg animate-pulse" data-testid="text-spins-available">
              <Sparkles className="w-6 h-6" />
              <span className="text-lg">{getEarnedSpinsCount()} Spin{getEarnedSpinsCount() > 1 ? 's' : ''} Available!</span>
              <Sparkles className="w-6 h-6" />
            </div>
          ) : (
            <div className="bg-gray-200 text-gray-600 px-4 py-2 rounded-lg font-semibold flex items-center space-x-2" data-testid="text-no-spins">
              <Lock className="w-5 h-5" />
              <span>
                {waitingGoodRequests > 0 ? "Waiting for your parent to approve" : "No Spins Available - Keep earning good days!"}
              </span>
            </div>
          )}
        </div>
      )}

      <div className="relative mb-6 w-full flex justify-center">
        <div className="relative">
          <SpinningWheel
            sections={wheelSections.map((section, index) => ({
              section: section.toString(),
              color: wheelColors[index] || defaultWheelColors[index % defaultWheelColors.length],
            }))}
            canSpin={canSpin}
            onBlocked={explainBlocked}
            onSpinStart={handleSpinStart}
            onSpin={handleSpinEnd}
            className="w-80 h-80"
          />
          {showLock && (
            <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
              <div className="bg-black/70 text-white px-4 py-2 rounded-lg flex items-center space-x-2 shadow-lg">
                <Lock className="w-5 h-5" />
                <span className="font-semibold">No Spins Available</span>
              </div>
            </div>
          )}
        </div>
      </div>

      <Card className={`w-full p-4 sm:p-5 rounded-lg mb-6 min-h-[7rem] flex items-center justify-center shadow-lg border-2 ${
        currentResult
          ? currentResult.type === 'good' ? 'border-blue-300 bg-blue-50'
            : currentResult.type === 'bad' ? 'border-gray-300 bg-gray-50'
            : currentResult.type === 'fighting' ? 'border-red-300 bg-red-50'
            : 'border-purple-300 bg-purple-50'
          : 'border-gray-200 bg-gray-50'
      }`}>
        {currentResult ? (
          <div className="text-center" data-testid="spin-result">
            <div className={`inline-flex items-center px-3 py-1 ${getBackgroundColorClass(currentResult.type)} text-sm font-bold rounded-full mb-3 shadow-sm`}>
              <span className="mr-1">{currentResult.section}</span>
              <span className="mx-1">•</span>
              {currentResult.type === 'good' && <span className="flex items-center"><Sparkles className="w-3 h-3 mr-1" /> Good</span>}
              {currentResult.type === 'bad' && <span className="flex items-center"><AlertTriangle className="w-3 h-3 mr-1" /> Bad</span>}
              {currentResult.type === 'fighting' && <span className="flex items-center"><Sword className="w-3 h-3 mr-1" /> Fighting</span>}
            </div>
            <p className={`text-xl ${getTextColorClass(currentResult.type)}`} data-testid="text-spin-result">
              {currentResult.text}
            </p>
          </div>
        ) : (
          <div className="text-center">
            <div className={`flex items-center justify-center ${isSpinning ? 'animate-pulse' : ''}`}>
              <p className="text-center text-lg font-bold text-gray-600">
                {isSpinning ? "Spinning..."
                  : !selectedChild ? "Select a child first"
                  : needsEarnedSpin && !hasEarnedSpins() ? "No spins available"
                  : "Flick the pointer to spin"}
              </p>
            </div>
            {!isSpinning && (
              <p className="text-sm text-gray-400 mt-2">
                {!selectedChild ? "Choose a child above"
                  : needsEarnedSpin && !hasEarnedSpins() ? "Earn spins through good days"
                  : "Grab the black pointer and flick it"}
              </p>
            )}
          </div>
        )}
      </Card>

      <div className="flex space-x-2 sm:space-x-4 w-full justify-center mt-2">
        <Button
          variant="outline"
          onClick={resetSpinner}
          disabled={isSpinning || busy}
          data-testid="button-reset"
          className="px-4 sm:px-6 py-2 sm:py-3 bg-gray-200 rounded-lg font-bold text-gray-700 shadow hover:bg-gray-300 transition-colors flex-1 max-w-[120px] sm:max-w-[140px] text-sm sm:text-base"
        >
          <RotateCcw className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" /> Reset
        </Button>
        <Button
          onClick={acceptResult}
          disabled={!currentResult || !currentSpinId || isSpinning || busy}
          data-testid="button-accept-consequence"
          className={`px-4 sm:px-6 py-2 sm:py-3 ${isChild ? 'bg-blue-500 hover:bg-blue-600' : 'bg-green-500 hover:bg-green-600'} text-white rounded-lg font-bold shadow transition-colors flex-1 max-w-[120px] sm:max-w-[140px] text-sm sm:text-base`}
        >
          {busy ? (
            <span className="flex items-center justify-center">Processing...</span>
          ) : isChild ? (
            <><Clock className="mr-2 h-4 w-4" /> Request</>
          ) : (
            <><CheckIcon className="mr-2 h-4 w-4" /> Accept</>
          )}
        </Button>
      </div>

      {/* Spin request description dialog for children */}
      <Dialog open={isRequestDialogOpen} onOpenChange={setIsRequestDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Request This Spin</DialogTitle>
            <DialogDescription>
              Tell your parent why you want to submit this spin result. They will review and approve it.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {currentResult && (
              <div className={`p-3 rounded-lg ${
                currentResult.type === 'good' ? 'bg-blue-50 border-blue-200'
                  : currentResult.type === 'bad' ? 'bg-gray-50 border-gray-200'
                  : 'bg-red-50 border-red-200'
              } border`}>
                <p className="font-semibold text-center">{currentResult.text}</p>
                <p className="text-xs text-center text-gray-500 mt-1">
                  {currentResult.type?.charAt(0).toUpperCase()}{currentResult.type?.slice(1)} - Section {currentResult.section}
                </p>
              </div>
            )}
            <div className="grid gap-2">
              <Label htmlFor="spin-description">Why do you deserve this?</Label>
              <Textarea
                id="spin-description"
                placeholder="Tell your parent what you did to earn this spin..."
                value={spinRequestDescription}
                onChange={(e) => setSpinRequestDescription(e.target.value)}
                className="min-h-[100px]"
                maxLength={500}
                data-testid="textarea-spin-description"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRequestDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={submitSpinRequest}
              disabled={!spinRequestDescription.trim() || createSpinRequestMutation.isPending}
              data-testid="button-submit-spin-request"
            >
              {createSpinRequestMutation.isPending ? "Sending..." : "Send Request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
