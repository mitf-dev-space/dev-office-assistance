import { Card, Skeleton, Table } from "@mantine/core";
import type { ReactNode } from "react";

export type AppDataTableProps = {
  children: ReactNode;
  /** Omit outer Card when the table sits inside an existing `.card` section. */
  embedded?: boolean;
  scrollMaxHeight?: string;
  className?: string;
  "aria-label"?: string;
};

/**
 * Unified data table shell — Mantine `Table` in a bordered `Card`, matching Forge admin panels.
 */
export function AppDataTable({
  children,
  embedded = false,
  scrollMaxHeight,
  className,
  "aria-label": ariaLabel,
}: AppDataTableProps) {
  const table = (
    <Table striped highlightOnHover verticalSpacing="sm">
      {children}
    </Table>
  );

  const scrolled = scrollMaxHeight ? (
    <div className="app-data-table__scroll" style={{ maxHeight: scrollMaxHeight, overflow: "auto" }}>
      {table}
    </div>
  ) : (
    table
  );

  if (embedded) {
    return (
      <div
        className={["app-data-table-embedded", className].filter(Boolean).join(" ")}
        aria-label={ariaLabel}
      >
        {scrolled}
      </div>
    );
  }

  return (
    <Card withBorder padding={0} radius="md" className={className} aria-label={ariaLabel}>
      {scrolled}
    </Card>
  );
}

export type AppDataTableSkeletonProps = {
  columns: number;
  columnLabels?: string[];
  rows?: number;
  embedded?: boolean;
  tableLabel?: string;
};

export function AppDataTableSkeleton({
  columns,
  columnLabels,
  rows = 5,
  embedded = false,
  tableLabel = "Loading table",
}: AppDataTableSkeletonProps) {
  const table = (
    <Table striped highlightOnHover verticalSpacing="sm">
      <Table.Thead>
        <Table.Tr>
          {Array.from({ length: columns }, (_, i) => (
            <Table.Th key={i}>
              {columnLabels?.[i] ?? <Skeleton height={12} width="70%" />}
            </Table.Th>
          ))}
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {Array.from({ length: rows }, (_, r) => (
          <Table.Tr key={r}>
            {Array.from({ length: columns }, (_, c) => (
              <Table.Td key={c}>
                <Skeleton height={16} width={c === 0 ? "85%" : "70%"} />
              </Table.Td>
            ))}
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );

  const body = (
    <div role="status" aria-busy="true" aria-label={tableLabel}>
      {table}
    </div>
  );

  if (embedded) {
    return <div className="app-data-table-embedded">{body}</div>;
  }

  return (
    <Card withBorder padding={0} radius="md">
      {body}
    </Card>
  );
}
