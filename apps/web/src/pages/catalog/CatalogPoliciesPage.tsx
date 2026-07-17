import { useQuery } from "@tanstack/react-query";
import { Badge, Table, Text } from "@mantine/core";
import { PageHeader } from "../../components/PageHeader";
import { AppPage } from "../../components/ui/AppPage";
import { AppDataTable } from "../../components/ui/AppDataTable";
import { useApi } from "../../useApi";

export function CatalogPoliciesPage() {
  const { request } = useApi();
  const q = useQuery({
    queryKey: ["catalog", "policies"],
    queryFn: async () => {
      const res = await request("/api/catalog/check-definitions");
      if (!res.ok) throw new Error("policies_failed");
      return (await res.json()) as {
        checks: Array<{
          slug: string;
          name: string;
          category: string;
          description?: string | null;
          isRequired: boolean;
        }>;
      };
    },
    retry: false,
  });

  const checks = q.data?.checks ?? [];

  return (
    <AppPage variant="catalog">
      <PageHeader
        eyebrow="Engineering Catalog"
        title="Scorecard policies"
        lead="Repository check definitions used for quality scorecards. Required checks contribute to engineering gap detection after sync."
      />
      <section className="card">
        {q.isLoading && <Text c="dimmed">Loading policies…</Text>}
        {q.isError && (
          <Text c="dimmed">
            Scorecard policy templates are seeded with the catalog. Per-repository scorecards refresh after sync.
          </Text>
        )}
        {!q.isLoading && !q.isError && checks.length === 0 && (
          <Text c="dimmed">No check definitions found. Seed the catalog to load default policies.</Text>
        )}
        {checks.length > 0 && (
          <AppDataTable embedded>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Check</Table.Th>
                <Table.Th>Category</Table.Th>
                <Table.Th>Required</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {checks.map((c) => (
                <Table.Tr key={c.slug}>
                  <Table.Td>
                    <Text fw={600} size="sm">{c.name}</Text>
                    <Text size="xs" c="dimmed">{c.slug}</Text>
                    {c.description && (
                      <Text size="sm" c="dimmed" mt={4}>{c.description}</Text>
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Badge variant="light">{c.category}</Badge>
                  </Table.Td>
                  <Table.Td>
                    <Badge variant="light" color={c.isRequired ? "orange" : "gray"}>
                      {c.isRequired ? "Required" : "Optional"}
                    </Badge>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </AppDataTable>
        )}
      </section>
    </AppPage>
  );
}
