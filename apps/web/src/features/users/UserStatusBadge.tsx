import type { UserStatus } from '@interscale/shared';
const styles: Record<UserStatus, string> = {
  ACTIVE: 'bg-emerald-50 text-emerald-700',
  INACTIVE: 'bg-slate-100 text-slate-600',
  SUSPENDED: 'bg-amber-50 text-amber-700',
  ARCHIVED: 'bg-red-50 text-red-700',
  PENDING_VERIFICATION: 'bg-blue-50 text-blue-700',
};
export function UserStatusBadge({ status }: { status: UserStatus }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${styles[status]}`}>
      {status.replaceAll('_', ' ')}
    </span>
  );
}
