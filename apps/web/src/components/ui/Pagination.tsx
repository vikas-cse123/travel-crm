import { cn } from '@/utils/cn';

/**
 * Shared pagination footer used by the Masters tables and the Leads table.
 *
 * Left: `Showing X to Y of Z entries`. Right: Previous / numbered page buttons
 * / Next, with an elided `…` range for large page counts. The active page uses
 * the filled brand-blue treatment; Previous and Next are disabled at the
 * boundaries. This is the single source of the pagination visual contract so
 * Masters and Leads always match.
 */

/** Page numbers to render, with `'…'` markers where the range is elided. */
function pageItems(page: number, totalPages: number): Array<number | '…'> {
  const range = (start: number, end: number) =>
    Array.from({ length: end - start + 1 }, (_, i) => start + i);
  if (totalPages <= 7) return range(1, totalPages);
  if (page <= 3) return [1, 2, 3, 4, '…', totalPages];
  if (page >= totalPages - 2)
    return [1, '…', totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
  return [1, '…', page - 1, page, page + 1, '…', totalPages];
}

export function Pagination({
  page,
  pageSize,
  totalPages,
  total,
  onPage,
}: {
  page: number;
  pageSize: number;
  totalPages: number;
  total: number;
  onPage: (page: number) => void;
}) {
  const pages = Math.max(totalPages, 1);
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const pageButton =
    'inline-flex h-9 min-w-9 items-center justify-center rounded-lg border px-3 text-sm font-medium transition-colors';
  return (
    <div className="flex flex-col gap-3 border-t px-4 py-3 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
      <span>
        Showing {from} to {to} of {total} entries
      </span>
      <nav aria-label="Pagination" className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          className={cn(
            pageButton,
            'border-slate-300 text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50',
          )}
        >
          Previous
        </button>
        {pageItems(page, pages).map((item, index) =>
          item === '…' ? (
            <span
              key={`gap-${index}`}
              className="inline-flex h-9 min-w-9 items-center justify-center px-1 text-slate-400"
            >
              …
            </span>
          ) : (
            <button
              key={item}
              type="button"
              aria-current={item === page ? 'page' : undefined}
              onClick={() => onPage(item)}
              className={cn(
                pageButton,
                item === page
                  ? 'border-brand-600 bg-brand-600 text-white'
                  : 'border-slate-300 text-slate-700 hover:bg-slate-50',
              )}
            >
              {item}
            </button>
          ),
        )}
        <button
          type="button"
          disabled={page >= pages}
          onClick={() => onPage(page + 1)}
          className={cn(
            pageButton,
            'border-slate-300 text-brand-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50',
          )}
        >
          Next
        </button>
      </nav>
    </div>
  );
}
