import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { useAuth } from '@/features/auth/AuthProvider';
import { useTemplate, useTemplateAction } from '@/features/administration/admin.api';
export function TemplateDetailsPage() {
  const { id } = useParams();
  const { hasPermission } = useAuth();
  const q = useTemplate(id);
  const a = useTemplateAction();
  const nav = useNavigate();
  if (q.isLoading) return <div className="h-96 animate-pulse bg-slate-100" />;
  if (!q.data) return <p>Template not found or access denied.</p>;
  const t = q.data;
  return (
    <div className="space-y-5">
      <header className="flex flex-wrap justify-between gap-3">
        <div>
          <p className="text-sm text-slate-500">
            <Link to="/permission-templates">Permission Templates</Link> / {t.name}
          </p>
          <h1 className="text-2xl font-semibold">{t.name}</h1>
          <p className="text-slate-500">{t.description}</p>
        </div>
        <div className="flex gap-2">
          {hasPermission('permission_templates.update') && (
            <Link to={`/permission-templates/${t.id}/edit`}>
              <Button variant="secondary">Edit</Button>
            </Link>
          )}
          {hasPermission('permission_templates.duplicate') && (
            <Button
              variant="secondary"
              onClick={() =>
                a.mutate(
                  { id: t.id, action: 'duplicate' },
                  { onSuccess: (x) => nav(`/permission-templates/${(x as typeof t).id}`) },
                )
              }
            >
              Duplicate
            </Button>
          )}
          {hasPermission('permission_templates.change_status') && (
            <Button
              variant="secondary"
              onClick={() =>
                a.mutate({ id: t.id, action: t.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' })
              }
            >
              {t.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
            </Button>
          )}
        </div>
      </header>
      <div className="grid gap-5 lg:grid-cols-3">
        <Card>
          <CardBody>
            <p className="text-sm">
              Status: <strong>{t.status}</strong>
            </p>
            <p className="mt-2 text-sm">Assigned users: {t.assignedUserCount}</p>
            <p className="mt-2 text-xs text-slate-500">
              Inactive templates stay assigned but contribute no permissions.
            </p>
          </CardBody>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <h2 className="font-semibold">Permissions ({t.permissionCount})</h2>
          </CardHeader>
          <CardBody>
            <div className="flex flex-wrap gap-2">
              {t.permissions?.map((p) => (
                <span key={p.key} className="rounded bg-slate-100 px-2 py-1 text-xs">
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
          {t.users?.length ? (
            <ul>
              {t.users.map((u) => (
                <li key={u.id} className="py-2">
                  <Link to={`/users/${u.id}`}>{u.fullName}</Link>
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
