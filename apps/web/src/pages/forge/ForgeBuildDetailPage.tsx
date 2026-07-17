import { useParams } from "react-router-dom";
import { Card, Stack, Text } from "@mantine/core";
import { PageHeader } from "../../components/PageHeader";

export function ForgeBuildDetailPage() {
  const { id } = useParams<{ id: string }>();

  return (
    <Stack gap="lg">
      <PageHeader
        eyebrow="Forge"
        title="Build details"
        lead={id ? `Request ${id}` : "Build request"}
      />
      <Card withBorder padding="lg" radius="md">
        <Text c="dimmed">Build timeline, logs, and artifacts — Loop 13+.</Text>
      </Card>
    </Stack>
  );
}
