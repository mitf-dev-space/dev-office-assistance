import type { ReactNode } from "react";
import { Group, Pagination, Select, Text, TextInput } from "@mantine/core";
import { useId } from "react";

type ListQueryBarProps = {
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  /** Filter controls rendered beside search (selects, date inputs, etc.). */
  children?: ReactNode;
  activeFilterCount?: number;
  onClearFilters?: () => void;
};

export function ListQueryBar({
  search,
  onSearchChange,
  searchPlaceholder = "Search…",
  children,
  activeFilterCount = 0,
  onClearFilters,
}: ListQueryBarProps) {
  const searchId = useId();
  return (
    <div className="list-query-bar" role="search">
      <Group align="flex-end" wrap="wrap" gap="sm">
        <TextInput
          id={searchId}
          label="Search"
          placeholder={searchPlaceholder}
          value={search}
          onChange={(e) => onSearchChange(e.currentTarget.value)}
          style={{ flex: "1 1 220px", minWidth: 200, maxWidth: 360 }}
          aria-label={searchPlaceholder}
        />
        {children}
        {activeFilterCount > 0 && onClearFilters && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClearFilters}>
            Clear filters ({activeFilterCount})
          </button>
        )}
      </Group>
    </div>
  );
}

type TablePaginationProps = {
  page: number;
  totalPages: number;
  total: number;
  limit: number;
  onPageChange: (page: number) => void;
  onLimitChange?: (limit: number) => void;
  limitOptions?: number[];
};

export function TablePagination({
  page,
  totalPages,
  total,
  limit,
  onPageChange,
  onLimitChange,
  limitOptions = [10, 25, 50, 100],
}: TablePaginationProps) {
  if (total <= 0) return null;

  const from = (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);

  return (
    <div className="table-pagination" aria-label="Table pagination">
      <Text size="sm" c="dimmed">
        {from}–{to} of {total}
      </Text>
      <Group gap="sm" wrap="wrap">
        {onLimitChange && (
          <Select
            label="Rows"
            aria-label="Rows per page"
            data={limitOptions.map(String)}
            value={String(limit)}
            onChange={(v) => {
              if (v) onLimitChange(Number(v));
            }}
            w={88}
            size="xs"
          />
        )}
        <Pagination value={page} total={totalPages} onChange={onPageChange} size="sm" />
      </Group>
    </div>
  );
}
