import { useEffect, useMemo, useState } from "react";

export function useClientPagination<T>(
  items: T[],
  pageSize: number,
  resetKey: string | number = ""
) {
  const [page, setPage] = useState(0);
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1);

  useEffect(() => {
    setPage(0);
  }, [resetKey, pageSize]);

  useEffect(() => {
    setPage((p) => Math.min(p, totalPages - 1));
  }, [totalPages]);

  const pageItems = useMemo(() => {
    const start = page * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, page, pageSize]);

  const from = total === 0 ? 0 : page * pageSize + 1;
  const to = total === 0 ? 0 : Math.min((page + 1) * pageSize, total);

  return {
    page,
    setPage,
    pageItems,
    totalPages,
    total,
    from,
    to
  };
}
