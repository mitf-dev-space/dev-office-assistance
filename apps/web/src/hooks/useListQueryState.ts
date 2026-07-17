import { useCallback, useMemo, useState } from "react";
import { useDebouncedValue } from "./useDebouncedValue";
import { buildListQuery } from "../lib/listQuery";

export function useListQueryState(initialLimit = 25) {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(initialLimit);
  const [searchInput, setSearchInput] = useState("");
  const search = useDebouncedValue(searchInput);

  const resetPage = useCallback(() => setPage(1), []);

  const onSearchChange = useCallback(
    (value: string) => {
      setSearchInput(value);
      setPage(1);
    },
    [],
  );

  const onLimitChange = useCallback((next: number) => {
    setLimit(next);
    setPage(1);
  }, []);

  return {
    page,
    setPage,
    limit,
    setLimit: onLimitChange,
    searchInput,
    search,
    onSearchChange,
    resetPage,
  };
}

export function useListUrl(
  path: string,
  params: {
    page: number;
    limit: number;
    search: string;
    filters?: Record<string, string | undefined>;
  },
) {
  return useMemo(() => {
    const qs = buildListQuery(params);
    return `${path}?${qs}`;
  }, [path, params.page, params.limit, params.search, params.filters]);
}
