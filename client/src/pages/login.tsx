import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthLayout, KidJoinFields, RolePicker, type Role } from "@/components/auth-parts";
import { GoogleG } from "@/pages/setup";
import { apiRequest } from "@/lib/queryClient";
import { errorMessage, type Me } from "@/lib/api";
import { cn } from "@/lib/utils";

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const [mode, setMode] = useState<"signin" | "signup">(() => (new URLSearchParams(window.location.search).get("mode") === "signup" ? "signup" : "signin"));
  const [error, setError] = useState(() => new URLSearchParams(window.location.search).get("error") || "");
  const [role, setRole] = useState<Role>("parent");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [join, setJoin] = useState<{ code: string; profileId: number | null }>({ code: "", profileId: null });
  const { data: providers } = useQuery<{ google: boolean }>({ queryKey: ["/api/auth/providers"] });

  useEffect(() => {
    if (window.location.search) window.history.replaceState(null, "", "/login");
  }, []);

  const done = (user: Me) => {
    qc.clear();
    qc.setQueryData(["/api/auth/me"], user);
    setLocation("/");
  };

  const signIn = useMutation({
    mutationFn: () => apiRequest<Me>("POST", "/api/auth/login", { username, password }),
    onSuccess: done,
    onError: (e) => setError(errorMessage(e)),
  });
  const signUp = useMutation({
    mutationFn: () =>
      apiRequest<Me>("POST", "/api/auth/register", {
        username, password, role, email: role === "parent" ? email : undefined,
        parentCode: role === "child" ? join.code : undefined,
        childProfileId: role === "child" ? join.profileId : undefined,
      }),
    onSuccess: done,
    onError: (e) => setError(errorMessage(e)),
  });

  const busy = signIn.isPending || signUp.isPending;
  const canSignUp = username.trim().length >= 3 && password.length >= 6 && (role === "parent" || !!join.profileId);

  return (
    <AuthLayout>
      <h1 className="text-3xl font-extrabold">{mode === "signin" ? "Welcome back" : "Create your account"}</h1>
      <p className="mt-1 text-muted-foreground">{mode === "signin" ? "Sign in to see today's progress." : "Takes less than a minute."}</p>

      <div className="mt-6 grid grid-cols-2 gap-1 rounded-2xl bg-muted p-1">
        {(["signin", "signup"] as const).map((m) => (
          <button
            key={m} type="button" onClick={() => { setMode(m); setError(""); }} aria-pressed={mode === m}
            data-testid={`tab-${m}`}
            className={cn("rounded-xl py-2 text-sm font-semibold", mode === m ? "bg-card shadow-sm" : "text-muted-foreground")}
          >
            {m === "signin" ? "Sign in" : "Sign up"}
          </button>
        ))}
      </div>

      {error && (
        <p role="alert" className="mt-4 flex items-start gap-2 rounded-xl bg-destructive/10 p-3 text-sm text-destructive" data-testid="text-auth-error">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
        </p>
      )}

      {providers?.google && (
        <>
          <Button asChild variant="outline" size="lg" className="mt-5 h-12 w-full text-[15px]" data-testid="button-google">
            <a href="/api/auth/google"><GoogleG /> Continue with Google</a>
          </Button>
          <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" /> or with a username <span className="h-px flex-1 bg-border" />
          </div>
        </>
      )}

      {mode === "signin" ? (
        <form className={cn("grid gap-4", !providers?.google && "mt-6")} onSubmit={(e) => { e.preventDefault(); setError(""); signIn.mutate(); }}>
          <div className="grid gap-1.5">
            <Label htmlFor="login-username">Username</Label>
            <Input id="login-username" name="username" autoComplete="username" autoCapitalize="none" value={username} onChange={(e) => setUsername(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="login-password">Password</Label>
            <Input id="login-password" name="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <Button type="submit" size="lg" className="mt-1 h-12" disabled={busy || !username || !password} data-testid="button-login">
            {signIn.isPending ? <Loader2 className="animate-spin" /> : "Sign in"}
          </Button>
          <p className="text-center text-xs text-muted-foreground">Kid forgot their password? A parent can set a new one from their Home screen.</p>
        </form>
      ) : (
        <form className={cn("grid gap-4", !providers?.google && "mt-6")} onSubmit={(e) => { e.preventDefault(); setError(""); if (canSignUp) signUp.mutate(); }}>
          <RolePicker role={role} onChange={setRole} />
          {role === "child" && <KidJoinFields onChange={setJoin} />}
          <div className="grid gap-1.5">
            <Label htmlFor="register-username">Username</Label>
            <Input id="register-username" autoComplete="username" autoCapitalize="none" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="At least 3 characters" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="register-password">Password</Label>
            <Input id="register-password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 6 characters" />
          </div>
          {role === "parent" && (
            <div className="grid gap-1.5">
              <Label htmlFor="register-email">Email <span className="font-normal text-muted-foreground">(optional)</span></Label>
              <Input id="register-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          )}
          <Button type="submit" size="lg" className="mt-1 h-12" disabled={busy || !canSignUp} data-testid="button-register">
            {signUp.isPending ? <Loader2 className="animate-spin" /> : role === "parent" ? "Create family account" : "Join my family"}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
