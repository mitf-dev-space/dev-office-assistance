import { Card, Stack, Text } from "@mantine/core";
import { PageHeader } from "../../components/PageHeader";

export function ForgeRequestBuildPage() {
  return (
    <Stack gap="lg">
      <PageHeader
        eyebrow="Forge"
        title="Request build"
        lead="Select bank, application, branch, profile, and platforms. Form lands in Loop 7."
      />
      <Card withBorder padding="lg" radius="md">
        <Text c="dimmed">
          Build request submission is not wired yet. Administrators must register applications and
          build profiles first (Loop 5–6).
        </Text>
      </Card>
    </Stack>
  );
}
