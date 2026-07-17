import { Link } from "react-router-dom";
import { Button, Card, Stack, Text } from "@mantine/core";
import { PageHeader } from "../../components/PageHeader";

export function ForgeBuildsPage() {
  return (
    <Stack gap="lg">
      <PageHeader
        eyebrow="Forge"
        title="Builds"
        lead="History of demo and mock Flutter build requests."
        actions={
          <Button component={Link} to="/forge/builds/new">
            Request build
          </Button>
        }
      />
      <Card withBorder padding="lg" radius="md">
        <Text c="dimmed">No build requests yet. Implementation Loop 7+.</Text>
      </Card>
    </Stack>
  );
}
