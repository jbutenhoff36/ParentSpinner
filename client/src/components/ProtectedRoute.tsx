import { useEffect } from "react";
import { Route, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { authService } from "@/lib/auth-service";
import { Loader2 } from "lucide-react";

interface ProtectedRouteProps {
  component: React.ComponentType;
  path: string;
  allowedRoles?: string[];
}

export const ProtectedRoute = ({ component: Component, path, allowedRoles }: ProtectedRouteProps) => {
  const [, setLocation] = useLocation();
  const { data: user, isLoading } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => authService.getCurrentUser(),
  });

  const roleNotAllowed = !!user && !!allowedRoles && !allowedRoles.includes(user.role);

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      setLocation('/login');
    } else if (roleNotAllowed) {
      setLocation(user.role === 'parent' ? '/parent-dashboard' : '/child-dashboard');
    }
  }, [isLoading, user, roleNotAllowed, setLocation]);

  return (
    <Route path={path}>
      {isLoading ? (
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <span className="ml-2">Checking login...</span>
        </div>
      ) : user && !roleNotAllowed ? (
        <Component />
      ) : null}
    </Route>
  );
};

export const ChildRoute = ({ component, path }: Omit<ProtectedRouteProps, 'allowedRoles'>) => (
  <ProtectedRoute component={component} path={path} allowedRoles={['child']} />
);

export const ParentRoute = ({ component, path }: Omit<ProtectedRouteProps, 'allowedRoles'>) => (
  <ProtectedRoute component={component} path={path} allowedRoles={['parent']} />
);
