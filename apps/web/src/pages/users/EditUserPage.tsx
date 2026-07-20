import { Link, useNavigate, useParams } from 'react-router-dom';
import { Card } from '@/components/ui/Card';
import { UserForm } from '@/features/users/UserForm';
import { useUpdateUser, useUser } from '@/features/users/users.api';
import { ApiError } from '@/api/client';
export function EditUserPage() {
  const { userId = '' } = useParams();
  const nav = useNavigate();
  const query = useUser(userId);
  const mutation = useUpdateUser(userId);
  if (query.isLoading) return <div className="h-96 animate-pulse rounded-xl bg-slate-100" />;
  if (query.isError || !query.data)
    return (
      <div className="rounded-xl border bg-white p-10 text-center">
        <h1 className="font-semibold">User unavailable</h1>
        <p className="text-sm text-slate-500">This user was not found or you do not have access.</p>
      </div>
    );
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <p className="text-sm text-slate-500">
          <Link to="/users">Users</Link> /{' '}
          <Link to={`/users/${userId}`}>{query.data.fullName}</Link> / Edit
        </p>
        <h1 className="text-2xl font-semibold">Edit user</h1>
        {query.data.role.hierarchyLevel === 100 && (
          <p className="mt-1 text-sm text-amber-700">
            Owner accounts are protected by hierarchy and final-active-Owner rules.
          </p>
        )}
      </div>
      <Card>
        <UserForm
          user={query.data}
          isLoading={mutation.isPending}
          error={mutation.error instanceof ApiError ? mutation.error.message : undefined}
          onSubmit={(v) => mutation.mutate(v, { onSuccess: () => nav(`/users/${userId}`) })}
        />
      </Card>
    </div>
  );
}
