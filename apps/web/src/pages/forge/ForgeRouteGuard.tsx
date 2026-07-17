import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { canAccessForge, canAdminForge } from "../../lib/forge/roles";

type ForgeRouteGuardProps = {
  requireAdmin?: boolean;
};

export function ForgeRouteGuard({ requireAdmin = false }: ForgeRouteGuardProps) {
  const { user } = useAuth();
  if (!user) {
    return <Navigate to="/" replace />;
  }
  if (!canAccessForge(user.role)) {
    return <Navigate to="/" replace />;
  }
  if (requireAdmin && !canAdminForge(user.role)) {
    return <Navigate to="/forge" replace />;
  }
  return <Outlet />;
}
