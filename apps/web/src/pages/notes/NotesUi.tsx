import { ClipboardList, Layers3, CalendarDays, Files } from 'lucide-react';
import { labelForLookup } from '@interscale/shared';
import { cn } from '@/utils/cn';
import { formatDateTime12Hour } from '@/utils/dateTime';
import './notes.css';

/** Stage → badge colour, mirroring the reference lead-stage chips. */
const stageColors: Record<string, string> = {
  NEW_LEAD: 'bg-blue-100 text-blue-700',
  CONTACTED: 'bg-teal-100 text-teal-700',
  QUALIFIED: 'bg-indigo-100 text-indigo-700',
  QUOTATION_REQUIRED: 'bg-violet-100 text-violet-700',
  QUOTATION_SENT: 'bg-sky-100 text-sky-700',
  IN_NEGOTIATION: 'bg-amber-100 text-amber-700',
  READY_TO_BOOK: 'bg-orange-100 text-orange-700',
  BOOKING_CONFIRMED: 'bg-emerald-100 text-emerald-700',
  FOLLOW_UP: 'bg-cyan-100 text-cyan-700',
  AMENDMENT: 'bg-fuchsia-100 text-fuchsia-700',
  LOST: 'bg-rose-100 text-rose-700',
  CANCELLED: 'bg-slate-100 text-slate-600',
  INVALID: 'bg-slate-100 text-slate-600',
  ON_HOLD: 'bg-yellow-100 text-yellow-700',
};

export function StagePill({ stage }: { stage: string | null }) {
  if (!stage) return <span className="text-xs text-slate-400">—</span>;
  return (
    <span
      className={cn(
        'inline-flex rounded-full px-2.5 py-1 text-xs font-semibold',
        stageColors[stage] ?? 'bg-slate-100 text-slate-600',
      )}
    >
      {labelForLookup(stage)}
    </span>
  );
}

export function formatDateTime(value: string | null | undefined) {
  return formatDateTime12Hour(value);
}

export function formatDate(value: string | null | undefined) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Four coloured stat tiles for the All Notes dashboard. Unlike the reminders
 * SummaryCards these accept a free-form string (so "Today" can show a date).
 */
export function NoteStatCards({
  totalNotes,
  totalLeads,
  totalPages,
}: {
  totalNotes: number;
  totalLeads: number;
  totalPages: number;
}) {
  const today = new Date().toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  const tiles = [
    {
      label: 'Total Notes',
      value: String(totalNotes),
      tone: 'notes-stat--teal',
      Icon: ClipboardList,
    },
    { label: 'Total Leads', value: String(totalLeads), tone: 'notes-stat--green', Icon: Layers3 },
    { label: 'Today', value: today, tone: 'notes-stat--amber', Icon: CalendarDays },
    { label: 'Total Pages', value: String(totalPages), tone: 'notes-stat--rose', Icon: Files },
  ];
  return (
    <section className="notes-stats" aria-label="Notes statistics">
      {tiles.map(({ label, value, tone, Icon }) => (
        <article key={label} className={cn('notes-stat-card', tone)}>
          <div className="min-w-0">
            <p className="notes-stat-value">{value}</p>
            <p className="notes-stat-label">{label}</p>
          </div>
          <Icon className="notes-stat-icon" aria-hidden="true" />
        </article>
      ))}
    </section>
  );
}
