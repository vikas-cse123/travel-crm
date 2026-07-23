export interface BarDatum {
  label: string;
  value: number;
}

/**
 * Accessible horizontal bar list. Rendered as a list of labelled rows with a
 * proportional bar and the numeric value beside it, so it reads correctly
 * without relying on the bar widths alone.
 */
export function HorizontalBarChart({
  data,
  valueSuffix = '',
}: {
  data: BarDatum[];
  valueSuffix?: string;
}) {
  if (!data.length) return <p className="text-xs text-slate-400">No data</p>;
  const max = Math.max(...data.map((row) => row.value), 1);
  return (
    <ul className="space-y-2">
      {data.map((row) => (
        <li key={row.label}>
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="truncate text-slate-700" title={row.label}>
              {row.label}
            </span>
            <span className="shrink-0 font-medium text-slate-900">
              {row.value}
              {valueSuffix}
            </span>
          </div>
          <div
            className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100"
            role="img"
            aria-label={`${row.label}: ${row.value}${valueSuffix}`}
          >
            <div
              className="h-full rounded-full bg-brand-500"
              style={{ width: `${Math.max(4, (row.value / max) * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
