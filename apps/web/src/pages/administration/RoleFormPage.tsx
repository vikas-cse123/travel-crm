import { Link, useNavigate, useParams } from 'react-router-dom';
import { Card, CardBody } from '@/components/ui/Card';
import { ApiError } from '@/api/client';
import { RoleForm } from '@/features/administration/RoleForm';
import { useRole, useSaveRole } from '@/features/administration/admin.api';
export function RoleFormPage() {
  const { id } = useParams();
  const role = useRole(id);
  const save = useSaveRole(id);
  const nav = useNavigate();
  if (id && role.isLoading) return <div className="h-96 animate-pulse bg-slate-100" />;
  if (id && !role.data) return <p>Role not found or access denied.</p>;
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <header>
        <p className="text-sm text-slate-500">
          <Link to="/roles">Roles</Link> / {id ? 'Edit' : 'New'}
        </p>
        <h1 className="text-2xl font-semibold">{id ? 'Edit role' : 'Create role'}</h1>
      </header>
      <Card>
        <CardBody>
          <RoleForm
            role={role.data}
            pending={save.isPending}
            error={save.error instanceof ApiError ? save.error.message : undefined}
            onSubmit={(v) => save.mutate(v, { onSuccess: (r) => nav(`/roles/${r.id}`) })}
          />
        </CardBody>
      </Card>
    </div>
  );
}
