import { Link, useParams } from 'react-router-dom';
import { ChevronDown, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { initialsOf } from '@/components/layout/navigation';
import { useAuth } from '@/features/auth/AuthProvider';
import { UserStatusBadge } from '@/features/users/UserStatusBadge';
import { useUser, useUserActivity, useUserAction } from '@/features/users/users.api';
import { formatDateTime12Hour } from '@/utils/dateTime';

export function UserDetailsPage() {
  const { userId = '' } = useParams();
  const { hasPermission, user: me } = useAuth();
  const query = useUser(userId);
  const activity = useUserActivity(userId);
  const action = useUserAction();
  if (query.isLoading)
    return (
      <div className="space-y-4" aria-label="Loading user">
        <div className="h-40 animate-pulse rounded-xl bg-slate-100" />
        <div className="h-80 animate-pulse rounded-xl bg-slate-100" />
      </div>
    );
  if (query.isError || !query.data)
    return (
      <div className="rounded-xl border bg-card p-12 text-center">
        <h1 className="text-lg font-semibold">User not found</h1>
        <p className="text-sm text-slate-500">
          The account does not exist in your company or is unavailable.
        </p>
      </div>
    );
  const u = query.data;
  const run = (a: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED') =>
    window.confirm(`Continue with this action for ${u.fullName}?`) &&
    action.mutate({ id: u.id, action: a });
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-slate-500">
          <Link to="/users">Users</Link> / {u.fullName}
        </p>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-100 text-xl font-semibold text-brand-700">
              {initialsOf(u.fullName)}
            </span>
            <div>
              <h1 className="text-2xl font-semibold">{u.fullName}</h1>
              <p className="text-sm text-slate-500">@{u.username}</p>
            </div>
            <UserStatusBadge status={u.status} />
          </div>
          <div className="flex flex-wrap gap-2">
            {hasPermission('users.update') && (
              <Link to={`/users/${u.id}/edit`}>
                <Button variant="secondary">Edit</Button>
              </Link>
            )}
            {hasPermission('users.change_status') && u.id !== me?.id && (
              <Button
                variant="secondary"
                onClick={() => run(u.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE')}
              >
                {u.status === 'ACTIVE' ? 'Deactivate' : 'Activate / restore'}
              </Button>
            )}
          </div>
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <h2 className="font-semibold">Account information</h2>
          </CardHeader>
          <CardBody>
            <dl className="grid gap-5 sm:grid-cols-2">
              {[
                ['Email', u.email],
                ['Phone', u.phone ?? 'Not provided'],
                ['Role', u.role.name],
                ['Permission template', u.permissionTemplate?.name ?? 'None'],
                ['Email verification', u.emailVerified ? 'Verified' : 'Not verified'],
                ['Last login', u.lastLoginAt ? formatDateTime12Hour(u.lastLoginAt) : 'Never'],
                ['Created', formatDateTime12Hour(u.createdAt)],
                ['Updated', formatDateTime12Hour(u.updatedAt)],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs font-medium uppercase text-slate-500">{label}</dt>
                  <dd className="mt-1 text-sm">{value}</dd>
                </div>
              ))}
            </dl>
          </CardBody>
        </Card>
        <Card>
          <CardHeader>
            <h2 className="flex items-center gap-2 font-semibold">
              <ShieldCheck className="h-4 w-4" />
              Effective permissions
            </h2>
          </CardHeader>
          <CardBody>
            <EffectivePermissions permissions={u.effectivePermissions ?? []} />
          </CardBody>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <h2 className="font-semibold">Recent activity</h2>
        </CardHeader>
        <CardBody>
          {activity.isLoading ? (
            <div className="h-24 animate-pulse rounded bg-slate-100" />
          ) : activity.data?.data.length ? (
            <ul className="divide-y">
              {activity.data.data.map((e) => (
                <li key={e.id} className="flex justify-between py-3 text-sm">
                  <span>{e.action.replaceAll('_', ' ').toLowerCase()}</span>
                  <time className="text-slate-500">{formatDateTime12Hour(e.createdAt)}</time>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">No activity recorded.</p>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function EffectivePermissions({ permissions }: { permissions: string[] }) {
  if (!permissions.length) {
    return <p className="text-sm text-slate-500">No effective permissions.</p>;
  }

  const groups = permissions.reduce<Record<string, string[]>>((acc, permission) => {
    const [group = 'other'] = permission.split('.');
    acc[group] = [...(acc[group] ?? []), permission];
    return acc;
  }, {});

  return (
    <div className="space-y-2">
      {Object.entries(groups)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([group, values]) => (
          <details key={group} className="group rounded-lg border border-slate-200 bg-white">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-sm font-semibold capitalize text-slate-800">
              <span>
                {group.replaceAll('_', ' ')}
                <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
                  {values.length}
                </span>
              </span>
              <ChevronDown className="h-4 w-4 text-slate-400 transition group-open:rotate-180" />
            </summary>
            <div className="flex flex-wrap gap-2 border-t border-slate-100 p-3">
              {values.sort().map((permission) => (
                <span key={permission} className="rounded bg-slate-100 px-2 py-1 text-xs">
                  {permission}
                </span>
              ))}
            </div>
          </details>
        ))}
    </div>
  );
}
