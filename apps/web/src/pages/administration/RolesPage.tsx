import { Link, useSearchParams } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/features/auth/AuthProvider';
import { useDeleteRole, useRoles } from '@/features/administration/admin.api';
export function RolesPage() {
  const { hasPermission } = useAuth();
  const [p, setP] = useSearchParams();
  const q = useRoles(p);
  const del = useDeleteRole();
  const set = (k: string, v: string) => {
    const n = new URLSearchParams(p);
    if (v) n.set(k, v);
    else n.delete(k);
    setP(n);
  };
  return (
    <div className="space-y-5">
      <header className="flex justify-between">
        <div>
          <p className="text-sm text-slate-500">Users / Roles</p>
          <h1 className="text-2xl font-semibold">Roles</h1>
        </div>
        {hasPermission('roles.create') && (
          <Link to="/roles/new">
            <Button>
              <Plus className="h-4 w-4" />
              New role
            </Button>
          </Link>
        )}
      </header>
      <div className="rounded-xl border bg-white">
        <div className="flex gap-3 border-b p-4">
          <label className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4" />
            <input
              aria-label="Search roles"
              value={p.get('search') ?? ''}
              onChange={(e) => set('search', e.target.value)}
              className="w-full rounded-lg border py-2 pl-9"
            />
          </label>
          <select
            aria-label="Role type"
            value={p.get('isSystem') ?? ''}
            onChange={(e) => set('isSystem', e.target.value)}
            className="rounded-lg border px-3"
          >
            <option value="">All roles</option>
            <option value="true">System</option>
            <option value="false">Custom</option>
          </select>
        </div>
        {q.isLoading ? (
          <div aria-label="Loading roles" className="space-y-3 p-5">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 animate-pulse bg-slate-100" />
            ))}
          </div>
        ) : q.isError ? (
          <p role="alert" className="p-10 text-center text-red-700">
            Roles could not be loaded.
          </p>
        ) : !q.data?.data.length ? (
          <p className="p-10 text-center">No roles found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="p-3">Name</th>
                  <th>Hierarchy</th>
                  <th>Permissions</th>
                  <th>Active users</th>
                  <th>Type</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {q.data.data.map((r) => (
                  <tr key={r.id}>
                    <td className="p-3">
                      <Link className="font-medium text-brand-700" to={`/roles/${r.id}`}>
                        {r.name}
                      </Link>
                    </td>
                    <td>{r.hierarchyLevel}</td>
                    <td>{r.permissionCount}</td>
                    <td>{r.activeUserCount}</td>
                    <td>
                      {r.isSystem ? (
                        <span className="rounded bg-blue-50 px-2 py-1 text-xs">System</span>
                      ) : (
                        'Custom'
                      )}
                    </td>
                    <td className="space-x-3">
                      {hasPermission('roles.update') && (
                        <Link to={`/roles/${r.id}/edit`}>Edit</Link>
                      )}
                      {hasPermission('roles.delete') && !r.isSystem && (
                        <button
                          className="text-red-600"
                          onClick={() => window.confirm(`Delete ${r.name}?`) && del.mutate(r.id)}
                        >
                          Delete
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
