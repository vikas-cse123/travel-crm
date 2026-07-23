import { colorAt } from './palette';

export interface LegendItem {
  label: string;
  value: number;
  hint?: string;
}

/** Text legend that carries the real values for a donut/pie chart. */
export function ChartLegend({ items }: { items: LegendItem[] }) {
  if (!items.length) return <p className="text-xs text-slate-400">No data</p>;
  return (
    <ul className="space-y-1.5 text-sm">
      {items.map((item, index) => (
        <li key={item.label} className="flex items-center justify-between gap-3">
          <span className="flex min-w-0 items-center gap-2">
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ backgroundColor: colorAt(index) }}
            />
            <span className="truncate text-slate-700">{item.label}</span>
          </span>
          <span className="shrink-0 font-medium text-slate-900">
            {item.value}
            {item.hint ? <span className="ml-1 text-xs text-slate-400">{item.hint}</span> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}
