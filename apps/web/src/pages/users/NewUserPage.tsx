import { Link, useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/Card';
import { UserForm } from '@/features/users/UserForm';
import { useCreateUser } from '@/features/users/users.api';
import { ApiError } from '@/api/client';
export function NewUserPage() {
  const nav = useNavigate();
  const mutation = useCreateUser();
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <p className="text-sm text-slate-500">
          <Link to="/users">Users</Link> / New
        </p>
        <h1 className="text-2xl font-semibold">Add user</h1>
        <p className="mt-1 text-sm text-slate-500">
          Admin-provisioned users are email-verified and change their temporary password on first
          login by default.
        </p>
      </div>
      <Card>
        <UserForm
          isLoading={mutation.isPending}
          error={mutation.error instanceof ApiError ? mutation.error.message : undefined}
          onSubmit={(v) => mutation.mutate(v as never, { onSuccess: (u) => nav(`/users/${u.id}`) })}
        />
      </Card>
    </div>
  );
}
