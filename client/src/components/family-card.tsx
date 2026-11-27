import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Crown, RefreshCw, UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/kid-dialogs";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { errorMessage } from "@/lib/api";

type Family = { guardianCode: string; parents: { id: number; name: string; username: string; starter: boolean; you: boolean }[] };

/** Parents and guardians in the family, and the code to invite more. */
export function FamilyCard() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data } = useQuery<Family>({ queryKey: ["/api/family"] });
  const [confirm, setConfirm] = useState<null | { kind: "rotate" } | { kind: "remove"; id: number; name: string; you: boolean }>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["/api/family"] });
  const rotate = useMutation({
    mutationFn: () => apiRequest("POST", "/api/family/guardian-code"),
    onSuccess: () => { refresh(); toast({ title: "New invite code made", description: "The old one no longer works." }); },
    onError: (e) => toast({ title: "Couldn't make a new code", description: errorMessage(e), variant: "destructive" }),
  });
  const remove = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/family/parents/${id}`),
    onSuccess: (_r, id) => {
      if (data?.parents.find((p) => p.id === id)?.you) {
        window.location.href = "/";
        return;
      }
      refresh();
      toast({ title: "Removed from your family" });
    },
    onError: (e) => toast({ title: "Couldn't remove", description: errorMessage(e), variant: "destructive" }),
  });
  const code = data?.guardianCode ?? "";
  const pretty = code ? `${code.slice(0, 4)}-${code.slice(4)}` : "";

  return (
    <section className="surface p-5 md:p-6" data-testid="card-family">
      <h2 className="text-lg font-bold">Parents and guardians</h2>
      <p className="mt-0.5 text-sm text-muted-foreground">Everyone here can log good days, spin, approve prizes and change settings.</p>

      <ul className="mt-4 divide-y rounded-2xl border" data-testid="list-parents">
        {data?.parents.map((p) => (
          <li key={p.id} className="flex items-center gap-3 px-4 py-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary font-bold text-secondary-foreground">{p.name.charAt(0).toUpperCase()}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{p.name}{p.you && <span className="font-normal text-muted-foreground"> (you)</span>}</p>
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                {p.starter ? <><Crown className="h-3 w-3" /> Started the family</> : `@${p.username}`}
              </p>
            </div>
            {!p.starter && (
              <Button variant="ghost" size="sm" onClick={() => setConfirm({ kind: "remove", id: p.id, name: p.name, you: p.you })} data-testid={`button-remove-parent-${p.id}`}>
                {p.you ? "Leave" : <><X /> Remove</>}
              </Button>
            )}
          </li>
        ))}
      </ul>

      <div className="mt-4 rounded-2xl bg-muted p-4">
        <p className="flex items-center gap-2 font-semibold"><UserPlus className="h-4 w-4" /> Invite another parent, grandparent or guardian</p>
        <p className="mt-1 text-sm text-muted-foreground">
          They sign up, choose "I'm a parent", then "Join a family", and enter this code. Don't share it with kids, since it gives full parent access.
        </p>
        <div className="mt-3 flex items-center gap-2">
          <span className="rounded-xl bg-card px-4 py-2 font-mono text-lg font-bold tracking-[0.2em]" data-testid="text-guardian-code">{pretty}</span>
          <Button variant="outline" size="icon" aria-label="Copy invite code" onClick={() => { navigator.clipboard?.writeText(code); toast({ title: "Invite code copied" }); }}>
            <Copy />
          </Button>
          <Button variant="ghost" size="icon" aria-label="Make a new invite code" onClick={() => setConfirm({ kind: "rotate" })}>
            <RefreshCw />
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={confirm?.kind === "rotate"} onOpenChange={(o) => !o && setConfirm(null)}
        title="Make a new invite code?" description="Use this if the code got out. People already in your family stay in."
        confirmLabel="Make new code" onConfirm={() => rotate.mutate()}
      />
      <ConfirmDialog
        open={confirm?.kind === "remove"} onOpenChange={(o) => !o && setConfirm(null)} destructive
        title={confirm?.kind === "remove" ? (confirm.you ? "Leave this family?" : `Remove ${confirm.name}?`) : ""}
        description={confirm?.kind === "remove" && confirm.you ? "You'll keep your login but won't see this family's kids anymore." : "They keep their login but lose access to your kids and settings."}
        confirmLabel={confirm?.kind === "remove" && confirm.you ? "Leave" : "Remove"}
        onConfirm={() => confirm?.kind === "remove" && remove.mutate(confirm.id)}
      />
    </section>
  );
}
