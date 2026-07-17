import type { CSSProperties, ReactNode } from "react";
import { Group, Skeleton, Stack } from "@mantine/core";
import { AppDataTableSkeleton } from "../ui/AppDataTable";

const busy = (label: string) =>
  ({ role: "status" as const, "aria-busy": true, "aria-label": label } as const);

export function MetricStripSkeleton({
  count = 4,
  style,
  label = "Loading metrics",
}: {
  count?: number;
  style?: CSSProperties;
  label?: string;
}) {
  return (
    <div className="metric-strip" style={style} {...busy(label)}>
      {Array.from({ length: count }, (_, i) => (
        <div className="metric" key={i}>
          <Skeleton height={28} width="55%" maw={72} style={{ minHeight: 28 }} />
          <Skeleton height={12} width="75%" mt={6} />
        </div>
      ))}
    </div>
  );
}

export function SnapshotGridSkeleton() {
  return (
    <div className="snapshot-grid" {...busy("Loading org metrics")}>
      <div className="snapshot-block">
        <Skeleton height={20} width={100} maw={120} mb="md" />
        <MetricStripSkeleton count={3} />
      </div>
      <div className="snapshot-block">
        <Skeleton height={20} width={100} maw={120} mb="md" />
        <MetricStripSkeleton count={3} />
      </div>
      <div className="snapshot-block snapshot-block--wide">
        <Skeleton height={20} width={160} maw={200} mb="md" />
        <MetricStripSkeleton count={2} />
        <Stack gap="xs" mt="md">
          {Array.from({ length: 4 }, (_, j) => (
            <Group key={j} justify="space-between" wrap="nowrap" gap="md">
              <Skeleton height={16} w="40%" />
              <Skeleton height={16} w={32} />
            </Group>
          ))}
        </Stack>
      </div>
    </div>
  );
}

type DataTableSkeletonProps = {
  columns: number;
  /** When set, shows stable column headers (recommended for main tables). */
  columnLabels?: string[];
  rows?: number;
  className?: string;
  tableLabel?: string;
};

export function DataTableSkeleton({
  columns,
  columnLabels,
  rows = 5,
  className,
  tableLabel = "Loading table",
  embedded = false,
}: DataTableSkeletonProps & { embedded?: boolean }) {
  void className;
  return (
    <AppDataTableSkeleton
      columns={columns}
      columnLabels={columnLabels}
      rows={rows}
      embedded={embedded}
      tableLabel={tableLabel}
    />
  );
}

export function FormFieldsSkeleton({ count = 6 }: { count?: number }) {
  return (
    <Stack gap="md" mt={4}>
      {Array.from({ length: count }, (_, i) => (
        <div className="field" key={i}>
          <Skeleton height={12} width="22%" mb={8} />
          <Skeleton height={40} />
        </div>
      ))}
    </Stack>
  );
}

export function ProfileLineSkeleton() {
  return (
    <div className="muted" style={{ margin: "0 0 0.75rem" }} {...busy("Loading profile")}>
      <Skeleton height={20} width="100%" maw={320} style={{ display: "block" }} />
    </div>
  );
}

export function EditPageFormSkeleton({
  fieldsCount = 6,
  showCardTitle = true,
  cardTitleWidth = 120,
  lead,
}: {
  fieldsCount?: number;
  showCardTitle?: boolean;
  cardTitleWidth?: number;
  lead?: ReactNode;
}) {
  return (
    <div className="app-page" {...busy("Loading")}>
      <div style={{ marginBottom: "1.5rem" }}>
        <Skeleton h={12} w={100} mb="sm" />
        <Skeleton h={36} w="45%" maw={400} mb="sm" />
        {lead ?? <Skeleton h={16} w={200} />}
      </div>
      <div className="card">
        {showCardTitle && (
          <div className="card__head">
            <Skeleton h={22} w={cardTitleWidth} />
          </div>
        )}
        <FormFieldsSkeleton count={fieldsCount} />
        <div style={{ marginTop: "1.25rem" }}>
          <Skeleton h={40} w={100} maw={120} />
        </div>
      </div>
    </div>
  );
}

