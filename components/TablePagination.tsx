type TablePaginationProps = {
  page: number;
  totalPages: number;
  setPage: (page: number) => void;
  from: number;
  to: number;
  total: number;
  pageSize: number;
  pageSizeOptions?: number[];
  onPageSizeChange?: (size: number) => void;
};

export function TablePagination({
  page,
  totalPages,
  setPage,
  from,
  to,
  total,
  pageSize,
  pageSizeOptions = [25, 50, 100],
  onPageSizeChange
}: TablePaginationProps) {
  if (total === 0) return null;

  return (
    <div className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 sm:flex-row sm:items-center sm:justify-between">
      <p>
        Showing{" "}
        <span className="font-semibold text-slate-900">
          {from}–{to}
        </span>{" "}
        of <span className="font-semibold text-slate-900">{total}</span>
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {onPageSizeChange && (
          <label className="flex items-center gap-2 text-slate-600">
            <span className="whitespace-nowrap">Rows per page</span>
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="rounded-md border border-slate-300 bg-white px-2 py-1 text-slate-900"
            >
              {pageSizeOptions.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={page <= 0}
            onClick={() => setPage(page - 1)}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-800 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Previous
          </button>
          <span className="px-2 tabular-nums text-slate-600">
            Page {page + 1} / {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages - 1}
            onClick={() => setPage(page + 1)}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-800 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
