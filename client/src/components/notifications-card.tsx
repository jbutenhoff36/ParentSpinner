import { installDismissed } from "@/lib/install";
import { useEffect, useState } from "react";
import { Bell, BellOff, Share, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { errorMessage } from "@/lib/api";
import { disablePush, enablePush, getPushState, type PushState } from "@/lib/push";

function usePushState() {
  const [state, setState] = useState<PushState | null>(null);
  useEffect(() => {
    getPushState().then(setState).catch(() => setState("unsupported"));
  }, []);
  return [state, setState] as const;
}

const DISMISS_KEY = "kidspin.pushPromptDismissed";

/** A friendly nudge on Home to turn on phone notifications. Hides once on or dismissed. */
export function NotificationsPrompt({ role }: { role: "parent" | "child" }) {
  const [state, setState] = usePushState();
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      return false;
    }
  });
  const { toast } = useToast();
  if (dismissed || !state || state === "on" || state === "unsupported" || state === "blocked") return null;
  // On iPhone the install banner already covers this step (notifications need the Home Screen app).
  if (state === "needs-install" && !installDismissed()) return null;
  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* private mode */
    }
  };

  return (
    <section className="surface relative mb-6 flex items-start gap-4 p-5 animate-rise" data-testid="card-push-prompt">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-secondary text-secondary-foreground">
        <Bell className="h-5 w-5" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1 pr-6">
        <h2 className="font-bold">Get a heads-up on your phone</h2>
        {state === "needs-install" ? (
          <p className="mt-1 text-sm text-muted-foreground">
            On iPhone, first add KidSpin to your Home Screen: tap <Share className="inline h-4 w-4 align-text-bottom" aria-label="Share" /> then
            "Add to Home Screen". Open it from there and turn notifications on.
          </p>
        ) : (
          <>
            <p className="mt-1 text-sm text-muted-foreground">
              {role === "parent" ? "Know right away when a kid wins a prize and needs your OK." : "Find out when you earn a spin or your prize gets approved."}
            </p>
            <Button
              className="mt-3" size="sm" disabled={busy} data-testid="button-enable-push"
              onClick={async () => {
                setBusy(true);
                try {
                  const s = await enablePush();
                  setState(s);
                  toast(s === "on" ? { title: "Notifications on 🔔" } : { title: "Notifications are off", description: "You can turn them on later in your browser settings." });
                } catch (e) {
                  toast({ title: "Couldn't turn on notifications", description: errorMessage(e), variant: "destructive" });
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Bell /> Turn on notifications
            </Button>
          </>
        )}
      </div>
      <button className="absolute right-3 top-3 rounded-full p-1.5 text-muted-foreground hover:bg-muted" onClick={dismiss} aria-label="Not now">
        <X className="h-4 w-4" />
      </button>
    </section>
  );
}

/** The on/off control for this device, used in Setup. */
export function NotificationsSetting() {
  const [state, setState] = usePushState();
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();
  const run = async (fn: () => Promise<PushState>) => {
    setBusy(true);
    try {
      setState(await fn());
    } catch (e) {
      toast({ title: "That didn't work", description: errorMessage(e), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };
  const text: Record<PushState, string> = {
    on: "On for this device",
    off: "Off for this device",
    blocked: "Blocked in this browser's settings. Allow notifications for this site, then come back.",
    "needs-install": "On iPhone, add KidSpin to your Home Screen first (Share, then Add to Home Screen), then open it from there.",
    unsupported: "This browser can't show notifications.",
  };
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border p-4" data-testid="setting-push">
      {state === "on" ? <Bell className="h-5 w-5 text-primary" /> : <BellOff className="h-5 w-5 text-muted-foreground" />}
      <div className="min-w-0 flex-1">
        <p className="font-semibold">Phone notifications</p>
        <p className="text-sm text-muted-foreground" data-testid="text-push-state">{state ? text[state] : "Checking…"}</p>
      </div>
      {state === "on" && (
        <>
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => apiRequest("POST", "/api/push/test").then(() => toast({ title: "Test sent" }))}>
            Send a test
          </Button>
          <Button variant="outline" size="sm" disabled={busy} onClick={() => run(disablePush)}>Turn off</Button>
        </>
      )}
      {state === "off" && <Button size="sm" disabled={busy} onClick={() => run(enablePush)} data-testid="button-enable-push-setting">Turn on</Button>}
    </div>
  );
}
