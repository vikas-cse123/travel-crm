/**
 * Categorical chart palette (Phase 16).
 *
 * Derived from the Interscale brand blues plus complementary operational tones,
 * not TravelEnfield's colours. Values cycle for series beyond the list length.
 */
export const CHART_COLORS = [
  '#2563eb', // brand-600
  '#0ea5e9', // sky-500
  '#14b8a6', // teal-500
  '#f59e0b', // amber-500
  '#8b5cf6', // violet-500
  '#ec4899', // pink-500
  '#22c55e', // green-500
  '#ef4444', // red-500
  '#64748b', // slate-500
  '#eab308', // yellow-500
  '#06b6d4', // cyan-500
  '#a855f7', // purple-500
] as const;

export const colorAt = (index: number) => CHART_COLORS[index % CHART_COLORS.length];
