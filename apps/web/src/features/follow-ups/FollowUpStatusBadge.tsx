import { labelForLookup } from '@interscale/shared';
import { cn } from '@/utils/cn';

export function FollowUpStatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        'inline-flex rounded-full px-2.5 py-1 text-xs font-semibold',
        status === 'COMPLETED' && 'bg-emerald-100 text-emerald-700',
        status === 'CANCELLED' && 'bg-slate-100 text-slate-600',
        status === 'MISSED' && 'bg-red-100 text-red-700',
        status === 'PENDING' && 'bg-blue-100 text-blue-700',
      )}
    >
      {labelForLookup(status)}
    </span>
  );
}
