import { labelForLookup } from '@interscale/shared';

export function FollowUpOutcomeBadge({ outcome }: { outcome: string | null }) {
  if (!outcome) return <span className="text-slate-400">—</span>;
  return (
    <span className="inline-flex rounded-full bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-700">
      {labelForLookup(outcome)}
    </span>
  );
}
