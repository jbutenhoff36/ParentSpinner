import { useState } from "react";
import { Download, Share, SquarePlus, X, MoreVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BrandMark } from "@/components/brand-mark";
import { APP_NAME } from "@/lib/brand";
import { dismissInstall, installDismissed, useInstall } from "@/lib/install";

/** Step-by-step help for phones that can't show an install button (iPhone, Firefox, ...). */
export function InstallHelpDialog({ open, onOpenChange, ios }: { open: boolean; onOpenChange: (o: boolean) => void; ios: boolean }) {
  const steps = ios
    ? [
        { icon: Share, text: <>Tap the <b>Share</b> button in Safari (the square with an arrow, at the bottom or top).</> },
        { icon: SquarePlus, text: <>Scroll down and tap <b>Add to Home Screen</b>.</> },
        { icon: Download, text: <>Tap <b>Add</b>. {APP_NAME} now opens from its own icon, full screen.</> },
      ]
    : [
        { icon: MoreVertical, text: <>Open your browser menu (<b>⋮</b> or <b>…</b>).</> },
        { icon: SquarePlus, text: <>Tap <b>Install app</b> or <b>Add to Home screen</b>.</> },
        { icon: Download, text: <>Confirm. {APP_NAME} gets its own icon on your home screen.</> },
      ];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Add {APP_NAME} to your home screen</DialogTitle>
          <DialogDescription>
            {ios ? "On iPhone and iPad this works from Safari." : "It works like an app, and you can turn on notifications."}
          </DialogDescription>
        </DialogHeader>
        <ol className="grid gap-3" data-testid="install-steps">
          {steps.map((s, i) => (
            <li key={i} className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
                <s.icon className="h-[18px] w-[18px]" aria-hidden="true" />
              </span>
              <span className="pt-1.5 text-sm">{s.text}</span>
            </li>
          ))}
        </ol>
        <Button onClick={() => onOpenChange(false)}>Got it</Button>
      </DialogContent>
    </Dialog>
  );
}

/** Starts the install: the browser's own prompt where there is one, otherwise the help steps. */
export function useInstallAction() {
  const { mode, install } = useInstall();
  const [help, setHelp] = useState(false);
  const start = async () => {
    if (mode === "prompt") await install();
    else setHelp(true);
  };
  const dialog = <InstallHelpDialog open={help} onOpenChange={setHelp} ios={mode === "ios"} />;
  return { mode, start, dialog };
}

/** A friendly banner on Home until the app is installed or dismissed. */
export function InstallBanner() {
  const { mode, start, dialog } = useInstallAction();
  const [hidden, setHidden] = useState(installDismissed);
  // Desktop browsers without an install prompt: don't nag.
  const phoneish = window.matchMedia?.("(pointer: coarse)").matches;
  if (mode === "installed" || hidden || (mode === "manual" && !phoneish)) return null;
  return (
    <div className="surface relative mb-5 flex items-center gap-3 p-4 pr-11" data-testid="install-banner">
      <BrandMark className="h-10 w-10 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="font-bold leading-tight">Get the app</p>
        <p className="text-sm text-muted-foreground">
          {mode === "ios" ? "Add it to your Home Screen for full screen and notifications." : "Add it to your home screen. No app store needed."}
        </p>
      </div>
      <Button size="sm" onClick={start} data-testid="button-install">
        <Download /> {mode === "prompt" ? "Install" : "Add"}
      </Button>
      <button
        type="button" aria-label="Not now" onClick={() => { dismissInstall(); setHidden(true); }}
        className="absolute right-2 top-2 rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        data-testid="button-install-dismiss"
      >
        <X className="h-4 w-4" />
      </button>
      {dialog}
    </div>
  );
}
