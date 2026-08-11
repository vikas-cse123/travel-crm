import { Link, useSearchParams } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/features/auth/AuthProvider';
import { useTemplateAction, useTemplates } from '@/features/administration/admin.api';
export function TemplatesPage() {
  const { hasPermission } = useAuth();
  const [p, setP] = useSearchParams();
  const q = useTemplates(p);
  const action = useTemplateAction();
  const set = (k: string, v: string) => {
    const n = new URLSearchParams(p);
    if (v) n.set(k, v);
    else n.delete(k);
    setP(n);
  };
  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm text-slate-500">Users / Permission Templates</p>
          <h1 className="break-words text-2xl font-semibold">Permission Templates</h1>
        </div>
        {hasPermission('permission_templates.create') && (
          <Link to="/permission-templates/new" className="shrink-0">
            <Button>
              <Plus className="h-4 w-4" />
              New template
            </Button>
          </Link>
        )}
      </header>
      <section className="rounded-xl border bg-card">
        <div className="flex flex-col gap-3 border-b p-4 sm:flex-row">
          <label className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4" />
            <input
              aria-label="Search templates"
              value={p.get('search') ?? ''}
              onChange={(e) => set('search', e.target.value)}
              className="w-full rounded border py-2 pl-9"
            />
          </label>
          <select
            aria-label="Template status"
            value={p.get('status') ?? ''}
            onChange={(e) => set('status', e.target.value)}
            className="h-10 rounded border px-3 sm:h-auto"
          >
            <option value="">All statuses</option>
            <option>ACTIVE</option>
            <option>INACTIVE</option>
          </select>
        </div>
        {q.isLoading ? (
          <div aria-label="Loading templates" className="h-48 animate-pulse bg-slate-100" />
        ) : q.isError ? (
          <p role="alert" className="p-10 text-center text-red-700">
            Templates could not be loaded.
          </p>
        ) : !q.data?.data.length ? (
          <p className="p-10 text-center">No templates found.</p>
        ) : (
          <>
            {/* Table from md up; stacked cards below it — six columns plus four
                actions cannot be read at phone widths. */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="p-3">Name</th>
                    <th>Status</th>
                    <th>Permissions</th>
                    <th>Users</th>
                    <th>Created by</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {q.data.data.map((t) => (
                    <tr key={t.id}>
                      <td className="p-3">
                        <Link className="text-brand-700" to={`/permission-templates/${t.id}`}>
                          {t.name}
                        </Link>
                      </td>
                      <td>{t.status}</td>
                      <td>{t.permissionCount}</td>
                      <td>{t.assignedUserCount}</td>
                      <td>{t.createdBy?.fullName ?? 'System'}</td>
                      <td className="space-x-2">
                        {hasPermission('permission_templates.update') && (
                          <Link to={`/permission-templates/${t.id}/edit`}>Edit</Link>
                        )}
                        {hasPermission('permission_templates.duplicate') && (
                          <button onClick={() => action.mutate({ id: t.id, action: 'duplicate' })}>
                            Duplicate
                          </button>
                        )}
                        {hasPermission('permission_templates.change_status') && (
                          <button
                            onClick={() =>
                              action.mutate({
                                id: t.id,
                                action: t.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE',
                              })
                            }
                          >
                            {t.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                          </button>
                        )}
                        {hasPermission('permission_templates.delete') && (
                          <button
                            className="text-red-600"
                            onClick={() =>
                              window.confirm(`Delete ${t.name}?`) &&
                              action.mutate({ id: t.id, action: 'delete' })
                            }
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
            <ul className="divide-y md:hidden">
              {q.data.data.map((t) => (
                <li key={t.id} className="space-y-3 p-4">
                  <Link
                    className="block break-words font-semibold text-brand-700"
                    to={`/permission-templates/${t.id}`}
                  >
                    {t.name}
                  </Link>
                  <dl className="space-y-1 text-sm">
                    {[
                      ['Status', t.status],
                      ['Permissions', t.permissionCount],
                      ['Users', t.assignedUserCount],
                      ['Created by', t.createdBy?.fullName ?? 'System'],
                    ].map(([label, value]) => (
                      <div key={String(label)} className="flex justify-between gap-3">
                        <dt className="shrink-0 text-slate-500">{label}</dt>
                        <dd className="min-w-0 break-words text-right font-medium">{value}</dd>
                      </div>
                    ))}
                  </dl>
                  <div className="flex flex-wrap gap-2">
                    {hasPermission('permission_templates.update') && (
                      <Link to={`/permission-templates/${t.id}/edit`}>
                        <Button size="sm" variant="secondary">
                          Edit
                        </Button>
                      </Link>
                    )}
                    {hasPermission('permission_templates.duplicate') && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => action.mutate({ id: t.id, action: 'duplicate' })}
                      >
                        Duplicate
                      </Button>
                    )}
                    {hasPermission('permission_templates.change_status') && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                          action.mutate({
                            id: t.id,
                            action: t.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE',
                          })
                        }
                      >
                        {t.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                      </Button>
                    )}
                    {hasPermission('permission_templates.delete') && (
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() =>
                          window.confirm(`Delete ${t.name}?`) &&
                          action.mutate({ id: t.id, action: 'delete' })
                        }
                      >
                        Delete
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
