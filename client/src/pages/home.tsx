import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import SpinnerView from "@/components/SpinnerView";
import SetupView from "@/components/SetupView";
import PendingView from "@/components/PendingView";
import FamilyView from "@/components/FamilyView";
import { usePendingApprovals } from "@/components/ApprovalsInbox";
import { Settings, User, LogOut, LogIn, ChevronDown } from "lucide-react";
import { SettingsDialog } from "@/components/ui/settings-dialog";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { eventEmitter, EVENTS } from "@/lib/events";
import { authService } from "@/lib/auth-service";
import { UserWithoutPassword } from "@/lib/auth-service";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

const tabClass =
  "data-[state=active]:bg-white data-[state=active]:text-blue-500 data-[state=inactive]:bg-gray-200/30 data-[state=inactive]:text-white rounded-t-lg font-bold py-2 text-xs sm:text-sm";

export default function Home() {
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const { toast } = useToast();
  const [_, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const { data: currentUser } = useQuery<UserWithoutPassword | null>({
    queryKey: ['currentUser'],
    queryFn: () => authService.getCurrentUser(),
  });

  // For a parent this is their children; for a child it's just their own profile.
  const { data: children = [] } = useQuery<any[]>({
    queryKey: ['/api/children'],
    enabled: !!currentUser,
  });

  const [selectedSpinnerChildId, setSelectedSpinnerChildId] = useState<string>("");

  // Parents start on their family (approvals + kids); kids start on the wheel.
  const isParent = currentUser?.role === 'parent';
  const tab = activeTab ?? (isParent ? 'children' : 'spinner');
  const { data: approvals = [] } = usePendingApprovals(isParent);

  const getTotalEarnedSpins = () => {
    if (currentUser?.role === 'child') {
      return children[0]?.earnedSpins || 0;
    } else if (selectedSpinnerChildId && selectedSpinnerChildId !== "all") {
      const child = children.find(c => c.id === parseInt(selectedSpinnerChildId));
      return child?.earnedSpins || 0;
    }
    return children.reduce((total, child) => total + (child.earnedSpins || 0), 0);
  };

  const [spinnerContext, setSpinnerContext] = useState<{
    childId?: number;
    type?: 'good' | 'bad' | 'fighting';
  }>({});

  useEffect(() => {
    const handleSwitchTab = (tabName: string) => {
      if (tabName && ['spinner', 'children', 'pending', 'setup'].includes(tabName)) {
        setActiveTab(tabName);
      }
    };
    const handleSwitchToSpinner = (context: { childId?: number; type?: 'good' | 'bad' | 'fighting' }) => {
      setActiveTab('spinner');
      if (context.childId || context.type) setSpinnerContext(context);
    };
    eventEmitter.on(EVENTS.SWITCH_TAB, handleSwitchTab);
    eventEmitter.on(EVENTS.SWITCH_TO_SPINNER, handleSwitchToSpinner);
    return () => {
      eventEmitter.off(EVENTS.SWITCH_TAB, handleSwitchTab);
      eventEmitter.off(EVENTS.SWITCH_TO_SPINNER, handleSwitchToSpinner);
    };
  }, []);

  const handleLogout = async () => {
    try {
      await authService.logout();
    } catch {
      // Still clear local state below
    }
    // Drop every cached query so the next person on this device starts clean.
    queryClient.clear();
    queryClient.setQueryData(['currentUser'], null);
    toast({ title: 'Logged out', description: 'You have been successfully logged out' });
    setLocation('/login');
  };

  return (
    <div className="min-h-screen max-w-md md:max-w-3xl mx-auto bg-white shadow-lg font-nunito">
      <header className="bg-gradient-to-r from-blue-500 to-gray-800 text-white p-4 relative">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-extrabold">Good Spin Bad Spin</h1>
            <p className="text-sm opacity-80 font-sans">Behavior Consequences</p>
          </div>
          <div className="flex items-center space-x-2">
            {currentUser ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="p-2 text-white flex items-center" data-testid="button-user-menu">
                    <User className="h-5 w-5 mr-1" />
                    <span className="text-sm mr-1">{currentUser.username}</span>
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {currentUser?.role === 'parent' && (
                    <DropdownMenuItem
                      onClick={() => {
                        navigator.clipboard?.writeText(currentUser.joinCode || "");
                        toast({ title: "Parent Code Copied!", description: `Code ${currentUser.joinCode} copied to clipboard` });
                      }}
                    >
                      <User className="h-4 w-4 mr-2" />
                      Parent Code: {currentUser.joinCode}
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={handleLogout} data-testid="button-logout">
                    <LogOut className="h-4 w-4 mr-2" />
                    Logout
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button variant="ghost" className="text-white" onClick={() => setLocation('/login')}>
                <LogIn className="h-5 w-5 mr-1" />
                <span>Login</span>
              </Button>
            )}
            {currentUser?.role === 'parent' && (
              <SettingsDialog
                trigger={
                  <button className="p-2 rounded-full hover:bg-white/20" data-testid="button-settings">
                    <Settings className="h-6 w-6" />
                  </button>
                }
              />
            )}
          </div>
        </div>

        <Tabs value={tab} onValueChange={setActiveTab} className="mt-4">
          {currentUser?.role === 'child' ? (
            <TabsList className="grid grid-cols-2 gap-1 w-full">
              <TabsTrigger value="spinner" className={tabClass} data-testid="tab-spinner">
                <span className="flex items-center gap-1">
                  Spin
                  {getTotalEarnedSpins() > 0 && (
                    <span className="bg-amber-500 text-white text-xs rounded-full h-5 min-w-5 px-1 flex items-center justify-center" aria-label={`${getTotalEarnedSpins()} spins to use`}>
                      {getTotalEarnedSpins()}
                    </span>
                  )}
                </span>
              </TabsTrigger>
              <TabsTrigger value="pending" className={tabClass} data-testid="tab-pending">My To-Dos</TabsTrigger>
            </TabsList>
          ) : (
            <TabsList className="grid grid-cols-4 gap-1 w-full">
              <TabsTrigger value="children" className={tabClass} disabled={!isParent} data-testid="tab-children">
                <span className="flex items-center gap-1">
                  Family
                  {approvals.length > 0 && (
                    <span className="bg-rose-500 text-white text-xs rounded-full h-5 min-w-5 px-1 flex items-center justify-center" aria-label={`${approvals.length} waiting for approval`} data-testid="badge-approvals">
                      {approvals.length}
                    </span>
                  )}
                </span>
              </TabsTrigger>
              <TabsTrigger value="spinner" className={tabClass} data-testid="tab-spinner">Spin</TabsTrigger>
              <TabsTrigger value="pending" className={tabClass} data-testid="tab-pending">
                <span className="hidden sm:inline">Earned</span>
                <span className="sm:hidden">Earned</span>
              </TabsTrigger>
              <TabsTrigger value="setup" className={tabClass} disabled={!isParent} data-testid="tab-setup">
                Setup
              </TabsTrigger>
            </TabsList>
          )}
        </Tabs>
      </header>

      <main>
        {tab === "spinner" && (
          <SpinnerView
            initialChildId={spinnerContext.childId}
            initialType={spinnerContext.type}
            onChildIdChange={setSelectedSpinnerChildId}
          />
        )}
        {tab === "children" && isParent && <FamilyView />}
        {tab === "setup" && currentUser?.role === 'parent' && <SetupView />}
        {tab === "pending" && <PendingView childView={currentUser?.role === 'child'} />}
      </main>
    </div>
  );
}
