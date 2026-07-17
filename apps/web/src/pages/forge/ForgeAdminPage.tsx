import { Card, Stack, Tabs, Text } from "@mantine/core";
import { PageHeader } from "../../components/PageHeader";
import { ForgeBanksPanel } from "./ForgeBanksPanel";

function PlaceholderPanel({ title, loop }: { title: string; loop: string }) {
  return (
    <Card withBorder padding="lg" radius="md">
      <Text fw={600}>{title}</Text>
      <Text size="sm" c="dimmed" mt="xs">
        {loop}
      </Text>
    </Card>
  );
}

export function ForgeAdminPage() {
  return (
    <Stack gap="lg">
      <PageHeader
        eyebrow="Forge"
        title="Forge administration"
        lead="Banks, applications, build profiles, signing references, and runners."
      />
      <Tabs defaultValue="banks">
        <Tabs.List>
          <Tabs.Tab value="banks">Banks</Tabs.Tab>
          <Tabs.Tab value="applications">Applications</Tabs.Tab>
          <Tabs.Tab value="profiles">Build profiles</Tabs.Tab>
          <Tabs.Tab value="runners">Runners</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="banks" pt="md">
          <ForgeBanksPanel />
        </Tabs.Panel>
        <Tabs.Panel value="applications" pt="md">
          <PlaceholderPanel title="Applications" loop="Git repository registration — Loop 6." />
        </Tabs.Panel>
        <Tabs.Panel value="profiles" pt="md">
          <PlaceholderPanel title="Build profiles" loop="Android/iOS signing and flavor config — Loop 8." />
        </Tabs.Panel>
        <Tabs.Panel value="runners" pt="md">
          <PlaceholderPanel title="Runners" loop="Worker registration and health — Loop 12." />
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}
