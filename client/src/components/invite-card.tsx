import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Copy, RefreshCw, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { errorMessage, type Me } from "@/lib/api";
import { ConfirmDialog } from "@/components/kid-dialogs";

/** The parent code kids type in when they make their own login. */
export function InviteCard({ me }: { me: Me }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  const rotate = useMutation({
    mutationFn: () => apiRequest<{ joinCode: string }>("POST", "/api/auth/join-code"),
    onSuccess: (d) => {
      qc.setQueryData(["/api/auth/me"], { ...me, joinCode: d.joinCode });
      toast({ title: "New code made", description: "The old code no longer works." });
    },
    onError: (e) => toast({ title: "Couldn't make a new code", description: errorMessage(e), variant: "destructive" }),
  });
  return (
    <section className="surface overflow-hidden" data-testid="card-parent-code">
      <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-secondary text-secondary-foreground">
          <Users className="h-6 w-6" aria-hidden="true" />
        </span>
        <div className="flex-1">
          <h2 className="font-bold">Kid code: let your kids sign in</h2>
          <p className="text-sm text-muted-foreground">They choose "I'm a kid" when signing up and enter this code.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-xl bg-muted px-4 py-2 font-mono text-xl font-bold tracking-[0.25em]" data-testid="text-parent-code">
            {me.joinCode}
          </span>
          <Button
            variant="outline" size="icon" aria-label="Copy code"
            onClick={() => {
              navigator.clipboard?.writeText(me.joinCode || "");
              toast({ title: "Copied", description: `Parent code ${me.joinCode}` });
            }}
          >
            <Copy />
          </Button>
          <Button variant="ghost" size="icon" aria-label="Make a new code" onClick={() => setConfirm(true)} data-testid="button-new-code">
            <RefreshCw />
          </Button>
        </div>
      </div>
      <ConfirmDialog
        open={confirm} onOpenChange={setConfirm} title="Make a new parent code?"
        description="Use this if someone outside your family got the code. Kids who already have a login stay connected."
        confirmLabel="Make new code" onConfirm={() => rotate.mutate()}
      />
    </section>
  );
}
