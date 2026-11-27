import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthLayout, KidJoinFields, ParentJoinFields, RolePicker, type ParentJoin, type Role } from "@/components/auth-parts";
import { apiRequest } from "@/lib/queryClient";
import { errorMessage, type Me } from "@/lib/api";

type Pending = { name: string | null; email: string | null; suggestedUsername: string };

/** Finishing sign-up after "Continue with Google": parent or kid? */
export default function WelcomePage() {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const [role, setRole] = useState<Role>("parent");
  const [username, setUsername] = useState<string | null>(null);
  const [join, setJoin] = useState<{ code: string; profileId: number | null }>({ code: "", profileId: null });
  const [pjoin, setPjoin] = useState<ParentJoin>({ mode: "new", code: "", valid: true });
  const [error, setError] = useState("");
  const { data, isLoading, isError } = useQuery<Pending>({
    queryKey: ["/api/auth/google/pending"],
    queryFn: () => apiRequest("GET", "/api/auth/google/pending"),
  });

  const finish = useMutation({
    mutationFn: () => apiRequest<Me>("POST", "/api/auth/google/complete", {
      role, username: username ?? data?.suggestedUsername,
      parentCode: role === "child" ? join.code : undefined,
      childProfileId: role === "child" ? join.profileId : undefined,
      guardianCode: role === "parent" && pjoin.mode === "join" ? pjoin.code : undefined,
    }),
    onSuccess: (user) => {
      qc.clear();
      qc.setQueryData(["/api/auth/me"], user);
    qc.invalidateQueries({ queryKey: ["/api/auth/me"] });
      setLocation("/");
    },
    onError: (e) => setError(errorMessage(e)),
  });

  if (isLoading) return <AuthLayout><Loader2 className="mx-auto animate-spin" /></AuthLayout>;
  if (isError || !data) {
    return (
      <AuthLayout>
        <h1 className="text-2xl font-extrabold">That sign-in expired</h1>
        <p className="mt-1 text-muted-foreground">Please start again.</p>
        <Button className="mt-6 w-full" size="lg" onClick={() => setLocation("/login")}>Back to sign in</Button>
      </AuthLayout>
    );
  }

  const name = username ?? data.suggestedUsername;
  const ok = name.trim().length >= 3 && (role === "parent" ? pjoin.valid : !!join.profileId);

  return (
    <AuthLayout>
      <h1 className="text-3xl font-extrabold">Welcome{data.name ? `, ${data.name.split(" ")[0]}` : ""}!</h1>
      <p className="mt-1 text-muted-foreground">One last step{data.email ? ` for ${data.email}` : ""}.</p>
      {error && (
        <p role="alert" className="mt-4 flex items-start gap-2 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
        </p>
      )}
      <form className="mt-6 grid gap-4" onSubmit={(e) => { e.preventDefault(); setError(""); if (ok) finish.mutate(); }}>
        <RolePicker role={role} onChange={setRole} />
        {role === "child" && <KidJoinFields onChange={setJoin} />}
          {role === "parent" && <ParentJoinFields onChange={setPjoin} />}
        <div className="grid gap-1.5">
          <Label htmlFor="welcome-username">Pick a username</Label>
          <Input id="welcome-username" value={name} onChange={(e) => setUsername(e.target.value)} autoCapitalize="none" data-testid="input-welcome-username" />
          <p className="text-xs text-muted-foreground">Shown to your family. You'll sign in with Google, so no password needed.</p>
        </div>
        <Button type="submit" size="lg" className="h-12" disabled={!ok || finish.isPending} data-testid="button-finish-signup">
          {finish.isPending ? <Loader2 className="animate-spin" /> : role === "parent" ? (pjoin.mode === "join" ? "Join this family" : "Create family account") : "Join my family"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setLocation("/login")}>Cancel</Button>
      </form>
    </AuthLayout>
  );
}
