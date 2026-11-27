import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { authService } from '@/lib/auth-service';
import { Copy, RefreshCw, KeyRound } from 'lucide-react';

/** Shows the parent's join code that kids use to link their account. */
export default function JoinCodeCard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: currentUser } = useQuery({ queryKey: ['currentUser'], queryFn: () => authService.getCurrentUser() });

  const newCode = useMutation({
    mutationFn: () => apiRequest<{ joinCode: string }>('POST', '/api/auth/join-code'),
    onSuccess: (data) => {
      queryClient.setQueryData(['currentUser'], (old: any) => (old ? { ...old, joinCode: data.joinCode } : old));
      queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });
      toast({ title: 'New parent code', description: `Your new code is ${data.joinCode}. The old one no longer works.` });
    },
    onError: () => toast({ title: 'Error', description: 'Could not make a new code', variant: 'destructive' }),
  });

  if (!currentUser?.joinCode) return null;

  return (
    <Card className="p-4 mb-6 bg-indigo-50 border-indigo-100">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <KeyRound className="h-5 w-5 text-indigo-700" aria-hidden="true" />
          <div>
            <p className="text-sm text-indigo-900">
              Parent code: <span className="font-mono text-lg font-bold tracking-widest" data-testid="text-parent-code">{currentUser.joinCode}</span>
            </p>
            <p className="text-xs text-indigo-700">Kids enter this when they make their account.</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              navigator.clipboard?.writeText(currentUser.joinCode || '');
              toast({ title: 'Copied', description: 'Parent code copied' });
            }}
          >
            <Copy className="h-4 w-4 mr-1" aria-hidden="true" /> Copy
          </Button>
          <Button variant="outline" size="sm" onClick={() => newCode.mutate()} disabled={newCode.isPending} data-testid="button-new-code">
            <RefreshCw className="h-4 w-4 mr-1" aria-hidden="true" /> New code
          </Button>
        </div>
      </div>
    </Card>
  );
}
