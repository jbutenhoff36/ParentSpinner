import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import LoginPage from "@/pages/login";
import { NotificationProvider } from "./context/notification-context";
import { WebSocketProvider } from "./context/websocket-context";
import { NotificationCenter } from "./components/ui/notification";
import { useNotificationContext } from "./context/notification-context";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useMobileKeyboard } from "@/hooks/use-mobile-keyboard";

function Router() {
  return (
    <Switch>
      <Route path="/login" component={LoginPage} />
      <ProtectedRoute path="/" component={Home} />
      {/* Old dashboard pages now live on the home screen */}
      <Route path="/parent-dashboard"><Redirect to="/" /></Route>
      <Route path="/child-dashboard"><Redirect to="/" /></Route>
      <Route path="/auth">
        <Redirect to="/login" />
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function AppContent() {
  const { notifications, dismissNotification } = useNotificationContext();
  useMobileKeyboard();
  return (
    <>
      <Router />
      <NotificationCenter notifications={notifications} onDismiss={dismissNotification} />
      <Toaster />
    </>
  );
}

function App() {
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

export default App;
