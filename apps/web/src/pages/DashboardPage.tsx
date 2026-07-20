import { BadgeCheck, Building2, KeyRound, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/features/auth/AuthProvider';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { NAV_ITEMS } from '@/components/layout/navigation';

/**
 * Phase 3 dashboard.
 *
 * Shows only facts that come from the authenticated session. No user-management
 * statistics (Phase 4) and deliberately no invented sales metrics — a fake
 * number on a dashboard is worse than an empty one.
 */
export function DashboardPage() {
  const { user } = useAuth();

  if (!user) return null;

  const comingSoon = NAV_ITEMS.filter((item) => !item.available);

  const details: Array<{ label: string; value: string; icon: typeof Building2 }> = [
    { label: 'Company', value: user.company.name, icon: Building2 },
    { label: 'Role', value: user.role.name, icon: ShieldCheck },
    { label: 'Username', value: user.username, icon: KeyRound },
    {
      label: 'Last sign-in',
      value: user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : 'This is your first',
      icon: BadgeCheck,
    },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">
          Welcome back, {user.fullName.split(' ')[0]}
        </h1>
        <p className="mt-1 text-sm text-slate-600">You&apos;re signed in to {user.company.name}.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-slate-900">Your account</h2>
          </CardHeader>
          <CardBody>
            <dl className="space-y-3">
              {details.map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.label} className="flex items-start gap-2.5">
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                    <div className="min-w-0">
                      <dt className="text-xs text-slate-500">{item.label}</dt>
                      <dd className="truncate text-sm font-medium text-slate-900">{item.value}</dd>
                    </div>
                  </div>
                );
              })}
            </dl>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-slate-900">Security</h2>
          </CardHeader>
          <CardBody>
            <dl className="space-y-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-500">Email address</dt>
                <dd className="truncate font-medium text-slate-900">{user.email}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-500">Verification</dt>
                <dd>
                  <StatusBadge tone={user.emailVerified ? 'success' : 'warning'}>
                    {user.emailVerified ? 'Verified' : 'Pending'}
                  </StatusBadge>
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-500">Account status</dt>
                <dd>
                  <StatusBadge tone={user.status === 'ACTIVE' ? 'success' : 'warning'}>
                    {user.status}
                  </StatusBadge>
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-500">Session</dt>
                <dd>
                  <StatusBadge tone="info">Active</StatusBadge>
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-500">Permissions granted</dt>
                <dd className="font-medium text-slate-900">{user.permissions.length}</dd>
              </div>
            </dl>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-slate-900">Coming soon</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            These modules arrive in upcoming releases.
          </p>
        </CardHeader>
        <CardBody>
          <ul className="flex flex-wrap gap-2">
            {comingSoon.map((item) => (
              <li key={item.label}>
                <StatusBadge tone="neutral">{item.label}</StatusBadge>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>
    </div>
  );
}
