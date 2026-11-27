import { useEffect } from "react";
import { Switch, Route, Redirect, useLocation } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import NotFound from "@/pages/not-found";
import LoginPage from "@/pages/login";
import WelcomePage from "@/pages/welcome";
import ParentHome from "@/pages/parent-home";
import KidHome from "@/pages/kid-home";
import SpinPage from "@/pages/spin";
import TodosPage from "@/pages/todos";
import SetupPage from "@/pages/setup";
import { AppShell } from "@/components/app-shell";
import { NotificationProvider, useNotificationContext } from "./context/notification-context";
import { WebSocketProvider } from "./context/websocket-context";
import { NotificationCenter } from "./components/ui/notification";
import { useMobileKeyboard } from "@/hooks/use-mobile-keyboard";
import { useMe } from "@/lib/api";

/** Everything behind sign-in shares the app frame. */
function SignedIn() {
  const { data: me, isLoading } = useMe();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && !me) setLocation("/login");
  }, [isLoading, me, setLocation]);

  if (isLoading || !me) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-label="Loading" />
      </div>
    );
  }
  const isParent = me.role === "parent";
  return (
    <AppShell me={me}>
      <Switch>
        <Route path="/">{isParent ? <ParentHome me={me} /> : <KidHome me={me} />}</Route>
        <Route path="/spin"><SpinPage me={me} /></Route>
        <Route path="/todos"><TodosPage me={me} /></Route>
        <Route path="/setup">{isParent ? <SetupPage me={me} /> : <Redirect to="/" />}</Route>
        {/* Old addresses */}
        <Route path="/parent-dashboard"><Redirect to="/" /></Route>
        <Route path="/child-dashboard"><Redirect to="/" /></Route>
        <Route component={NotFound} />
      </Switch>
    </AppShell>
  );
}

function AppContent() {
  const { notifications, dismissNotification } = useNotificationContext();
  useMobileKeyboard();
  return (
    <>
      <Switch>
        <Route path="/login" component={LoginPage} />
        <Route path="/welcome" component={WelcomePage} />
        <Route path="/auth"><Redirect to="/login" /></Route>
        <Route component={SignedIn} />
      </Switch>
      <NotificationCenter notifications={notifications} onDismiss={dismissNotification} />
      <Toaster />
    </>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <NotificationProvider>
        <WebSocketProvider>
          <AppContent />
        </WebSocketProvider>
      </NotificationProvider>
    </QueryClientProvider>
  );
}
