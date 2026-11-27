import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { spinRequestService } from "@/lib/spin-request-service";
import { Check, Gift } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { errorMessage } from "@/lib/api";

export function usePendingApprovals(enabled: boolean) {
  return useQuery({
    queryKey: ["pendingSpinRequests"],
    queryFn: () => spinRequestService.getPendingRequests(),
    enabled,
    refetchInterval: 15000,
  });
}

/** Parent's inbox of prizes their kids asked to keep. Hidden when there's nothing to do. */
export default function ApprovalsInbox() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: requests = [] } = usePendingApprovals(true);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["pendingSpinRequests"] });
    queryClient.invalidateQueries({ queryKey: ["/api/pending"] });
    queryClient.invalidateQueries({ queryKey: ["/api/children"] });
  };

  const approve = useMutation({
    mutationFn: (id: number) => spinRequestService.approveRequest(id),
    onSuccess: () => {
      refresh();
      toast({ title: "Approved", description: "It's on their list now." });
    },
    onError: (error) => {
      refresh();
      toast({ title: "Couldn't approve", description: errorMessage(error), variant: "destructive" });
    },
  });

  const reject = useMutation({
    mutationFn: (id: number) => spinRequestService.rejectRequest(id),
    onSuccess: () => {
      refresh();
      toast({ title: "Not approved", description: "They keep the spin and can try again." });
    },
    onError: (error) => {
      refresh();
      toast({ title: "Couldn't update", description: errorMessage(error), variant: "destructive" });
    },
  });

  if (requests.length === 0) return null;
  const busy = approve.isPending || reject.isPending;

  return (
    <section aria-labelledby="approvals-heading" className="mb-8 animate-rise">
      <div className="mb-3 flex items-center gap-2">
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-60 motion-reduce:hidden" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-rose-500" />
        </span>
        <h2 id="approvals-heading" className="text-lg font-bold">
          Needs your OK <span className="text-muted-foreground font-semibold" data-testid="badge-approvals-inline">({requests.length})</span>
        </h2>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {requests.map((r: any) => (
          <article key={r.id} className="surface p-5" data-testid={`card-request-${r.id}`}>
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-reward-soft text-amber-600">
                <Gift className="h-5 w-5" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-muted-foreground">
                  <span className="font-semibold text-foreground">{r.childName || "Your child"}</span> won
                  <span className="ml-1">· {formatDistanceToNow(new Date(r.requestedAt), { addSuffix: true })}</span>
                </p>
                <p className="mt-0.5 text-lg font-bold leading-snug">{r.consequenceText || "A prize"}</p>
                {r.description && (
                  <p className="mt-2 rounded-xl bg-muted px-3 py-2 text-sm">"{r.description}"</p>
                )}
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={() => reject.mutate(r.id)} disabled={busy} data-testid={`button-reject-${r.id}`}>
                Not now
              </Button>
              <Button className="bg-success hover:bg-success/90 shadow-success/30" onClick={() => approve.mutate(r.id)} disabled={busy} data-testid={`button-approve-${r.id}`}>
                <Check aria-hidden="true" /> Approve
              </Button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
