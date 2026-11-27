import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { format } from "date-fns";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { CheckCircle2, XIcon, CheckIcon, User as UserIcon, Filter } from "lucide-react";
import { PendingConsequence, ChildProfile, User as UserType } from "@shared/schema";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface PendingViewProps {
  /** True when a child is looking at their own list (read-only). */
  childView?: boolean;
}

export default function PendingView({ childView = false }: PendingViewProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isConfirmingClearAll, setIsConfirmingClearAll] = useState(false);
  const [selectedChildId, setSelectedChildId] = useState<string>("all");

  const { data: currentUser } = useQuery<UserType>({ queryKey: ['/api/auth/me'] });
  const isParent = !childView && currentUser?.role === 'parent';

  // The server only returns this family's items (or, for a child, their own).
  const { data: pendingConsequences = [], isLoading: isLoadingPending } = useQuery<PendingConsequence[]>({
    queryKey: ['/api/pending'],
  });

  const { data: children = [], isLoading: isLoadingChildren } = useQuery<ChildProfile[]>({
    queryKey: ['/api/children'],
    enabled: isParent,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['/api/pending'] });
    queryClient.invalidateQueries({ queryKey: ['/api/children'] });
  };

  const completeMutation = useMutation({
    mutationFn: (id: number) => apiRequest('POST', `/api/pending/${id}/complete`),
    onSuccess: () => {
      refresh();
      toast({ title: "Success", description: "Consequence marked as completed!" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to complete consequence. It may have already been removed.", variant: "destructive" });
      refresh();
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest('DELETE', `/api/pending/${id}`),
    onSuccess: () => {
      refresh();
      toast({ title: "Success", description: "Removed from pending list." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to remove item.", variant: "destructive" });
    }
  });

  const clearAllMutation = useMutation({
    mutationFn: () => apiRequest('DELETE', '/api/pending'),
    onSuccess: () => {
      refresh();
      setIsConfirmingClearAll(false);
      toast({ title: "Success", description: "All pending consequences cleared." });
    },
    onError: () => {
      setIsConfirmingClearAll(false);
      toast({ title: "Error", description: "Failed to clear pending consequences.", variant: "destructive" });
    }
  });

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'good':
        return 'Good Spin';
      case 'bad':
        return 'Bad Spin';
      case 'fighting':
        return 'Fighting';
      default:
        return 'Unknown';
    }
  };

  const getTypeBadgeClass = (type: string) => {
    switch (type) {
      case 'good':
        return 'bg-blue-100 text-blue-800';
      case 'bad':
        return 'bg-gray-100 text-gray-800';
      case 'fighting':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatDate = (dateString: string) => format(new Date(dateString), "MMM d, h:mm a");

  if (isLoadingPending || (isParent && isLoadingChildren)) {
    return <div className="p-4 text-center">Loading...</div>;
  }

  const activePendingConsequences = Array.isArray(pendingConsequences)
    ? pendingConsequences.filter(
        (c) => c && !c.completed && (selectedChildId === "all" || c.childId === parseInt(selectedChildId))
      )
    : [];

  return (
    <div className="p-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">{childView ? "My Consequences" : "Pending Consequences"}</h2>
        {isParent && activePendingConsequences.length > 0 && (
          <Button
            variant="outline"
            onClick={() => setIsConfirmingClearAll(true)}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm font-bold"
          >
            Clear All
          </Button>
        )}
      </div>

      {isParent && (
        <div className="mb-4 bg-gray-50 p-3 rounded-lg border border-gray-200 shadow-sm">
          <div className="flex items-center gap-3">
            <Filter className="text-gray-500 h-4 w-4" />
            <span className="text-sm font-medium text-gray-700">Filter by child:</span>
            <Select value={selectedChildId} onValueChange={setSelectedChildId}>
              <SelectTrigger className="h-8 min-h-8 pl-3 text-xs bg-white">
                <SelectValue placeholder="All children" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All children</SelectItem>
                {children.map((child) => (
                  <SelectItem key={child.id} value={child.id.toString()}>
                    {child.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {activePendingConsequences.length === 0 ? (
        <div className="py-10 text-center">
          <div className="w-20 h-20 mx-auto mb-4 bg-gray-200 rounded-full flex items-center justify-center">
            <CheckCircle2 className="h-10 w-10 text-gray-400" />
          </div>
          <h3 className="text-lg font-bold text-gray-500">All done!</h3>
          <p className="text-gray-400 mt-1">No pending consequences</p>
        </div>
      ) : (
        <div className="space-y-3" data-testid="pending-list">
          {activePendingConsequences.map((consequence) => (
            <Card key={consequence.id} className="bg-white border border-gray-200 rounded-lg p-4" data-testid={`pending-item-${consequence.id}`}>
              <div className="flex justify-between mb-2">
                <div>
                  <span className={`inline-block px-2 py-1 ${getTypeBadgeClass(consequence.type)} text-xs font-bold rounded`}>
                    {getTypeLabel(consequence.type)}
                  </span>
                  <span className="text-sm text-gray-500 ml-2">{formatDate(consequence.createdAt.toString())}</span>
                </div>
                {isParent && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => deleteMutation.mutate(consequence.id)}
                    className="text-gray-400 hover:text-red-500"
                    aria-label="Remove"
                  >
                    <XIcon className="h-4 w-4" />
                  </Button>
                )}
              </div>
              <p className="font-bold text-gray-800 mb-1">{consequence.text}</p>

              {isParent && (
                <div className="flex items-center mb-3">
                  <UserIcon className="h-3 w-3 text-gray-400 mr-1" />
                  <span className="text-xs text-gray-500">
                    {children.find(c => c.id === consequence.childId)?.name || 'Unknown child'}
                  </span>
                </div>
              )}
              {isParent && (
                <Button
                  onClick={() => completeMutation.mutate(consequence.id)}
                  className="w-full px-3 py-1.5 bg-green-500 text-white text-sm rounded-lg"
                  disabled={completeMutation.isPending}
                >
                  <CheckIcon className="mr-1 h-4 w-4" /> Complete
                </Button>
              )}
            </Card>
          ))}
        </div>
      )}

      <AlertDialog open={isConfirmingClearAll} onOpenChange={setIsConfirmingClearAll}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear All Pending Consequences</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to clear all pending consequences for your children? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => clearAllMutation.mutate()} className="bg-red-500 text-white hover:bg-red-600">
              Clear All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
