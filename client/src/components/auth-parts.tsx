import { useEffect, useState } from "react";
import { Loader2, Users, Smile, Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { KidAvatar } from "@/components/kid-avatar";
import { BrandMark } from "@/components/brand-mark";
import { APP_NAME, APP_TAGLINE } from "@/lib/brand";
import { cn } from "@/lib/utils";

export type Role = "parent" | "child";

export function RolePicker({ role, onChange }: { role: Role; onChange: (r: Role) => void }) {
  const opts: { value: Role; title: string; sub: string; icon: typeof Users }[] = [
    { value: "parent", title: "I'm a parent", sub: "Or grandparent, guardian", icon: Users },
    { value: "child", title: "I'm a kid", sub: "Join with a code", icon: Smile },
  ];
  return (
    <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="Account type">
      {opts.map((o) => (
        <button
          key={o.value} type="button" role="radio" aria-checked={role === o.value} onClick={() => onChange(o.value)}
          data-testid={`role-${o.value}`}
          className={cn(
            "relative flex flex-col items-start gap-2 rounded-2xl border-2 p-4 text-left transition-colors",
            role === o.value ? "border-primary bg-secondary" : "border-border bg-card hover:bg-muted",
          )}
        >
          <o.icon className={cn("h-6 w-6", role === o.value ? "text-primary" : "text-muted-foreground")} aria-hidden="true" />
          <span>
            <span className="block font-bold">{o.title}</span>
            <span className="block text-xs text-muted-foreground">{o.sub}</span>
          </span>
          {role === o.value && <Check className="absolute right-3 top-3 h-4 w-4 text-primary" aria-hidden="true" />}
        </button>
      ))}
    </div>
  );
}

type Profile = { id: number; name: string; avatar: string | null };

/** Kid sign-up: enter the parent code, then pick which kid you are. */
export function KidJoinFields({ onChange }: { onChange: (v: { code: string; profileId: number | null }) => void }) {
  const [code, setCode] = useState("");
  const [profiles, setProfiles] = useState<Profile[] | null>(null);
  const [parentName, setParentName] = useState("");
  const [status, setStatus] = useState<"idle" | "checking" | "bad">("idle");
  const [picked, setPicked] = useState<number | null>(null);

  useEffect(() => {
    onChange({ code, profileId: picked });
  }, [code, picked]);

  useEffect(() => {
    const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, "");
    setPicked(null);
    if (clean.length < 6) {
      setProfiles(null);
      setStatus("idle");
      return;
    }
    let cancelled = false;
    setStatus("checking");
    fetch(`/api/auth/verify-parent-code?code=${encodeURIComponent(clean)}`)
      .then(async (r) => {
        if (cancelled) return;
        if (!r.ok) {
          setStatus("bad");
          setProfiles(null);
          return;
        }
        const d = await r.json();
        setStatus("idle");
        setParentName(d.parentUsername);
        setProfiles(d.unlinkedChildProfiles || []);
        if (d.unlinkedChildProfiles?.length === 1) setPicked(d.unlinkedChildProfiles[0].id);
      })
      .catch(() => !cancelled && setStatus("bad"));
    return () => {
      cancelled = true;
    };
  }, [code]);

  return (
    <div className="grid gap-4">
      <div className="grid gap-1.5">
        <Label htmlFor="parent-code">Parent code</Label>
        <Input
          id="parent-code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={8}
          placeholder="ABC123" autoCapitalize="characters" autoComplete="off" spellCheck={false}
          className="font-mono text-lg tracking-[0.3em] uppercase" data-testid="input-parent-code"
        />
        <p className={cn("text-xs", status === "bad" ? "text-destructive" : "text-muted-foreground")}>
          {status === "checking" ? <><Loader2 className="mr-1 inline h-3 w-3 animate-spin" />Checking…</>
            : status === "bad" ? "That code doesn't match a family. Check with your parent."
            : profiles ? `Found ${parentName}'s family` : "Your parent can find it on their Home screen."}
        </p>
      </div>
      {profiles && (
        <div className="grid gap-2">
          <Label>Which one are you?</Label>
          {profiles.length === 0 ? (
            <p className="rounded-xl bg-muted p-3 text-sm">Every kid in this family already has a login. Ask your parent to add you first.</p>
          ) : (
            <div className="flex flex-wrap gap-2" role="radiogroup">
              {profiles.map((p) => (
                <button
                  key={p.id} type="button" role="radio" aria-checked={picked === p.id} onClick={() => setPicked(p.id)}
                  data-testid={`profile-${p.id}`}
                  className={cn("flex items-center gap-2 rounded-full border-2 py-1 pl-1 pr-4 font-semibold", picked === p.id ? "border-primary bg-secondary" : "bg-card")}
                >
                  <KidAvatar name={p.name} avatar={p.avatar} className="h-9 w-9 text-sm ring-0" /> {p.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export type ParentJoin = { mode: "new" | "join"; code: string; valid: boolean };

/** Parent sign-up: start a new family, or join one with a family invite code. */
export function ParentJoinFields({ onChange }: { onChange: (v: ParentJoin) => void }) {
  const [mode, setMode] = useState<"new" | "join">("new");
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<"idle" | "checking" | "bad" | "ok">("idle");
  const [familyOf, setFamilyOf] = useState("");
  const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, "");

  useEffect(() => {
    onChange({ mode, code: clean, valid: mode === "new" || status === "ok" });
  }, [mode, clean, status]);

  useEffect(() => {
    if (mode !== "join" || clean.length < 8) {
      setStatus("idle");
      return;
    }
    let cancelled = false;
    setStatus("checking");
    fetch(`/api/auth/verify-guardian-code?code=${encodeURIComponent(clean)}`)
      .then(async (r) => {
        if (cancelled) return;
        const d = r.ok ? await r.json() : null;
        if (d?.valid) {
          setFamilyOf(d.familyOf);
          setStatus("ok");
        } else setStatus("bad");
      })
      .catch(() => !cancelled && setStatus("bad"));
    return () => {
      cancelled = true;
    };
  }, [clean, mode]);

  const tab = (m: "new" | "join", label: string) => (
    <button
      type="button" role="radio" aria-checked={mode === m} onClick={() => setMode(m)} data-testid={`parent-mode-${m}`}
      className={cn("flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition-colors", mode === m ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground")}
    >
      {label}
    </button>
  );

  return (
    <div className="grid gap-3">
      <div className="flex gap-1 rounded-xl bg-muted p-1" role="radiogroup" aria-label="Family">
        {tab("new", "Start a new family")}
        {tab("join", "Join a family")}
      </div>
      {mode === "join" && (
        <div className="grid gap-1.5">
          <Label htmlFor="guardian-code">Family invite code</Label>
          <Input
            id="guardian-code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={9}
            placeholder="ABCD-1234" autoCapitalize="characters" autoComplete="off" spellCheck={false}
            className="font-mono text-lg tracking-[0.2em] uppercase" data-testid="input-guardian-code"
          />
          <p className={cn("text-xs", status === "bad" ? "text-destructive" : status === "ok" ? "font-semibold text-primary" : "text-muted-foreground")} data-testid="text-guardian-status">
            {status === "checking" ? <><Loader2 className="mr-1 inline h-3 w-3 animate-spin" />Checking…</>
              : status === "bad" ? "That code doesn't match a family. Ask for a fresh one."
              : status === "ok" ? `Joining ${familyOf}'s family as a parent`
              : "Another parent can find it under Setup, Family."}
          </p>
        </div>
      )}
    </div>
  );
}

/** Two-column layout for the sign-in screens. */
export function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-[100dvh] lg:grid-cols-[1.1fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-gradient-to-br from-[#5B3DF0] via-[#8B5CF6] to-[#EC4899] p-12 text-white lg:flex lg:flex-col">
        <div className="flex items-center gap-3 text-xl font-extrabold"><BrandMark className="h-10 w-10" /> {APP_NAME}</div>
        <div className="my-auto max-w-md">
          <h1 className="text-5xl font-extrabold leading-[1.05] tracking-tight">Make good days worth celebrating.</h1>
          <p className="mt-5 text-lg text-white/85">Log good days, let kids spin for rewards, and keep chores fair with a spin of the wheel.</p>
          <ul className="mt-8 space-y-3 text-white/90">
            {["One tap to log a good day", "Kids spin when they've earned it", "You approve every prize"].map((t) => (
              <li key={t} className="flex items-center gap-3"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/20"><Check className="h-4 w-4" /></span>{t}</li>
            ))}
          </ul>
        </div>
        <BrandMark className="absolute -bottom-24 -right-24 h-96 w-96 opacity-20" />
      </aside>
      <main className="flex flex-col items-center justify-center px-5 py-10">
        <div className="mb-8 flex flex-col items-center text-center lg:hidden">
          <BrandMark className="h-16 w-16" />
          <p className="mt-3 text-2xl font-extrabold">{APP_NAME}</p>
          <p className="text-sm text-muted-foreground">{APP_TAGLINE}</p>
        </div>
        <div className="w-full max-w-sm">{children}</div>
      </main>
    </div>
  );
}
