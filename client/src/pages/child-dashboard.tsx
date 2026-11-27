import { useLocation } from 'wouter';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { authService } from '@/lib/auth-service';
import { spinRequestService } from '@/lib/spin-request-service';
import { CheckCircle, XCircle, Clock, LogOut, Loader2, RefreshCw } from 'lucide-react';

export default function ChildDashboard() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: currentUser, isLoading: isLoadingUser } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => authService.getCurrentUser(),
  });

  const { data: myRequests = [], isLoading: isLoadingRequests, refetch: refetchRequests } = useQuery({
    queryKey: ['/api/spinrequests/mine'],
    queryFn: () => spinRequestService.getMyRequests(),
    enabled: !!currentUser,
  });

  const handleLogout = async () => {
    try {
      await authService.logout();
    } catch (error) {
      console.error(error);
    }
    queryClient.clear();
    queryClient.setQueryData(['currentUser'], null);
    toast({ title: 'Logged out', description: 'You have been successfully logged out' });
    setLocation('/login');
  };

  const formatDate = (date: Date | string) => new Date(date).toLocaleString();

  const getStatusBadgeStyle = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'approved':
        return 'bg-green-100 text-green-800';
      case 'rejected':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending':
        return <Clock className="h-4 w-4" />;
      case 'approved':
        return <CheckCircle className="h-4 w-4" />;
      case 'rejected':
        return <XCircle className="h-4 w-4" />;
      default:
        return null;
    }
  };

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
        <h1 className="text-2xl font-bold">My Spin Requests</h1>
        <div className="flex items-center space-x-4">
          <div className="text-sm text-gray-600">
            Logged in as: <span className="font-semibold">{currentUser?.username}</span>
          </div>
          <Button variant="outline" size="sm" onClick={handleLogout}>
            <LogOut className="h-4 w-4 mr-2" />
            Logout
          </Button>
        </div>
      </div>

      <div className="mb-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">Your Spin Requests</h2>
          <Button variant="outline" size="sm" onClick={() => refetchRequests()} className="text-blue-600">
            <RefreshCw className="h-4 w-4 mr-1" />
            Refresh
          </Button>
        </div>

        {isLoadingRequests ? (
          <div className="flex justify-center items-center h-40">
            <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
            <span className="ml-2">Loading requests...</span>
          </div>
        ) : myRequests.length === 0 ? (
          <Card className="p-6 text-center text-gray-500">
            You haven't made any spin requests yet.
            <div className="mt-4">
              <Button onClick={() => setLocation('/')}>Go to Spinner</Button>
            </div>
          </Card>
        ) : (
          <div className="space-y-4">
            {myRequests.map((request: any) => (
              <Card key={request.id} className="p-4 shadow-md">
                <div className="flex items-center mb-2 flex-wrap gap-2">
                  <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                    request.type === 'good' ? 'bg-blue-100 text-blue-800' :
                    request.type === 'bad' ? 'bg-gray-100 text-gray-800' :
                    'bg-red-100 text-red-800'
                  }`}>
                    {request.type?.toUpperCase()}
                  </span>
                  <span className={`px-2 py-1 rounded-full text-xs font-semibold flex items-center ${getStatusBadgeStyle(request.status)}`}>
                    {getStatusIcon(request.status)}
                    <span className="ml-1">{request.status.toUpperCase()}</span>
                  </span>
                </div>
                {request.consequenceText && <p className="font-semibold">{request.consequenceText}</p>}
                <p className="text-sm">Requested: {formatDate(request.requestedAt)}</p>
                {request.approvedAt && (
                  <p className="text-sm text-gray-600">
                    {request.status === 'approved' ? 'Approved' : 'Rejected'}: {formatDate(request.approvedAt)}
                  </p>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>

      <div className="mt-8 flex justify-center">
        <Button onClick={() => setLocation('/')}>Back to Spinner</Button>
      </div>
    </div>
  );
}
