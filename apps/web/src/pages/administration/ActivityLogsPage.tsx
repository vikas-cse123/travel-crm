import { useSearchParams } from 'react-router-dom';
import { Search } from 'lucide-react';
import { useActivityLogs } from '@/features/administration/admin.api';
export function ActivityLogsPage() {
  const [p, setP] = useSearchParams();
  const q = useActivityLogs(p);
  const set = (k: string, v: string) => {
    const n = new URLSearchParams(p);
    if (v) n.set(k, v);
    else n.delete(k);
    setP(n);
  };
  return (
    <div className="space-y-5">
      <header>
        <p className="text-sm text-slate-500">Users / Activity Logs</p>
        <h1 className="text-2xl font-semibold">Activity Logs</h1>
      </header>
      <section className="rounded-xl border bg-white">
        <div className="grid gap-3 border-b p-4 md:grid-cols-4">
          <label className="relative md:col-span-2">
            <Search className="absolute left-3 top-2.5 h-4 w-4" />
            <input
              aria-label="Search activity"
              value={p.get('search') ?? ''}
              onChange={(e) => set('search', e.target.value)}
              className="w-full rounded border py-2 pl-9"
            />
          </label>
          <select
            aria-label="Action"
            value={p.get('action') ?? ''}
            onChange={(e) => set('action', e.target.value)}
            className="rounded border px-3"
          >
            <option value="">All actions</option>
            {[
              'USER_CREATED',
              'USER_UPDATED',
              'ROLE_CREATED',
              'ROLE_UPDATED',
              'ROLE_DELETED',
              'PERMISSION_TEMPLATE_CREATED',
              'PERMISSION_TEMPLATE_UPDATED',
              'PERMISSION_TEMPLATE_DUPLICATED',
              'PERMISSION_TEMPLATE_ACTIVATED',
              'PERMISSION_TEMPLATE_DEACTIVATED',
              'PERMISSION_TEMPLATE_DELETED',
              'LOGIN_SUCCESS',
              'LOGIN_FAILED',
            ].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
          <select
            aria-label="Entity type"
            value={p.get('entityType') ?? ''}
            onChange={(e) => set('entityType', e.target.value)}
            className="rounded border px-3"
          >
            <option value="">All entities</option>
            {['User', 'Role', 'PermissionTemplate', 'Company', 'Session'].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
          <input
            aria-label="Date from"
            type="date"
            value={p.get('dateFrom') ?? ''}
            onChange={(e) => set('dateFrom', e.target.value)}
            className="rounded border p-2"
          />
          <input
            aria-label="Date to"
            type="date"
            value={p.get('dateTo') ?? ''}
            onChange={(e) => set('dateTo', e.target.value)}
            className="rounded border p-2"
          />
          <button className="text-left text-sm text-brand-700" onClick={() => setP({})}>
            Clear filters
          </button>
        </div>
        {q.isLoading ? (
          <div aria-label="Loading activity" className="h-64 animate-pulse bg-slate-100" />
        ) : q.isError ? (
          <p role="alert" className="p-10 text-center text-red-700">
            Activity logs could not be loaded.
          </p>
        ) : !q.data?.data.length ? (
          <p className="p-10 text-center">No activity found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="p-3">Date and time</th>
                  <th>Actor</th>
                  <th>Action</th>
                  <th>Target</th>
                  <th>Entity</th>
                  <th>IP address</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {q.data.data.map((e) => (
                  <tr key={e.id}>
                    <td className="p-3">{new Date(e.createdAt).toLocaleString()}</td>
                    <td>{e.actorUser?.fullName ?? 'System'}</td>
                    <td>{e.action.replaceAll('_', ' ').toLowerCase()}</td>
                    <td>{e.targetUser?.fullName ?? '—'}</td>
                    <td>
                      {e.entityType}
                      {e.entityId ? ` · ${e.entityId.slice(0, 8)}` : ''}
                    </td>
                    <td>{e.ipAddress ?? '—'}</td>
                    <td>
                      <details>
                        <summary className="cursor-pointer text-brand-700">View</summary>
                        <pre className="mt-2 max-w-sm overflow-auto rounded bg-slate-900 p-3 text-xs text-white">
                          {JSON.stringify(e.metadata, null, 2)}
                        </pre>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
