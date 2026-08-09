import { Routes, Route, Navigate } from "react-router-dom";
import { Skeleton, Stack } from "@mantine/core";
import { useAuth } from "./auth/AuthContext";
import { AppLayout } from "./components/AppLayout";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { TriagePage } from "./pages/TriagePage";
import { TriageDetailPage } from "./pages/TriageDetailPage";
import { TriageCreatePage } from "./pages/TriageCreatePage";
import { AppsIndexPage } from "./pages/AppsIndexPage";
import { OutlookPage } from "./pages/OutlookPage";
import { TodoPage } from "./pages/TodoPage";
import { ClickUpPage } from "./pages/ClickUpPage";
import { AppRegistrationsPage } from "./pages/AppRegistrationsPage";
import { ExpensesPage } from "./pages/ExpensesPage";
import { ExpenseEditPage } from "./pages/ExpenseEditPage";
import { IncidentsPage } from "./pages/IncidentsPage";
import { IncidentCreatePage } from "./pages/IncidentCreatePage";
import { IncidentDetailPage } from "./pages/IncidentDetailPage";
import { SurveysPage } from "./pages/SurveysPage";
import { SurveyEditPage } from "./pages/SurveyEditPage";
import { SurveyResultsPage } from "./pages/SurveyResultsPage";
import { SurveyInvitationsPage } from "./pages/SurveyInvitationsPage";
import { SurveyRespondPage } from "./pages/SurveyRespondPage";
import { PlanningPage } from "./pages/PlanningPage";
import { PlanningEditPage } from "./pages/PlanningEditPage";
import { TeamManagementPage } from "./pages/TeamManagementPage";
import { DevManagementPage } from "./pages/DevManagementPage";
import { DevEditPage } from "./pages/DevEditPage";
import { ProfilePage } from "./pages/ProfilePage";
import { ChangePasswordPage } from "./pages/ChangePasswordPage";
import { UsersAdminPage } from "./pages/UsersAdminPage";
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
import { CatalogOverviewPage } from "./pages/catalog/CatalogOverviewPage";
import { CatalogRepositoriesPage } from "./pages/catalog/CatalogRepositoriesPage";
import { CatalogRepositoryDetailPage } from "./pages/catalog/CatalogRepositoryDetailPage";
import { CatalogPoliciesPage } from "./pages/catalog/CatalogPoliciesPage";
import {
  CatalogImportsPage,
  CatalogIntegrationsPage,
  CatalogGapsPage,
  CatalogSyncPage,
  CatalogRegisterRepositoryPage,
} from "./pages/catalog/CatalogImportsPage";
import { AiSettingsPage } from "./pages/AiSettingsPage";
import { AskHelmChatPage } from "./pages/AskHelmChatPage";
import { AiReviewQueuePage } from "./pages/AiReviewQueuePage";
import { InsightsPage } from "./pages/InsightsPage";
import { VoiceAssistantPage } from "./pages/VoiceAssistantPage";

function DashboardRoute() {
  const { user } = useAuth();
  if (user && isForgeOnlyUser(user.role)) {
    return <Navigate to="/forge" replace />;
  }
  return <DashboardPage />;
}

export default function App() {
  const { user, ready, logout, requiresPasswordChange } = useAuth();

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
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/survey/respond/:token" element={<SurveyRespondPage />} />
          <Route path="*" element={<LoginPage />} />
        </Routes>
      </div>
    );
  }

  if (requiresPasswordChange) {
    return (
      <div className="app-shell app-shell--auth">
        <Routes>
          <Route path="/login/change-password" element={<ChangePasswordPage />} />
          <Route path="*" element={<ChangePasswordPage />} />
        </Routes>
      </div>
    );
  }

  return (
    <div className="app-shell app-shell--with-sidebar">
      <AppLayout user={user} onLogout={logout}>
        <Routes>
          <Route path="/" element={<DashboardRoute />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/settings/users" element={<UsersAdminPage />} />
          <Route path="/login/change-password" element={<Navigate to="/" replace />} />
          <Route path="/triage" element={<TriagePage />} />
          <Route path="/triage/new" element={<TriageCreatePage />} />
          <Route path="/triage/:id" element={<TriageDetailPage />} />
          <Route path="/expenses" element={<ExpensesPage />} />
          <Route path="/expenses/:id" element={<ExpenseEditPage />} />
          <Route path="/incidents" element={<IncidentsPage />} />
          <Route path="/incidents/new" element={<IncidentCreatePage />} />
          <Route path="/incidents/:id" element={<IncidentDetailPage />} />
          <Route path="/surveys" element={<SurveysPage />} />
          <Route path="/surveys/new" element={<SurveyEditPage />} />
          <Route path="/surveys/:id/edit" element={<SurveyEditPage />} />
          <Route path="/surveys/:id/results" element={<SurveyResultsPage />} />
          <Route path="/surveys/:id/invitations" element={<SurveyInvitationsPage />} />
          <Route path="/planning" element={<PlanningPage />} />
          <Route path="/planning/:id" element={<PlanningEditPage />} />
          <Route path="/developers" element={<DevManagementPage />} />
          <Route path="/developers/:id" element={<DevEditPage />} />
          <Route path="/team-management" element={<TeamManagementPage />} />
          <Route path="/teams" element={<Navigate to="/team-management" replace />} />
          <Route path="/priority" element={<PriorityPage />} />
          <Route path="/standup" element={<StandupPage />} />
          <Route path="/insights" element={<InsightsPage />} />
          <Route path="/decisions" element={<DecisionsPage />} />
          <Route path="/apps" element={<AppsIndexPage />} />
          <Route path="/apps/registration" element={<AppRegistrationsPage />} />
          <Route path="/apps/ai" element={<AiSettingsPage />} />
          <Route path="/apps/ai/chat" element={<AskHelmChatPage />} />
          <Route path="/apps/ai/review" element={<AiReviewQueuePage />} />
          <Route path="/apps/ai/voice" element={<VoiceAssistantPage />} />
          <Route path="/settings/ai" element={<AiSettingsPage />} />
          <Route path="/apps/outlook" element={<OutlookPage />} />
          <Route path="/apps/todo" element={<TodoPage />} />
          <Route path="/apps/clickup" element={<ClickUpPage />} />
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
          <Route path="/catalog" element={<CatalogOverviewPage />} />
          <Route path="/catalog/repositories" element={<CatalogRepositoriesPage />} />
          <Route path="/catalog/repositories/new" element={<CatalogRegisterRepositoryPage />} />
          <Route path="/catalog/repositories/:id" element={<CatalogRepositoryDetailPage />} />
          <Route path="/catalog/imports" element={<CatalogImportsPage />} />
          <Route path="/catalog/integrations" element={<CatalogIntegrationsPage />} />
          <Route path="/catalog/gaps" element={<CatalogGapsPage />} />
          <Route path="/catalog/policies" element={<CatalogPoliciesPage />} />
          <Route path="/catalog/sync" element={<CatalogSyncPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppLayout>
    </div>
  );
}
