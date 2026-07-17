import { Link } from "react-router-dom";
import { Alert, Button, Card, SimpleGrid, Stack, Text } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import type { ForgeDashboardDto } from "@office/types";
import { PageHeader } from "../../components/PageHeader";
import { useApi } from "../../useApi";

export function ForgeDashboardPage() {
  const { request } = useApi();
  const dashboardQuery = useQuery({
    queryKey: ["forge", "dashboard"],
    queryFn: async () => {
      const res = await request("/api/forge/dashboard");
      if (!res.ok) throw new Error("forge_dashboard_failed");
      return (await res.json()) as ForgeDashboardDto;
    },
  });

  const stats = dashboardQuery.data;

  return (
    <Stack gap="lg">
      <PageHeader
        eyebrow="Forge"
        title="Forge"
        lead="Self-service demo and mock Flutter mobile builds for project management."
      />
      <Alert color="blue" title="Forge module">
        Banks admin is live (Loop 5). Build execution, Git integration, and runners land in PRD
        Loops 6–18. Use Request build to preview the PM flow.
      </Alert>
      {dashboardQuery.isError && (
        <Text role="alert" c="red">
          Could not load Forge dashboard.
        </Text>
      )}
      <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }} spacing="md">
        {[
          ["Queued", stats?.queuedBuilds ?? "—"],
          ["Running", stats?.runningBuilds ?? "—"],
          ["Waiting for macOS", stats?.waitingForMacOs ?? "—"],
          ["Runners online", stats?.onlineRunners ?? "—"],
        ].map(([label, value]) => (
          <Card key={label} withBorder padding="md" radius="md">
            <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
              {label}
            </Text>
            <Text size="xl" fw={700} mt={4}>
              {value}
            </Text>
          </Card>
        ))}
      </SimpleGrid>
      <GroupActions />
    </Stack>
  );
}

function GroupActions() {
  return (
    <Stack gap="sm">
      <Button component={Link} to="/forge/builds/new">
        Request build
      </Button>
      <Button component={Link} to="/forge/builds" variant="light">
        View builds
      </Button>
    </Stack>
  );
}
