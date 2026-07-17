import type { Prisma } from "@prisma/client";
import { DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT } from "@office/types";

export type ParsedListQuery = {
  page: number;
  limit: number;
  skip: number;
  q: string;
};

export function parseListQuery(
  query: Record<string, string | undefined>,
  opts?: { defaultLimit?: number; maxLimit?: number },
): ParsedListQuery {
  const defaultLimit = opts?.defaultLimit ?? DEFAULT_LIST_LIMIT;
  const maxLimit = opts?.maxLimit ?? MAX_LIST_LIMIT;
  const pageRaw = Number.parseInt(query.page ?? "1", 10);
  const limitRaw = Number.parseInt(query.limit ?? String(defaultLimit), 10);
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
  const limit = Number.isFinite(limitRaw)
    ? Math.min(maxLimit, Math.max(1, limitRaw))
    : defaultLimit;
  const skip = (page - 1) * limit;
  const q = (query.q ?? "").trim();
  return { page, limit, skip, q };
}

export function totalPages(total: number, limit: number): number {
  if (total <= 0) return 1;
  return Math.ceil(total / limit);
}

export function withPageMeta<T extends Record<string, unknown>>(
  payload: T,
  page: number,
  limit: number,
  total: number,
): T & { page: number; limit: number; total: number; totalPages: number } {
  return {
    ...payload,
    page,
    limit,
    total,
    totalPages: totalPages(total, limit),
  };
}

export function containsSearch(q: string, field: string): Record<string, Prisma.StringFilter> {
  return { [field]: { contains: q, mode: "insensitive" } };
}

export function searchOrClause(
  q: string,
  clauses: Prisma.TriageItemWhereInput[],
): Prisma.TriageItemWhereInput | undefined {
  const term = q.trim();
  if (!term) return undefined;
  return { OR: clauses };
}
