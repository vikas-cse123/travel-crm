import { Link, useParams } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { initialsOf } from '@/components/layout/navigation';
import { useAuth } from '@/features/auth/AuthProvider';
import { UserStatusBadge } from '@/features/users/UserStatusBadge';
import { useUser, useUserActivity, useUserAction } from '@/features/users/users.api';

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
      <div className="rounded-xl border bg-white p-12 text-center">
        <h1 className="text-lg font-semibold">User not found</h1>
        <p className="text-sm text-slate-500">
          The account does not exist in your company or is unavailable.
        </p>
      </div>
    );
  const u = query.data;
  const run = (a: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'ARCHIVE' | 'RESET') =>
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
            {hasPermission('users.reset_password') && u.status !== 'ARCHIVED' && (
              <Button variant="secondary" onClick={() => run('RESET')}>
                Send password reset
              </Button>
            )}
            {hasPermission('users.archive') && u.id !== me?.id && u.status !== 'ARCHIVED' && (
              <Button variant="danger" onClick={() => run('ARCHIVE')}>
                Archive
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
                ['Last login', u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : 'Never'],
                ['Created', new Date(u.createdAt).toLocaleString()],
                ['Updated', u.updatedAt ? new Date(u.updatedAt).toLocaleString() : '—'],
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
            <div className="flex flex-wrap gap-2">
              {u.effectivePermissions?.length ? (
                u.effectivePermissions.map((p) => (
                  <span key={p} className="rounded bg-slate-100 px-2 py-1 text-xs">
                    {p}
                  </span>
                ))
              ) : (
                <p className="text-sm text-slate-500">No effective permissions.</p>
              )}
            </div>
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
                  <time className="text-slate-500">{new Date(e.createdAt).toLocaleString()}</time>
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
