import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, type PaginationMeta } from '@interscale/shared';

/** Normalised paging input, already clamped to safe bounds. */
export interface PaginationParams {
  page: number;
  pageSize: number;
}

/**
 * Clamp caller-supplied paging values.
 *
 * `pageSize` is capped at MAX_PAGE_SIZE so a request cannot ask for the entire
 * table and turn pagination into a denial-of-service lever.
 */
export function resolvePagination(input: {
  page?: number | undefined;
  pageSize?: number | undefined;
}): PaginationParams {
  const page = Math.max(1, Math.trunc(input.page ?? 1));
  const requested = Math.trunc(input.pageSize ?? DEFAULT_PAGE_SIZE);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, requested));
  return { page, pageSize };
}

/** Translate page/pageSize into Prisma's skip/take. */
export function toPrismaPagination(params: PaginationParams): { skip: number; take: number } {
  return { skip: (params.page - 1) * params.pageSize, take: params.pageSize };
}

/** Build the pagination envelope returned alongside a collection. */
export function buildPaginationMeta(params: PaginationParams, total: number): PaginationMeta {
  return {
    page: params.page,
    pageSize: params.pageSize,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / params.pageSize),
  };
}
