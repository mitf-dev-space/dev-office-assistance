import { Routes, Route, Navigate } from "react-router-dom";
import { Skeleton, Stack } from "@mantine/core";
import { useAuth } from "./auth/AuthContext";
import { AppLayout } from "./components/AppLayout";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { TriageDetailPage } from "./pages/TriageDetailPage";
import { TriageCreatePage } from "./pages/TriageCreatePage";
import { AppsIndexPage } from "./pages/AppsIndexPage";
import { OutlookPage } from "./pages/OutlookPage";
import { TodoPage } from "./pages/TodoPage";
import { AppRegistrationsPage } from "./pages/AppRegistrationsPage";
import { ExpensesPage } from "./pages/ExpensesPage";
import { ExpenseEditPage } from "./pages/ExpenseEditPage";
import { PlanningPage } from "./pages/PlanningPage";
import { PlanningEditPage } from "./pages/PlanningEditPage";
import { TeamManagementPage } from "./pages/TeamManagementPage";
import { DevManagementPage } from "./pages/DevManagementPage";
import { DevEditPage } from "./pages/DevEditPage";
import { ProfilePage } from "./pages/ProfilePage";
import { PriorityPage } from "./pages/PriorityPage";
import { StandupPage } from "./pages/StandupPage";
import { DecisionsPage } from "./pages/DecisionsPage";
import { ForgeRouteGuard } from "./pages/forge/ForgeRouteGuard";
import { ForgeDashboardPage } from "./pages/forge/ForgeDashboardPage";
import { ForgeBuildsPage } from "./pages/forge/ForgeBuildsPage";
import { ForgeRequestBuildPage } from "./pages/forge/ForgeRequestBuildPage";
import { ForgeBuildDetailPage } from "./pages/forge/ForgeBuildDetailPage";
import { ForgeAdminPage } from "./pages/forge/ForgeAdminPage";
import { isForgeOnlyUser } from "./lib/forge/roles";

function DashboardRoute() {
  const { user } = useAuth();
  if (user && isForgeOnlyUser(user.role)) {
    return <Navigate to="/forge" replace />;
  }
  return <DashboardPage />;
}

export default function App() {
  const { user, ready, logout } = useAuth();

  if (!ready) {
    return (
      <div className="app-shell" role="status" aria-busy="true" aria-label="Loading app">
        <Stack align="center" justify="center" maw={360} mx="auto" gap="md" py="3rem" w="100%">
          <Skeleton height={20} w="100%" maw={200} />
          <Skeleton height={12} w="100%" maw={280} />
        </Stack>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="app-shell app-shell--auth">
        <LoginPage />
      </div>
    );
  }

  return (
    <div className="app-shell app-shell--with-sidebar">
      <AppLayout user={user} onLogout={logout}>
        <Routes>
          <Route path="/" element={<DashboardRoute />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/triage/new" element={<TriageCreatePage />} />
          <Route path="/triage/:id" element={<TriageDetailPage />} />
          <Route path="/expenses" element={<ExpensesPage />} />
          <Route path="/expenses/:id" element={<ExpenseEditPage />} />
          <Route path="/planning" element={<PlanningPage />} />
          <Route path="/planning/:id" element={<PlanningEditPage />} />
          <Route path="/developers" element={<DevManagementPage />} />
          <Route path="/developers/:id" element={<DevEditPage />} />
          <Route path="/team-management" element={<TeamManagementPage />} />
          <Route path="/teams" element={<Navigate to="/team-management" replace />} />
          <Route path="/priority" element={<PriorityPage />} />
          <Route path="/standup" element={<StandupPage />} />
          <Route path="/decisions" element={<DecisionsPage />} />
          <Route path="/apps" element={<AppsIndexPage />} />
          <Route path="/apps/registration" element={<AppRegistrationsPage />} />
          <Route path="/apps/outlook" element={<OutlookPage />} />
          <Route path="/apps/todo" element={<TodoPage />} />
          <Route path="/email" element={<Navigate to="/apps/outlook" replace />} />
          <Route element={<ForgeRouteGuard />}>
            <Route path="/forge" element={<ForgeDashboardPage />} />
            <Route path="/forge/builds" element={<ForgeBuildsPage />} />
            <Route path="/forge/builds/new" element={<ForgeRequestBuildPage />} />
            <Route path="/forge/builds/:id" element={<ForgeBuildDetailPage />} />
          </Route>
          <Route element={<ForgeRouteGuard requireAdmin />}>
            <Route path="/forge/admin" element={<ForgeAdminPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppLayout>
    </div>
  );
}
