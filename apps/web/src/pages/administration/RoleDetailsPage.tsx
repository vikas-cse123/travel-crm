import { Link, useParams } from 'react-router-dom';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/features/auth/AuthProvider';
import { useRole } from '@/features/administration/admin.api';
export function RoleDetailsPage() {
  const { id } = useParams();
  const { hasPermission } = useAuth();
  const q = useRole(id);
  if (q.isLoading) return <div className="h-96 animate-pulse bg-slate-100" />;
  if (!q.data) return <p>Role not found or access denied.</p>;
  const r = q.data;
  return (
    <div className="space-y-5">
      <header className="flex justify-between">
        <div>
          <p className="text-sm text-slate-500">
            <Link to="/roles">Roles</Link> / {r.name}
          </p>
          <h1 className="text-2xl font-semibold">{r.name}</h1>
          <p className="text-slate-500">{r.description}</p>
        </div>
        {hasPermission('roles.update') && (
          <Link to={`/roles/${r.id}/edit`}>
            <Button variant="secondary">Edit role</Button>
          </Link>
        )}
      </header>
      {r.isSystem && <p className="rounded bg-blue-50 p-3 text-sm">Protected system role</p>}
      <div className="grid gap-5 lg:grid-cols-3">
        <Card>
          <CardBody>
            <dl className="space-y-3">
              <div>
                <dt className="text-xs uppercase text-slate-500">Hierarchy</dt>
                <dd>{r.hierarchyLevel}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-slate-500">Active users</dt>
                <dd>{r.activeUserCount}</dd>
              </div>
            </dl>
          </CardBody>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <h2 className="font-semibold">Permissions ({r.permissionCount})</h2>
          </CardHeader>
          <CardBody>
            <div className="flex flex-wrap gap-2">
              {r.permissions?.map((p) => (
                <span className="rounded bg-slate-100 px-2 py-1 text-xs" key={p.key}>
                  {p.key}
                </span>
              ))}
            </div>
          </CardBody>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <h2 className="font-semibold">Assigned users</h2>
        </CardHeader>
        <CardBody>
          {r.users?.length ? (
            <ul className="divide-y">
              {r.users.map((u) => (
                <li key={u.id} className="py-2">
                  <Link to={`/users/${u.id}`}>
                    {u.fullName} <span className="text-slate-500">@{u.username}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">No users assigned.</p>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