export function TriageDetailPageSkeleton() {
  return (
    <div className="app-page" {...busy("Loading item")}>
      <div style={{ marginBottom: "1.5rem" }}>
        <Skeleton h={12} w={80} mb="sm" />
        <Skeleton h={36} w="55%" maw={480} mb="sm" />
        <Skeleton h={16} w="100%" maw={560} />
      </div>
      <div className="card">
        <div className="card__head">
          <Skeleton h={22} w={100} />
        </div>
        <FormFieldsSkeleton count={9} />
        <div style={{ marginTop: "1rem" }}>
          <Skeleton h={40} w={100} maw={100} />
        </div>
      </div>
      <div className="card" style={{ marginTop: "1.25rem" }}>
        <div className="card__head">
          <Skeleton h={22} w={120} />
        </div>
        <Stack gap="sm">
          {Array.from({ length: 2 }, (_, i) => (
            <Group key={i} justify="space-between" wrap="nowrap" gap="md">
              <Stack gap={4} style={{ flex: 1 }}>
                <Skeleton h={16} w="50%" />
                <Skeleton h={12} w="30%" />
              </Stack>
              <Skeleton h={32} w={180} />
            </Group>
          ))}
        </Stack>
        <div className="field" style={{ marginTop: "1rem" }}>
          <Skeleton h={12} w={64} mb={8} />
          <Skeleton h={40} />
        </div>
      </div>
    </div>
  );
}

function TeamAddRowSkeleton() {
  return (
    <li className="tm-add__row">
      <Skeleton height={40} width={40} style={{ borderRadius: "50%" }} />
      <span className="tm-add__text">
        <Skeleton height={16} width="55%" maw={200} />
        <Skeleton height={12} width="75%" maw={260} mt={6} />
      </span>
      <Skeleton height={36} width={64} />
    </li>
  );
}

export function TeamAddListSkeleton() {
  return (
    <ul className="tm-add__list" {...busy("Loading directory")}>
      <TeamAddRowSkeleton />
      <TeamAddRowSkeleton />
      <TeamAddRowSkeleton />
    </ul>
  );
}

export function ExpenseEditPageSkeleton() {
  return (
    <div className="app-page" {...busy("Loading expense")}>
      <div style={{ marginBottom: "1.5rem" }}>
        <Skeleton h={12} w={90} mb="sm" />
        <Skeleton h={36} w="50%" maw={400} mb="sm" />
        <Skeleton h={16} w="100%" maw={480} />
      </div>
      <div className="card">
        <div className="card__head">
          <Skeleton h={22} w={100} />
        </div>
        <FormFieldsSkeleton count={5} />
        <Group gap="sm" mt="md">
          <Skeleton h={40} w={100} maw={90} />
          <Skeleton h={40} w={100} maw={100} />
        </Group>
      </div>
      <div className="card" style={{ marginTop: "1.25rem" }}>
        <div className="card__head">
          <Skeleton h={22} w={100} />
        </div>
        <FormFieldsSkeleton count={1} />
      </div>
    </div>
  );
}

export function TeamStatsRowSkeleton() {
  return (
    <div className="tm-stats" {...busy("Loading team stats")}>
      {Array.from({ length: 6 }, (_, i) => (
        <div className="tm-stat" key={i}>
          <Skeleton className="tm-stat__n" height={28} w={32} maw={48} style={{ minHeight: 28 }} />
          <Skeleton className="tm-stat__label" height={12} w="100%" maw={100} />
        </div>
      ))}
    </div>
  );
}

function TeamOnePanelSkeleton() {
  return (
    <section className="card tm-panel">
      <div className="tm-panel__head">
        <div>
          <Skeleton h={24} w={200} maw="70%" />
        </div>
        <div style={{ minWidth: "8rem" }}>
          <Skeleton h={40} />
        </div>
      </div>
      <AppDataTableSkeleton
        embedded
        columns={5}
        columnLabels={["", "Name", "Role", "Lead", "Action"]}
        rows={3}
        tableLabel="Loading team roster"
      />
    </section>
  );
}

export function TeamPanelsSkeleton() {
  return (
    <div className="tm-panels" {...busy("Loading team rosters")}>
      {Array.from({ length: 4 }, (_, i) => (
        <TeamOnePanelSkeleton key={i} />
      ))}
    </div>
  );
}

export function OutlookFormSkeleton() {
  return (
    <Stack gap="md" mt={0} {...busy("Loading mail folders")}>
      <div className="field">
        <Skeleton h={12} w={64} mb={8} />
        <Skeleton h={40} />
      </div>
      <div className="field">
        <Skeleton h={12} w={120} mb={8} />
        <Skeleton h={40} w={100} maw={120} />
      </div>
    </Stack>
  );
}

export function SingleFieldSkeleton({ label = "Loading" }: { label?: string }) {
  return (
    <div className="field" {...busy(label)}>
      <Skeleton height={12} width="18%" mb={8} />
      <Skeleton height={40} />
    </div>
  );
}

export function CardPlaceholderSkeleton() {
  return (
    <div className="card" style={{ textAlign: "left" as const }} {...busy("Loading")}>
      <Stack gap="md">
        <Skeleton h={20} w="100%" maw={280} />
        <Skeleton h={16} w="100%" maw={400} />
        <Skeleton h={40} w={100} maw={200} />
      </Stack>
    </div>
  );
}
