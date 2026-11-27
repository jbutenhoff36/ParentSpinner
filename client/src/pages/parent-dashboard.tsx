import { useLocation } from 'wouter';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authService } from '@/lib/auth-service';
import { spinRequestService } from '@/lib/spin-request-service';
import { CheckCircle, XCircle, LogOut, Loader2, User, Copy, RefreshCw } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';

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

export default function ParentDashboard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [_, setLocation] = useLocation();

  // ParentRoute already makes sure only parents get here.
  const { data: currentUser, isLoading: isLoadingUser } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => authService.getCurrentUser(),
  });

  const { data: pendingRequests = [], isLoading: isLoadingRequests } = useQuery({
    queryKey: ['pendingSpinRequests'],
    queryFn: () => spinRequestService.getPendingRequests(),
    enabled: currentUser?.role === 'parent',
    refetchInterval: 10000,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['pendingSpinRequests'] });
    queryClient.invalidateQueries({ queryKey: ['/api/pending'] });
    queryClient.invalidateQueries({ queryKey: ['/api/children'] });
  };

  const approveMutation = useMutation({
    mutationFn: (id: number) => spinRequestService.approveRequest(id),
    onSuccess: () => {
      refresh();
      toast({ title: 'Request Approved', description: "The consequence was added to your child's earned list" });
    },
    onError: (error) => {
      refresh();
      toast({ title: 'Error', description: errorMessage(error, 'Failed to approve request'), variant: 'destructive' });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (id: number) => spinRequestService.rejectRequest(id),
    onSuccess: () => {
      refresh();
      toast({ title: 'Request Rejected', description: 'The spin request has been rejected. Your child keeps the spin.' });
    },
    onError: (error) => {
      refresh();
      toast({ title: 'Error', description: errorMessage(error, 'Failed to reject request'), variant: 'destructive' });
    },
  });

  const newCodeMutation = useMutation({
    mutationFn: () => apiRequest<{ joinCode: string }>('POST', '/api/auth/join-code'),
    onSuccess: (data) => {
      queryClient.setQueryData(['currentUser'], (old: any) => (old ? { ...old, joinCode: data.joinCode } : old));
      queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });
      toast({ title: 'New parent code', description: `Your new code is ${data.joinCode}. The old one no longer works.` });
    },
    onError: (error) => {
      toast({ title: 'Error', description: errorMessage(error, 'Could not make a new code'), variant: 'destructive' });
    },
  });

  const handleLogout = async () => {
    try {
      await authService.logout();
    } catch {
      // ignore; clear local state anyway
    }
    queryClient.clear();
    queryClient.setQueryData(['currentUser'], null);
    toast({ title: 'Logged out', description: 'You have been successfully logged out' });
    setLocation('/login');
  };

  const formatDate = (date: Date | string) => new Date(date).toLocaleString();

  if (isLoadingUser) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
        <span className="ml-2">Loading...</span>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 max-w-4xl">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Parent Dashboard</h1>
        <div className="flex items-center space-x-4">
          <div className="text-sm text-gray-600">
            Logged in as: <span className="font-semibold">{currentUser?.username}</span>
          </div>
          <Button variant="outline" size="sm" onClick={handleLogout} data-testid="button-logout">
            <LogOut className="h-4 w-4 mr-2" />
            Logout
          </Button>
        </div>
      </div>

      <Card className="mb-6 p-4 bg-blue-50 border-blue-200">
        <div className="flex items-center space-x-3">
          <div className="bg-blue-100 rounded-full p-2">
            <User className="h-5 w-5 text-blue-700" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-blue-800">
              Your Parent Code: <span className="text-lg tracking-widest" data-testid="text-parent-code">{currentUser?.joinCode}</span>
            </h3>
            <p className="text-sm text-blue-600">
              Your kids enter this code when they make their account, to link it to yours.
            </p>
            <div className="flex gap-2 mt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  navigator.clipboard?.writeText(currentUser?.joinCode || '');
                  toast({ title: 'Copied', description: 'Parent code copied to clipboard' });
                }}
              >
                <Copy className="h-4 w-4 mr-1" /> Copy
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => newCodeMutation.mutate()}
                disabled={newCodeMutation.isPending}
                data-testid="button-new-code"
              >
                <RefreshCw className="h-4 w-4 mr-1" /> New code
              </Button>
            </div>
          </div>
        </div>
      </Card>

      <div className="mb-6">
        <h2 className="text-xl font-semibold mb-4">Pending Spin Requests</h2>

        {isLoadingRequests ? (
          <div className="flex justify-center items-center h-40">
            <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
            <span className="ml-2">Loading requests...</span>
          </div>
        ) : pendingRequests.length === 0 ? (
          <Card className="p-6 text-center text-gray-500">No pending spin requests at this time.</Card>
        ) : (
          <div className="space-y-4">
            {pendingRequests.map((request) => (
              <Card key={request.id} className="p-4 shadow-md" data-testid={`card-request-${request.id}`}>
                <div className="flex justify-between items-start">
                  <div>
                    <div className="flex items-center mb-2 flex-wrap gap-y-1">
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                        request.type === 'good' ? 'bg-blue-100 text-blue-800'
                          : request.type === 'bad' ? 'bg-gray-100 text-gray-800'
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {request.type?.toUpperCase()}
                      </span>
                      {request.childName && (
                        <span className="ml-2 text-sm font-semibold text-gray-700">{request.childName}</span>
                      )}
                      <span className="ml-2 text-gray-500 text-sm">Section {request.section}</span>
                      <span className="ml-2 text-gray-500 text-xs">Requested at {formatDate(request.requestedAt)}</span>
                    </div>

                    <h3 className="font-bold mb-1">{request.consequenceText || 'Unknown consequence'}</h3>

                    {request.description && (
                      <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded-md">
                        <p className="text-sm font-medium text-yellow-800">Child's reason:</p>
                        <p className="text-sm text-yellow-700 italic">"{request.description}"</p>
                      </div>
                    )}
                  </div>

                  <div className="flex space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="bg-red-50 text-red-600 border-red-200 hover:bg-red-100"
                      onClick={() => rejectMutation.mutate(request.id)}
                      disabled={rejectMutation.isPending || approveMutation.isPending}
                      data-testid={`button-reject-${request.id}`}
                    >
                      {rejectMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4 mr-1" />}
                      Reject
                    </Button>
                    <Button
                      size="sm"
                      className="bg-green-600 hover:bg-green-700"
                      onClick={() => approveMutation.mutate(request.id)}
                      disabled={approveMutation.isPending || rejectMutation.isPending}
                      data-testid={`button-approve-${request.id}`}
                    >
                      {approveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <CheckCircle className="h-4 w-4 mr-1" />}
                      Approve
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4 text-center hover:shadow-lg transition-shadow cursor-pointer" onClick={() => setLocation('/')}>
          <h3 className="font-semibold mb-2">Spinner & Consequences</h3>
          <p className="text-sm text-gray-600">Access the main spinner interface and manage consequences</p>
        </Card>
        <Card className="p-4 text-center hover:shadow-lg transition-shadow cursor-pointer" onClick={() => setLocation('/')}>
          <h3 className="font-semibold mb-2">Manage Children</h3>
          <p className="text-sm text-gray-600">Create and manage child profiles</p>
        </Card>
        <Card className="p-4 text-center hover:shadow-lg transition-shadow cursor-pointer" onClick={() => setLocation('/')}>
          <h3 className="font-semibold mb-2">Setup & Settings</h3>
          <p className="text-sm text-gray-600">Configure app settings and wheel options</p>
        </Card>
      </div>
    </div>
  );
}
