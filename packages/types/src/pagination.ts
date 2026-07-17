/** Shared list pagination metadata returned by Helm list APIs. */
export type PageMeta = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export type PaginatedList<TItem> = PageMeta & {
  items: TItem[];
};

/** Query params supported on most list endpoints. */
export type ListQueryParams = {
  page?: number;
  limit?: number;
  /** Free-text search (case-insensitive contains on key fields). */
  q?: string;
};

export const DEFAULT_LIST_LIMIT = 25;
export const MAX_LIST_LIMIT = 100;
