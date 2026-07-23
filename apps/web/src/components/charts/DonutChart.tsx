import { colorAt } from './palette';

export interface DonutSlice {
  label: string;
  value: number;
}

/**
 * Dependency-free SVG donut. The chart is decorative — every value is also
 * shown in the accompanying legend/table — so it is marked aria-hidden and the
 * comprehension does not depend on colour alone.
 */
export function DonutChart({ data, size = 132 }: { data: DonutSlice[]; size?: number }) {
  const total = data.reduce((sum, slice) => sum + slice.value, 0);
  const radius = size / 2;
  const stroke = size * 0.16;
  const inner = radius - stroke / 2;
  const circumference = 2 * Math.PI * inner;

  if (total <= 0) {
    return (
      <div
        className="flex items-center justify-center text-xs text-slate-400"
        style={{ height: size, width: size }}
      >
        No data
      </div>
    );
  }

  let offset = 0;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-hidden="true"
      className="shrink-0"
    >
      <g transform={`rotate(-90 ${radius} ${radius})`}>
        {data.map((slice, index) => {
          const fraction = slice.value / total;
          const dash = fraction * circumference;
          const segment = (
            <circle
              key={slice.label}
              cx={radius}
              cy={radius}
              r={inner}
              fill="none"
              stroke={colorAt(index)}
              strokeWidth={stroke}
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeDashoffset={-offset}
            />
          );
          offset += dash;
          return segment;
        })}
      </g>
      <text
        x="50%"
        y="50%"
        dominantBaseline="central"
        textAnchor="middle"
        className="fill-slate-900 text-lg font-semibold"
      >
        {total}
      </text>
    </svg>
  );
}
