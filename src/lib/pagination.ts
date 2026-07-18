export interface PaginationParams {
  page: number;
  limit: number;
  skip: number;
}

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/** `skip` for a Prisma `findMany`, given an already-validated page/limit
 *  (e.g. from a Zod query schema) — the one formula every repository's
 *  `findMany` needs, kept in one place instead of restated per repository. */
export function toSkip(page: number, limit: number): number {
  return (page - 1) * limit;
}

export function parsePagination(searchParams: URLSearchParams): PaginationParams {
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "10", 10)));
  const skip = toSkip(page, limit);
  return { page, limit, skip };
}

export function buildMeta(total: number, page: number, limit: number): PaginationMeta {
  return {
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}
