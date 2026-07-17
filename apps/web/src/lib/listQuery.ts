import type { PageMeta } from "@office/types";

export type PaginatedEnvelope<TKey extends string, TItem> = PageMeta &
  Record<TKey, TItem[]>;

export function pickPageMeta(data: PageMeta | undefined): PageMeta {
  return {
    page: data?.page ?? 1,
    limit: data?.limit ?? 25,
    total: data?.total ?? 0,
    totalPages: data?.totalPages ?? 1,
  };
}

export function buildListQuery(params: {
  page: number;
  limit: number;
  q?: string;
  filters?: Record<string, string | undefined>;
}): string {
  const p = new URLSearchParams();
  p.set("page", String(params.page));
  p.set("limit", String(params.limit));
  if (params.q?.trim()) p.set("q", params.q.trim());
  if (params.filters) {
    for (const [key, value] of Object.entries(params.filters)) {
      if (value?.trim()) p.set(key, value.trim());
    }
  }
  return p.toString();
}
