import type { LucideIcon } from 'lucide-react';
import { CalendarClock, CheckCircle2, Clock3, Siren } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/utils/cn';

export const fieldClass =
  'h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none focus:border-brand-500';

export function SummaryCards({
  items,
}: {
  items: Array<{
    label: string;
    value: number;
    tone: 'blue' | 'amber' | 'red' | 'green';
    icon?: LucideIcon;
  }>;
}) {
  const colors = {
    blue: 'border-blue-200 bg-blue-50 text-blue-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-700',
    red: 'border-red-200 bg-red-50 text-red-700',
    green: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  };
  const icons = { blue: CalendarClock, amber: Clock3, red: Siren, green: CheckCircle2 };
  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => {
        const Icon = item.icon ?? icons[item.tone];
        return (
          <article
            key={item.label}
            className={cn('rounded-xl border p-4 shadow-sm', colors[item.tone])}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide opacity-75">
                  {item.label}
                </p>
                <p className="mt-2 text-3xl font-semibold">{item.value}</p>
              </div>
              <Icon className="h-8 w-8 opacity-60" />
            </div>
          </article>
        );
      })}
    </section>
  );
}

const statusColors: Record<string, string> = {
  ACTIVE: 'bg-blue-100 text-blue-700',
  OVERDUE: 'bg-red-100 text-red-700',
  SNOOZED: 'bg-amber-100 text-amber-700',
  COMPLETED: 'bg-emerald-100 text-emerald-700',
  CANCELLED: 'bg-slate-100 text-slate-600',
  UNREAD: 'bg-brand-100 text-brand-700',
  READ: 'bg-slate-100 text-slate-600',
};
const priorityColors: Record<string, string> = {
  LOW: 'bg-slate-100 text-slate-600',
  MEDIUM: 'bg-blue-100 text-blue-700',
  HIGH: 'bg-orange-100 text-orange-700',
  URGENT: 'bg-red-100 text-red-700',
};
export function Pill({
  children,
  kind = 'status',
}: {
  children: string;
  kind?: 'status' | 'priority';
}) {
  return (
    <span
      className={cn(
        'inline-flex rounded-full px-2.5 py-1 text-xs font-semibold',
        (kind === 'status' ? statusColors : priorityColors)[children] ??
          'bg-violet-100 text-violet-700',
      )}
    >
      {children.replaceAll('_', ' ')}
    </span>
  );
}
export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="text-sm font-medium text-brand-700">{eyebrow}</p>
        <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      </div>
      {action}
    </header>
  );
}
export function EmptyState({
  title,
  message,
  action,
}: {
  title: string;
  message: string;
  action?: { to: string; label: string };
}) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
      <CalendarClock className="mx-auto h-10 w-10 text-slate-300" />
      <h2 className="mt-3 font-semibold text-slate-800">{title}</h2>
      <p className="mt-1 text-sm text-slate-500">{message}</p>
      {action && (
        <Link
          className="mt-4 inline-flex rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white"
          to={action.to}
        >
          {action.label}
        </Link>
      )}
    </div>
  );
}
