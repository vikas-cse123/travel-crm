import { Link, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Plus, Search, Users } from 'lucide-react';
import { useAuth } from '@/features/auth/AuthProvider';
import { useUsers, useUserLookups } from '@/features/users/users.api';
import { UserStatusBadge } from '@/features/users/UserStatusBadge';
import { UserActionMenu } from '@/features/users/UserActionMenu';
import { initialsOf } from '@/components/layout/navigation';
import { Button } from '@/components/ui/Button';

export function UsersPage() {
  const { hasPermission } = useAuth();
  const [params, setParams] = useSearchParams();
  const { data, isLoading, isError, refetch } = useUsers(params);
  const { data: lookups } = useUserLookups();
  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.set('page', '1');
    setParams(next);
  };
  const page = Number(params.get('page') ?? 1);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-slate-500">Home / Users</p>
          <h1 className="text-2xl font-semibold">Users</h1>
        </div>
        {hasPermission('users.create') && (
          <Link to="/users/new">
            <Button>
              <Plus className="h-4 w-4" />
              Add User
            </Button>
          </Link>
        )}
      </div>
      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="grid gap-3 border-b p-4 md:grid-cols-4">
          <label className="relative md:col-span-2">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              aria-label="Search users"
              className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm"
              placeholder="Search name, username, email or phone"
              value={params.get('search') ?? ''}
              onChange={(e) => set('search', e.target.value)}
            />
          </label>
          <select
            aria-label="Role"
            className="rounded-lg border border-slate-300 px-3 text-sm"
            value={params.get('roleId') ?? ''}
            onChange={(e) => set('roleId', e.target.value)}
          >
            <option value="">All roles</option>
            {lookups?.roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Status"
            className="rounded-lg border border-slate-300 px-3 text-sm"
            value={params.get('status') ?? ''}
            onChange={(e) => set('status', e.target.value)}
          >
            <option value="">All statuses</option>
            {['ACTIVE', 'INACTIVE', 'SUSPENDED'].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <input
            aria-label="Created from"
            type="date"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            value={params.get('createdFrom') ?? ''}
            onChange={(e) => set('createdFrom', e.target.value)}
          />
          <input
            aria-label="Created to"
            type="date"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            value={params.get('createdTo') ?? ''}
            onChange={(e) => set('createdTo', e.target.value)}
          />
          <button
            className="text-left text-sm font-medium text-brand-700"
            onClick={() => setParams({})}
          >
            Clear filters
          </button>
        </div>
        {isLoading ? (
          <div className="space-y-3 p-5" aria-label="Loading users">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-12 animate-pulse rounded bg-slate-100" />
            ))}
          </div>
        ) : isError ? (
          <div className="p-10 text-center">
            <p className="text-red-700">Users could not be loaded.</p>
            <Button variant="secondary" className="mt-3" onClick={() => void refetch()}>
              Try again
            </Button>
          </div>
        ) : !data?.data.length ? (
          <div className="p-12 text-center">
            <Users className="mx-auto h-10 w-10 text-slate-300" />
            <h2 className="mt-3 font-medium">No users found</h2>
            <p className="text-sm text-slate-500">Adjust your filters or add a user.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1050px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  {[
                    ['fullName', 'User'],
                    ['username', 'Username'],
                    ['email', 'Email'],
                    ['', 'Phone'],
                    ['', 'Role'],
                    ['status', 'Status'],
                    ['lastLoginAt', 'Last login'],
                    ['createdAt', 'Created'],
                    ['', 'Actions'],
                  ].map(([key, label]) => (
                    <th key={label} className="px-4 py-3">
                      {key ? (
                        <button
                          onClick={() => {
                            set('sortBy', key);
                            set('sortOrder', params.get('sortOrder') === 'asc' ? 'desc' : 'asc');
                          }}
                        >
                          {label}
                        </button>
                      ) : (
                        label
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.data.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link to={`/users/${u.id}`} className="flex items-center gap-3">
                        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 font-semibold text-brand-700">
                          {initialsOf(u.fullName)}
                        </span>
                        <span>
                          <span className="block font-medium text-slate-900">{u.fullName}</span>
                          <span className="text-xs text-slate-500">@{u.username}</span>
                        </span>
                      </Link>
                    </td>
                    <td className="px-4 py-3">{u.username}</td>
                    <td className="px-4 py-3">{u.email}</td>
                    <td className="px-4 py-3">{u.phone ?? '—'}</td>
                    <td className="px-4 py-3">{u.role.name}</td>
                    <td className="px-4 py-3">
                      <UserStatusBadge status={u.status} />
                    </td>
                    <td className="px-4 py-3">
                      {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString() : 'Never'}
                    </td>
                    <td className="px-4 py-3">{new Date(u.createdAt).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      <UserActionMenu user={u} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && (
          <div className="flex items-center justify-between border-t px-4 py-3 text-sm">
            <span>{data.pagination.total} users</span>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                aria-label="Previous page"
                disabled={page <= 1}
                onClick={() => set('page', String(page - 1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span>
                Page {page} of {Math.max(1, data.pagination.totalPages)}
              </span>
              <Button
                variant="secondary"
                size="sm"
                aria-label="Next page"
                disabled={page >= data.pagination.totalPages}
                onClick={() => set('page', String(page + 1))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
