import { useQuery } from "@tanstack/react-query";
import type { ForgeDashboardDto } from "@office/types";
import { useApi } from "../../useApi";
import { ForgeDashboardPageContent } from "./ForgeOverview";

export function ForgeDashboardPage() {
  const { request } = useApi();
  const dashboardQuery = useQuery({
    queryKey: ["forge", "dashboard"],
    queryFn: async () => {
      const res = await request("/api/forge/dashboard");
      if (!res.ok) throw new Error("forge_dashboard_failed");
      return (await res.json()) as ForgeDashboardDto;
    },
    refetchInterval: 8000,
  });

  return (
    <ForgeDashboardPageContent
      stats={dashboardQuery.data}
      loading={dashboardQuery.isLoading}
      error={dashboardQuery.isError}
    />
  );
}
