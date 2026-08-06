import { cn } from '@/utils/cn';
import { getLeadServiceSummary, type LeadServiceSummary } from './lead-services';
import type { Lead } from './queries.api';

/**
 * Modern Services column for the Leads table.
 *
 * Every service actually selected on the lead renders as one compact icon chip
 * (never full text, never a placeholder icon). Chips carry a native tooltip and
 * an accessible label, wrap cleanly inside the cell, and every selected icon is
 * always shown — there is no overflow "+N" collapsing.
 */

const CHIP_CLASSES = cn(
  'relative inline-flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-slate-600',
  'transition-colors duration-150 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-600',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
);

function chipAccessibility(summary: LeadServiceSummary): { ariaLabel: string; tooltip: string } {
  if (summary.count > 1) {
    return {
      ariaLabel: `${summary.label} services: ${summary.count}`,
      tooltip: `${summary.label}: ${summary.count}`,
    };
  }
  return { ariaLabel: `${summary.label} service`, tooltip: summary.label };
}

/** One service icon chip with tooltip, accessible label and optional count badge. */
function LeadServiceChip({ summary }: { summary: LeadServiceSummary }) {
  const Icon = summary.icon;
  const { ariaLabel, tooltip } = chipAccessibility(summary);
  return (
    <span role="img" aria-label={ariaLabel} title={tooltip} tabIndex={0} className={CHIP_CLASSES}>
      <Icon className="h-4 w-4" aria-hidden="true" />
      {summary.count > 1 && (
        <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-600 px-0.5 text-[10px] font-semibold leading-none text-white">
          {summary.count}
        </span>
      )}
    </span>
  );
}

export function LeadServicesCell({ lead }: { lead: Lead }) {
  const summaries = getLeadServiceSummary(lead);
  if (summaries.length === 0) return <span className="text-slate-400">—</span>;

  return (
    <div className="flex min-w-28 flex-wrap items-center gap-1.5">
      {summaries.map((summary) => (
        <LeadServiceChip key={summary.key} summary={summary} />
      ))}
    </div>
  );
}
