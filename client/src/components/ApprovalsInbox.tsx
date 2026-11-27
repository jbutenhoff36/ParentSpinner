import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { spinRequestService } from '@/lib/spin-request-service';
import { CheckCircle, XCircle, Inbox } from 'lucide-react';

function errorMessage(error: unknown, fallback: string): string {
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

export function usePendingApprovals(enabled: boolean) {
  return useQuery({
    queryKey: ['pendingSpinRequests'],
    queryFn: () => spinRequestService.getPendingRequests(),
    enabled,
    refetchInterval: 15000,
  });
}

/** Parent's inbox of spin results their kids asked to keep. */
export default function ApprovalsInbox() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: requests = [], isLoading } = usePendingApprovals(true);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['pendingSpinRequests'] });
    queryClient.invalidateQueries({ queryKey: ['/api/pending'] });
    queryClient.invalidateQueries({ queryKey: ['/api/children'] });
  };

  const approve = useMutation({
    mutationFn: (id: number) => spinRequestService.approveRequest(id),
    onSuccess: () => {
      refresh();
      toast({ title: 'Approved', description: "Added to your child's list." });
    },
    onError: (error) => {
      refresh();
      toast({ title: "Couldn't approve", description: errorMessage(error, 'Please try again.'), variant: 'destructive' });
    },
  });

  const reject = useMutation({
    mutationFn: (id: number) => spinRequestService.rejectRequest(id),
    onSuccess: () => {
      refresh();
      toast({ title: 'Not approved', description: 'Your child keeps the spin and can try again.' });
    },
    onError: (error) => {
      refresh();
      toast({ title: "Couldn't update", description: errorMessage(error, 'Please try again.'), variant: 'destructive' });
    },
  });

  if (isLoading) return null;

  return (
    <section aria-labelledby="approvals-heading" className="mb-6">
      <h2 id="approvals-heading" className="text-lg font-bold mb-2 flex items-center gap-2">
        <Inbox className="h-5 w-5 text-indigo-600" aria-hidden="true" />
        Waiting for you
        {requests.length > 0 && (
          <span className="bg-indigo-600 text-white text-xs rounded-full px-2 py-0.5" data-testid="badge-approvals-inline">{requests.length}</span>
        )}
      </h2>
      {requests.length === 0 ? (
        <p className="text-sm text-gray-500">No spin requests right now.</p>
      ) : (
        <div className="space-y-3">
          {requests.map((r) => (
            <Card key={r.id} className="p-4 border-indigo-100" data-testid={`card-request-${r.id}`}>
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="text-sm text-gray-500">
                    <span className="font-semibold text-gray-800">{r.childName || 'Your child'}</span> landed on
                  </p>
                  <p className="text-lg font-bold">{r.consequenceText || 'Unknown'}</p>
                  {r.description && (
                    <p className="mt-1 text-sm text-gray-700 italic">"{r.description}"</p>
                  )}
                  <p className="mt-1 text-xs text-gray-400">{new Date(r.requestedAt).toLocaleString()}</p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => reject.mutate(r.id)}
                    disabled={approve.isPending || reject.isPending}
                    data-testid={`button-reject-${r.id}`}
                  >
                    <XCircle className="h-4 w-4 mr-1" aria-hidden="true" /> Not now
                  </Button>
                  <Button
                    size="sm"
                    className="bg-green-600 hover:bg-green-700"
                    onClick={() => approve.mutate(r.id)}
                    disabled={approve.isPending || reject.isPending}
                    data-testid={`button-approve-${r.id}`}
                  >
                    <CheckCircle className="h-4 w-4 mr-1" aria-hidden="true" /> Approve
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}
