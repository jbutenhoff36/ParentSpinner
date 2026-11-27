import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Camera, X } from "lucide-react";
import { KidAvatar } from "@/components/kid-avatar";
import { shrinkPhoto } from "@/lib/avatar";
import type { ChildProfile } from "@shared/schema";

export function KidFormDialog({
  open, onOpenChange, kid, onSave, saving,
}: {
  open: boolean; onOpenChange: (o: boolean) => void; kid?: ChildProfile | null;
  onSave: (data: { name: string; avatar: string | null }) => void; saving?: boolean;
}) {
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState<string | null>(null);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setName(kid?.name ?? "");
      setAvatar(kid?.avatar ?? null);
      setError("");
    }
  }, [open, kid]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{kid ? `Edit ${kid.name}` : "Add a kid"}</DialogTitle>
          <DialogDescription>{kid ? "Change their name or photo." : "They'll get their own wheel progress. They can make a login later with your parent code."}</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) onSave({ name: name.trim(), avatar });
          }}
        >
          <div className="flex items-center gap-4">
            <div className="relative">
              <KidAvatar name={name || "?"} avatar={avatar} className="h-20 w-20 text-2xl" />
              {avatar && (
                <button type="button" onClick={() => setAvatar(null)} className="absolute -right-1 -top-1 rounded-full bg-foreground p-1 text-background" aria-label="Remove photo">
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
            <div>
              <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                <Camera /> {avatar ? "Change photo" : "Add photo"}
              </Button>
              <p className="mt-1.5 text-xs text-muted-foreground">Optional</p>
              {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
            </div>
            <input
              ref={fileRef} type="file" accept="image/*" className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                try {
                  setError("");
                  setAvatar(await shrinkPhoto(f));
                } catch (err) {
                  setError((err as Error).message);
                }
              }}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="kid-name">Name</Label>
            <Input id="kid-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Max" maxLength={50} autoFocus data-testid="input-child-name" />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={!name.trim() || saving} data-testid="button-save-child">
              {saving ? "Saving…" : kid ? "Save" : "Add kid"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function StatsDialog({
  open, onOpenChange, kid, goal, onSave, saving,
}: {
  open: boolean; onOpenChange: (o: boolean) => void; kid: ChildProfile | null; goal: number;
  onSave: (data: { goodDayCount: number; earnedSpins: number }) => void; saving?: boolean;
}) {
  const [days, setDays] = useState(0);
  const [spins, setSpins] = useState(0);
  useEffect(() => {
    if (open && kid) {
      setDays(kid.goodDayCount);
      setSpins(kid.earnedSpins);
    }
  }, [open, kid]);
  const extra = Math.floor(days / goal);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Adjust {kid?.name}'s counts</DialogTitle>
          <DialogDescription>For fixing mistakes. Every {goal} good days turns into a spin.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Stepper label="Good days toward next spin" value={days} onChange={setDays} testId="input-edit-good-days" />
          <Stepper label="Spins ready to use" value={spins} onChange={setSpins} testId="input-edit-earned-spins" />
          {extra > 0 && (
            <p className="rounded-xl bg-reward-soft px-3 py-2 text-sm">
              That's {extra} full set{extra > 1 ? "s" : ""} of good days, so {kid?.name} will get {extra} more spin{extra > 1 ? "s" : ""}.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => onSave({ goodDayCount: days, earnedSpins: spins })} disabled={saving} data-testid="button-save-stats">
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Stepper({ label, value, onChange, testId }: { label: string; value: number; onChange: (n: number) => void; testId: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border p-3">
      <span className="text-sm font-medium">{label}</span>
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" size="icon-sm" onClick={() => onChange(Math.max(0, value - 1))} aria-label={`Less ${label}`}>−</Button>
        <input
          type="number" min={0} max={1000} value={value} data-testid={testId} aria-label={label}
          onChange={(e) => onChange(Math.max(0, Math.min(1000, parseInt(e.target.value) || 0)))}
          className="w-12 bg-transparent text-center text-lg font-bold tabular-nums outline-none"
        />
        <Button type="button" variant="outline" size="icon-sm" onClick={() => onChange(value + 1)} aria-label={`More ${label}`}>+</Button>
      </div>
    </div>
  );
}

export function PasswordDialog({
  open, onOpenChange, kid, onSave, saving,
}: { open: boolean; onOpenChange: (o: boolean) => void; kid: ChildProfile | null; onSave: (pw: string) => void; saving?: boolean }) {
  const [pw, setPw] = useState("");
  useEffect(() => {
    if (open) setPw("");
  }, [open]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>New password for {kid?.name}</DialogTitle>
          <DialogDescription>For when they forget it. Tell them the new one.</DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); if (pw.length >= 4) onSave(pw); }}>
          <Input type="text" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="At least 4 characters" autoFocus data-testid="input-child-password" />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={pw.length < 4 || saving} data-testid="button-save-child-password">{saving ? "Saving…" : "Set password"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ConfirmDialog({
  open, onOpenChange, title, description, confirmLabel, onConfirm, destructive,
}: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; description: string;
  confirmLabel: string; onConfirm: () => void; destructive?: boolean;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="sm:max-w-sm">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="rounded-full">Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            data-testid="button-confirm"
            className={destructive ? "rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90" : "rounded-full"}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
