import { Card, SimpleGrid, Stack, Text } from "@mantine/core";
import { PageHeader } from "../../components/PageHeader";

export function ForgeAdminPage() {
  return (
    <Stack gap="lg">
      <PageHeader
        eyebrow="Forge"
        title="Forge administration"
        lead="Banks, applications, build profiles, signing references, and runners."
      />
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
        {["Banks", "Applications", "Build profiles", "Runners"].map((area) => (
          <Card key={area} withBorder padding="lg" radius="md">
            <Text fw={600}>{area}</Text>
            <Text size="sm" c="dimmed" mt="xs">
              CRUD and validation — Loop 5–8.
            </Text>
          </Card>
        ))}
      </SimpleGrid>
    </Stack>
  );
}
