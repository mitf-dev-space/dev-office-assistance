import { Tabs } from "@mantine/core";
import { AppPage } from "../../components/ui/AppPage";
import { PageHeader } from "../../components/PageHeader";
import { ForgeApplicationsPanel } from "./ForgeApplicationsPanel";
import { ForgeBanksPanel } from "./ForgeBanksPanel";
import { ForgeBuildProfilesPanel } from "./ForgeBuildProfilesPanel";
import { ForgeRunnersPanel } from "./ForgeRunnersPanel";

export function ForgeAdminPage() {
  return (
    <AppPage variant="forge">
      <PageHeader
        eyebrow="Forge"
        title="Administration"
        lead="Banks, applications, build profiles, and runners."
      />
      <section className="card" aria-label="Forge administration">
        <Tabs defaultValue="banks" keepMounted={false}>
          <Tabs.List mb="md">
            <Tabs.Tab value="banks">Banks</Tabs.Tab>
            <Tabs.Tab value="applications">Applications</Tabs.Tab>
            <Tabs.Tab value="profiles">Build profiles</Tabs.Tab>
            <Tabs.Tab value="runners">Runners</Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="banks">
            <ForgeBanksPanel />
          </Tabs.Panel>
          <Tabs.Panel value="applications">
            <ForgeApplicationsPanel />
          </Tabs.Panel>
          <Tabs.Panel value="profiles">
            <ForgeBuildProfilesPanel />
          </Tabs.Panel>
          <Tabs.Panel value="runners">
            <ForgeRunnersPanel />
          </Tabs.Panel>
        </Tabs>
      </section>
    </AppPage>
  );
}
