import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { childProfileService } from "@/lib/child-profile-service";
import { authService } from "@/lib/auth-service";
import { eventEmitter, EVENTS } from "@/lib/events";
import { ConfettiCelebration } from "@/components/ui/confetti-celebration";
import { ChildProfile } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Plus, Edit, Trash, Sparkles, X, CheckCircle, Upload, User, RotateCcw, Settings2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";

type GoodDayResult = Awaited<ReturnType<typeof childProfileService.recordGoodDay>> & { isSpinAvailable?: boolean };

function playEarnedSpinMelody() {
  if ((window as any).celebrationSoundPlaying) return;
  (window as any).celebrationSoundPlaying = true;
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    [523, 659, 784, 1047, 784, 659].forEach((freq, index) => {
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      oscillator.frequency.value = freq;
      oscillator.type = 'sine';
      const startTime = audioContext.currentTime + index * 0.15;
      gainNode.gain.setValueAtTime(0.2, startTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + 0.25);
      oscillator.start(startTime);
      oscillator.stop(startTime + 0.25);
    });
  } catch {
    // ignore audio errors
  }
  setTimeout(() => {
    (window as any).celebrationSoundPlaying = false;
  }, 2000);
}

// apiRequest errors look like "409: {"message":"..."}"; pull out the message.
function errorMessage(error: unknown, fallback: string) {
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

export default function ChildrenView() {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isGoodDayDialogOpen, setIsGoodDayDialogOpen] = useState(false);
  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);
  const [isStatsDialogOpen, setIsStatsDialogOpen] = useState(false);
  const [isResetSpinsDialogOpen, setIsResetSpinsDialogOpen] = useState(false);
  const [selectedChildId, setSelectedChildId] = useState<number | null>(null);
  const [newChildName, setNewChildName] = useState("");
  const [newChildAvatar, setNewChildAvatar] = useState("");
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [editGoodDayCount, setEditGoodDayCount] = useState(0);
  const [editEarnedSpins, setEditEarnedSpins] = useState(0);
  const [editCreatedAt, setEditCreatedAt] = useState("");
  const [editLastBadSpinDate, setEditLastBadSpinDate] = useState("");
  const [editLastGoodSpinDate, setEditLastGoodSpinDate] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editFileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: config } = useQuery<any>({ queryKey: ['/api/config'] });
  const goodDaysRequired: number = config?.goodDaysRequired || 7;

  const { data: children = [], isLoading } = useQuery({
    queryKey: ['/api/children'],
    queryFn: () => childProfileService.getAllChildProfiles(),
  });

  const { data: currentUser } = useQuery<any>({
    queryKey: ['currentUser'],
    queryFn: () => authService.getCurrentUser(),
  });

  const getEarnedSpinsCount = (childId: number) => children.find(c => c.id === childId)?.earnedSpins || 0;

  const [childGoodDays, setChildGoodDays] = useState<Record<number, Date | null>>({});

  useEffect(() => {
    if (!children || children.length === 0) return;
    Promise.all(
      children.map(child =>
        childProfileService.getGoodDayLogs(child.id)
          .then(logs => {
            const latest = [...logs].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
            return { childId: child.id, lastGoodDay: latest ? new Date(latest.date) : null };
          })
          .catch(() => ({ childId: child.id, lastGoodDay: null }))
      )
    ).then(results => {
      const record: Record<number, Date | null> = {};
      results.forEach(r => { record[r.childId] = r.lastGoodDay; });
      setChildGoodDays(record);
    });
  }, [children]);

  const refreshChildren = () => {
    queryClient.invalidateQueries({ queryKey: ['/api/children'] });
    queryClient.invalidateQueries({ queryKey: ['/api/pending'] });
  };

  const addChildMutation = useMutation({
    mutationFn: (data: { name: string; avatar?: string }) => childProfileService.createChildProfile(data),
    onSuccess: () => {
      refreshChildren();
      setIsAddDialogOpen(false);
      setNewChildName("");
      setNewChildAvatar("");
      toast({ title: "Child profile created", description: "The child profile has been added successfully." });
    },
    onError: (error) => {
      toast({ title: "Error creating profile", description: errorMessage(error, "Please try again."), variant: "destructive" });
    },
  });

  const updateChildMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: { name?: string; avatar?: string } }) =>
      childProfileService.updateChildProfile(id, data),
    onSuccess: () => {
      refreshChildren();
      setIsEditDialogOpen(false);
      toast({ title: "Child profile updated", description: "The child profile has been updated successfully." });
    },
    onError: (error) => {
      toast({ title: "Error updating profile", description: errorMessage(error, "Please try again."), variant: "destructive" });
    },
  });

  const deleteChildMutation = useMutation({
    mutationFn: (id: number) => childProfileService.deleteChildProfile(id),
    onSuccess: () => {
      refreshChildren();
      toast({ title: "Child profile deleted", description: "The child profile has been removed successfully." });
    },
    onError: (error) => {
      toast({ title: "Error deleting profile", description: errorMessage(error, "There was a problem deleting the child profile."), variant: "destructive" });
    }
  });

  const resetSpinsMutation = useMutation({
    mutationFn: (childId: number) => childProfileService.resetEarnedSpins(childId),
    onSuccess: () => {
      refreshChildren();
      setIsResetSpinsDialogOpen(false);
      toast({ title: "Earned spins reset", description: "All earned spins have been reset to 0." });
    },
    onError: (error) => {
      toast({ title: "Error resetting spins", description: errorMessage(error, "There was a problem resetting the earned spins."), variant: "destructive" });
    }
  });

  const updateStatsMutation = useMutation({
    mutationFn: ({ childId, data }: { childId: number; data: { goodDayCount?: number; earnedSpins?: number; createdAt?: string; lastBadSpinDate?: string; lastGoodSpinDate?: string } }) =>
      childProfileService.updateStatistics(childId, data),
    onSuccess: () => {
      refreshChildren();
      setIsStatsDialogOpen(false);
      toast({ title: "Statistics updated", description: "Child statistics have been updated successfully." });
    },
    onError: (error) => {
      toast({ title: "Error updating statistics", description: errorMessage(error, "There was a problem updating the statistics."), variant: "destructive" });
    }
  });

  const openStatsDialog = (child: ChildProfile) => {
    setSelectedChildId(child.id);
    setEditGoodDayCount(child.goodDayCount || 0);
    setEditEarnedSpins(child.earnedSpins || 0);
    setEditCreatedAt(new Date(child.createdAt).toISOString().split('T')[0]);
    setEditLastBadSpinDate(child.lastBadSpinDate ? new Date(child.lastBadSpinDate).toISOString().split('T')[0] : "");
    setEditLastGoodSpinDate(child.lastGoodSpinDate ? new Date(child.lastGoodSpinDate).toISOString().split('T')[0] : "");
    setIsStatsDialogOpen(true);
  };

  const goToSpinnerAction = (childId?: number) => (
    <ToastAction altText="Go to Spinner" onClick={() => eventEmitter.emit(EVENTS.SWITCH_TO_SPINNER, { childId, type: 'good' })}>
      Go to Spinner
    </ToastAction>
  );

  const recordGoodDayMutation = useMutation({
    mutationFn: (childId: number) => childProfileService.recordGoodDay(childId) as Promise<GoodDayResult>,
    onSuccess: (data) => {
      refreshChildren();
      setIsGoodDayDialogOpen(false);
      setChildGoodDays(prev => ({ ...prev, [data.child.id]: new Date(data.log.date) }));

      const hasEarnedSpin = !!data.isSpinAvailable;
      if (hasEarnedSpin) {
        setShowConfetti(true);
        playEarnedSpinMelody();
      }
      toast({
        title: hasEarnedSpin ? "🎉 Good Spin Earned!" : "Good day recorded!",
        description: hasEarnedSpin
          ? `Amazing! ${data.child.name} has earned a spin! Good days reset to 0.`
          : `Great job! Their good day count is now ${data.child.goodDayCount}/${goodDaysRequired}.`,
        action: hasEarnedSpin ? goToSpinnerAction(data.child.id) : undefined,
      });
    },
    onError: (error) => {
      toast({ title: "Good day not recorded", description: errorMessage(error, "Please try again."), variant: "destructive" });
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "File too large", description: "Avatar image must be less than 5MB", variant: "destructive" });
      return;
    }
    if (!file.type.startsWith('image/')) {
      toast({ title: "Invalid file type", description: "Please select an image file", variant: "destructive" });
      return;
    }
    // Shrink the photo to a 256px square so it saves quickly and stays small.
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const size = 256;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const side = Math.min(img.width, img.height);
        ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        setAvatarPreview(dataUrl);
        setNewChildAvatar(dataUrl);
      }
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      toast({ title: "Couldn't read that picture", description: "Please try a different image", variant: "destructive" });
    };
    img.src = url;
  };

  const clearImageSelection = () => {
    setAvatarPreview(null);
    setNewChildAvatar("");
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (editFileInputRef.current) editFileInputRef.current.value = "";
  };

  const handleAddChild = () => {
    if (!newChildName.trim()) {
      toast({ title: "Name required", description: "Please enter a name for the child profile.", variant: "destructive" });
      return;
    }
    if (!currentUser) {
      toast({ title: "Error creating profile", description: "You must be logged in to create a child profile.", variant: "destructive" });
      return;
    }
    // The server attaches the profile to the logged-in parent.
    addChildMutation.mutate({ name: newChildName, avatar: newChildAvatar || undefined });
    setAvatarPreview(null);
  };

  const handleUpdateChild = () => {
    if (!selectedChildId) return;
    const selectedChild = children.find(child => child.id === selectedChildId);
    if (!selectedChild) return;
    updateChildMutation.mutate({
      id: selectedChildId,
      data: { name: newChildName || selectedChild.name, avatar: newChildAvatar || undefined },
    });
    setAvatarPreview(null);
  };

  const openEditDialog = (child: ChildProfile) => {
    setSelectedChildId(child.id);
    setNewChildName(child.name);
    setNewChildAvatar(child.avatar || "");
    setAvatarPreview(child.avatar || null);
    setIsEditDialogOpen(true);
  };

  const [selectedGoodDayChildren, setSelectedGoodDayChildren] = useState<number[]>([]);

  const toggleChildSelection = (childId: number) => {
    setSelectedGoodDayChildren(prev => prev.includes(childId) ? prev.filter(id => id !== childId) : [...prev, childId]);
  };

  const handleMultipleGoodDayRecord = async () => {
    if (selectedGoodDayChildren.length === 0) {
      toast({ title: "No children selected", description: "Please select at least one child to record a good day.", variant: "destructive" });
      return;
    }

    const results = await Promise.allSettled(
      selectedGoodDayChildren.map(childId => childProfileService.recordGoodDay(childId) as Promise<GoodDayResult>)
    );
    refreshChildren();
    setIsGoodDayDialogOpen(false);

    const succeeded = results.filter((r): r is PromiseFulfilledResult<GoodDayResult> => r.status === 'fulfilled').map(r => r.value);
    const failed = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');

    setChildGoodDays(prev => {
      const next = { ...prev };
      succeeded.forEach(result => { next[result.child.id] = new Date(result.log.date); });
      return next;
    });

    const childrenWithSpin = succeeded.filter(result => result.isSpinAvailable);
    if (childrenWithSpin.length > 0) {
      setShowConfetti(true);
      playEarnedSpinMelody();
      toast({
        title: "🎉 Good Spin Earned!",
        description: `${childrenWithSpin.length === 1 ? childrenWithSpin[0].child.name + ' has' : childrenWithSpin.length + ' children have'} earned a good spin!`,
        action: goToSpinnerAction(childrenWithSpin.length === 1 ? childrenWithSpin[0].child.id : undefined),
      });
    } else if (succeeded.length > 0) {
      toast({
        title: "Good days recorded!",
        description: `Recorded good days for ${succeeded.length} ${succeeded.length === 1 ? 'child' : 'children'}.${failed.length ? ` ${failed.length} already had one today.` : ''}`,
      });
    } else {
      toast({
        title: "Nothing recorded",
        description: errorMessage(failed[0]?.reason, "There was a problem recording the good days."),
        variant: "destructive",
      });
    }
    setSelectedGoodDayChildren([]);
  };

  const renderAvatarImage = (avatar?: string | null) => {
    if (!avatar) {
      return (
        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-gray-200 text-gray-500">
          <User className="w-6 h-6" />
        </div>
      );
    }
    return <img src={avatar} alt="Child Avatar" className="w-12 h-12 rounded-full object-cover" />;
  };

  const avatarPicker = (inputRef: React.RefObject<HTMLInputElement>, inputId: string) => (
    <div className="flex flex-col items-center gap-4">
      <Label className="text-lg font-semibold">Child's Avatar</Label>
      {avatarPreview ? (
        <div className="mb-3 flex flex-col items-center space-y-2">
          <div className="relative h-24 w-24 overflow-hidden rounded-full border bg-gray-50">
            <img src={avatarPreview} alt="Avatar preview" className="h-full w-full object-cover" />
            <Button type="button" variant="destructive" size="icon" className="absolute right-0 top-0 h-6 w-6 rounded-full" onClick={clearImageSelection}>
              <X className="h-3 w-3" />
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-center w-24 h-24 rounded-full bg-gray-200 text-gray-400">
          <User className="w-12 h-12" />
        </div>
      )}
      <div className="w-full max-w-xs">
        <Input ref={inputRef} id={inputId} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
        <Button type="button" variant="outline" className="w-full" onClick={() => inputRef.current?.click()}>
          <Upload className="mr-2 h-4 w-4" /> Choose Image File
        </Button>
        <p className="mt-1 text-center text-xs text-gray-500">PNG, JPG or GIF (max. 5MB)</p>
      </div>
    </div>
  );

  return (
    <div className="p-4">
      <ConfettiCelebration active={showConfetti} duration={5000} onComplete={() => setShowConfetti(false)} />
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Child Profiles</h2>
          <p className="text-gray-500 text-sm">Manage your children's profiles</p>
        </div>
        <div className="flex gap-2">
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="default" size="sm" data-testid="button-add-child">
                <Plus className="h-4 w-4 mr-1" /> Add Child
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add a New Child</DialogTitle>
                <DialogDescription>Enter the details to create a new child profile.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="name" className="text-right">Name</Label>
                  <Input id="name" value={newChildName} onChange={(e) => setNewChildName(e.target.value)} className="col-span-3" placeholder="Child's name" />
                </div>
                {avatarPicker(fileInputRef, "avatar-upload")}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleAddChild} disabled={addChildMutation.isPending} data-testid="button-save-child">
                  {addChildMutation.isPending ? "Adding..." : "Add Child"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={isGoodDayDialogOpen} onOpenChange={(open) => { setIsGoodDayDialogOpen(open); if (open) setSelectedGoodDayChildren([]); }}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="bg-green-50 border-green-200 text-green-700 hover:bg-green-100">
                <Sparkles className="h-4 w-4 mr-1" /> Record Good Day
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Record a Good Day</DialogTitle>
                <DialogDescription>Select which children had a good day today.</DialogDescription>
              </DialogHeader>
              <div className="py-4 space-y-4">
                {children.map((child) => (
                  <div
                    key={child.id}
                    className={`flex items-center justify-between p-3 border rounded-lg cursor-pointer transition-colors ${
                      selectedGoodDayChildren.includes(child.id) ? 'bg-green-50 border-green-200' : 'hover:bg-gray-50'
                    }`}
                    onClick={() => toggleChildSelection(child.id)}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
                        checked={selectedGoodDayChildren.includes(child.id)}
                        onChange={() => toggleChildSelection(child.id)}
                        onClick={(e) => e.stopPropagation()}
                      />
                      {renderAvatarImage(child.avatar)}
                      <div>
                        <p className="font-medium">{child.name}</p>
                        <p className="text-sm text-gray-500">Current streak: {child.goodDayCount} days</p>
                        <div className="w-32">
                          <Progress value={Math.min(100, (child.goodDayCount / goodDaysRequired) * 100)} className="h-1.5" />
                          <div className="text-xs mt-0.5">{child.goodDayCount}/{goodDaysRequired}</div>
                        </div>
                      </div>
                    </div>
                    <div className="text-sm text-gray-500">
                      {childGoodDays[child.id] ? `Last: ${childGoodDays[child.id]?.toLocaleDateString()}` : 'No good days yet'}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex justify-between items-center pt-4 border-t">
                <div className="text-sm text-gray-500">{selectedGoodDayChildren.length} children selected</div>
                <div className="flex space-x-2">
                  <Button variant="outline" onClick={() => setIsGoodDayDialogOpen(false)}>Cancel</Button>
                  <Button onClick={handleMultipleGoodDayRecord} disabled={selectedGoodDayChildren.length === 0} className="bg-green-600 hover:bg-green-700 text-white">
                    <Sparkles className="h-4 w-4 mr-1" />
                    Record Good Days
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-8">Loading child profiles...</div>
      ) : children.length === 0 ? (
        <div className="text-center py-8 bg-gray-50 rounded-lg border border-dashed border-gray-300">
          <p className="text-gray-500">No child profiles yet.</p>
          <p className="text-gray-400 text-sm mt-1">Add a child profile to start tracking consequences and good days.</p>
          <Button variant="outline" className="mt-4" onClick={() => setIsAddDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Add Your First Child
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {children.map((child) => (
            <Card key={child.id} className="overflow-hidden">
              <CardHeader className="pb-2">
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-3">
                    {renderAvatarImage(child.avatar)}
                    <div>
                      <CardTitle>{child.name}</CardTitle>
                      <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                        <span>Good days:</span>
                        <Badge variant="outline" className="bg-green-50 text-green-700">{child.goodDayCount}</Badge>
                        {getEarnedSpinsCount(child.id) > 0 && (
                          <>
                            <span className="text-gray-400">•</span>
                            <Badge variant="default" className="bg-blue-500 text-white">
                              {getEarnedSpinsCount(child.id)} Earned Spin{getEarnedSpinsCount(child.id) > 1 ? 's' : ''}
                            </Badge>
                          </>
                        )}
                      </div>
                      <div className="mt-2 w-full">
                        <div className="flex justify-between mb-1 text-xs">
                          <span>Progress to good spin</span>
                          <span>{child.goodDayCount}/{goodDaysRequired}</span>
                        </div>
                        <Progress value={Math.min(100, (child.goodDayCount / goodDaysRequired) * 100)} className="h-2" />
                        {getEarnedSpinsCount(child.id) > 0 && (
                          <div className="text-xs text-green-600 mt-1 flex items-center">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Ready for a good spin!
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditDialog(child)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-red-500"
                      onClick={() => {
                        setSelectedChildId(child.id);
                        setIsConfirmDeleteOpen(true);
                      }}
                    >
                      <Trash className="h-4 w-4" />
                    </Button>
                    <Dialog open={isConfirmDeleteOpen && selectedChildId === child.id} onOpenChange={setIsConfirmDeleteOpen}>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Delete Child Profile</DialogTitle>
                          <DialogDescription>
                            Are you sure you want to delete {child.name}'s profile? This action cannot be undone.
                          </DialogDescription>
                        </DialogHeader>
                        <DialogFooter>
                          <DialogClose asChild>
                            <Button variant="outline">Cancel</Button>
                          </DialogClose>
                          <Button
                            variant="destructive"
                            onClick={() => {
                              if (selectedChildId) {
                                deleteChildMutation.mutate(selectedChildId);
                                setIsConfirmDeleteOpen(false);
                              }
                            }}
                          >
                            Delete
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </div>
                </div>
              </CardHeader>
              <Separator />
              <CardContent className="pt-4">
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <p className="text-sm text-gray-500">Last good day</p>
                    <p className="font-medium">{childGoodDays[child.id] ? childGoodDays[child.id]?.toLocaleDateString() : "None yet"}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Last bad spin</p>
                    <p className="font-medium">{child.lastBadSpinDate ? new Date(child.lastBadSpinDate).toLocaleDateString() : "Never"}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Profile created</p>
                    <p className="font-medium">{new Date(child.createdAt).toLocaleDateString()}</p>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="bg-gray-50 flex-col gap-2">
                <div className="flex w-full justify-between">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-green-700"
                    onClick={() => recordGoodDayMutation.mutate(child.id)}
                    disabled={recordGoodDayMutation.isPending}
                    data-testid={`button-good-day-${child.id}`}
                  >
                    <Sparkles className="h-4 w-4 mr-1" /> Good Day
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-red-200 text-red-700 hover:bg-red-50"
                    onClick={() => childProfileService.recordBadSpin(child.id).then(() => {
                      refreshChildren();
                      toast({ title: "Streak reset", description: "Good day count has been reset to 0.", variant: "destructive" });
                    })}
                    data-testid={`button-reset-streak-${child.id}`}
                  >
                    <X className="h-4 w-4 mr-1" /> Reset Streak
                  </Button>
                </div>
                <div className="flex w-full justify-between">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-blue-600 border-blue-200 hover:bg-blue-50"
                    onClick={() => openStatsDialog(child)}
                    data-testid={`button-edit-stats-${child.id}`}
                  >
                    <Settings2 className="h-4 w-4 mr-1" /> Edit Stats
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-orange-600 border-orange-200 hover:bg-orange-50"
                    onClick={() => {
                      setSelectedChildId(child.id);
                      setIsResetSpinsDialogOpen(true);
                    }}
                    data-testid={`button-reset-spins-${child.id}`}
                  >
                    <RotateCcw className="h-4 w-4 mr-1" /> Reset Spins
                  </Button>
                </div>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Child Profile</DialogTitle>
            <DialogDescription>Update the details for this child profile.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-name" className="text-right">Name</Label>
              <Input id="edit-name" value={newChildName} onChange={(e) => setNewChildName(e.target.value)} className="col-span-3" />
            </div>
            {avatarPicker(editFileInputRef, "edit-avatar-upload")}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleUpdateChild} disabled={updateChildMutation.isPending}>
              {updateChildMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isStatsDialogOpen} onOpenChange={setIsStatsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Child Statistics</DialogTitle>
            <DialogDescription>Manually adjust good day count, earned spins, and dates.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-good-days" className="text-right">Good Days</Label>
              <Input id="edit-good-days" type="number" min="0" value={editGoodDayCount} onChange={(e) => setEditGoodDayCount(parseInt(e.target.value) || 0)} className="col-span-3" data-testid="input-edit-good-days" />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-earned-spins" className="text-right">Earned Spins</Label>
              <Input id="edit-earned-spins" type="number" min="0" value={editEarnedSpins} onChange={(e) => setEditEarnedSpins(parseInt(e.target.value) || 0)} className="col-span-3" data-testid="input-edit-earned-spins" />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-start-date" className="text-right">Start Date</Label>
              <Input id="edit-start-date" type="date" value={editCreatedAt} onChange={(e) => setEditCreatedAt(e.target.value)} className="col-span-3" data-testid="input-edit-start-date" />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-last-good-spin" className="text-right text-green-600">Last Good Spin</Label>
              <Input id="edit-last-good-spin" type="date" value={editLastGoodSpinDate} onChange={(e) => setEditLastGoodSpinDate(e.target.value)} className="col-span-3" data-testid="input-edit-last-good-spin" />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-last-bad-spin" className="text-right text-red-600">Last Bad Spin</Label>
              <Input id="edit-last-bad-spin" type="date" value={editLastBadSpinDate} onChange={(e) => setEditLastBadSpinDate(e.target.value)} className="col-span-3" data-testid="input-edit-last-bad-spin" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsStatsDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={() => {
                if (selectedChildId) {
                  updateStatsMutation.mutate({
                    childId: selectedChildId,
                    data: {
                      goodDayCount: editGoodDayCount,
                      earnedSpins: editEarnedSpins,
                      createdAt: editCreatedAt,
                      lastBadSpinDate: editLastBadSpinDate || undefined,
                      lastGoodSpinDate: editLastGoodSpinDate || undefined,
                    },
                  });
                }
              }}
              disabled={updateStatsMutation.isPending}
              data-testid="button-save-stats"
            >
              {updateStatsMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isResetSpinsDialogOpen} onOpenChange={setIsResetSpinsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Earned Spins</DialogTitle>
            <DialogDescription>
              Are you sure you want to reset all earned spins to 0 for this child? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsResetSpinsDialogOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => { if (selectedChildId) resetSpinsMutation.mutate(selectedChildId); }}
              disabled={resetSpinsMutation.isPending}
              data-testid="button-confirm-reset-spins"
            >
              {resetSpinsMutation.isPending ? "Resetting..." : "Reset Spins"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
