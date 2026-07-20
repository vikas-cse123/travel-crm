import { Link } from 'react-router-dom';
import { MoreHorizontal } from 'lucide-react';
import type { ManagedUser } from '@interscale/shared';
import { useAuth } from '@/features/auth/AuthProvider';
import { useUserAction } from './users.api';
export function UserActionMenu({ user }: { user: ManagedUser }) {
  const { hasPermission, user: me } = useAuth();
  const mutation = useUserAction();
  const run = (action: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'ARCHIVE' | 'RESET') => {
    const label = action === 'RESET' ? 'send password-reset instructions' : action.toLowerCase();
    if (window.confirm(`Are you sure you want to ${label} ${user.fullName}?`))
      mutation.mutate({ id: user.id, action });
  };
  return (
    <details className="relative">
      <summary
        className="list-none cursor-pointer rounded p-2 hover:bg-slate-100"
        aria-label={`Actions for ${user.fullName}`}
      >
        <MoreHorizontal className="h-4 w-4" />
      </summary>
      <div className="absolute right-0 z-20 mt-1 w-48 rounded-lg border bg-white p-1 text-sm shadow-lg">
        <Link className="block rounded px-3 py-2 hover:bg-slate-50" to={`/users/${user.id}`}>
          View
        </Link>
        {hasPermission('users.update') && (
          <Link className="block rounded px-3 py-2 hover:bg-slate-50" to={`/users/${user.id}/edit`}>
            Edit
          </Link>
        )}
        {hasPermission('users.change_status') && user.id !== me?.id && (
          <>
            {user.status !== 'ACTIVE' && (
              <button
                className="block w-full rounded px-3 py-2 text-left hover:bg-slate-50"
                onClick={() => run('ACTIVE')}
              >
                Restore / activate
              </button>
            )}
            {user.status === 'ACTIVE' && (
              <button
                className="block w-full rounded px-3 py-2 text-left hover:bg-slate-50"
                onClick={() => run('INACTIVE')}
              >
                Deactivate
              </button>
            )}
            {user.status !== 'SUSPENDED' && (
              <button
                className="block w-full rounded px-3 py-2 text-left hover:bg-slate-50"
                onClick={() => run('SUSPENDED')}
              >
                Suspend
              </button>
            )}
          </>
        )}
        {hasPermission('users.reset_password') && user.status !== 'ARCHIVED' && (
          <button
            className="block w-full rounded px-3 py-2 text-left hover:bg-slate-50"
            onClick={() => run('RESET')}
          >
            Send password reset
          </button>
        )}
        {hasPermission('users.archive') && user.id !== me?.id && user.status !== 'ARCHIVED' && (
          <button
            className="block w-full rounded px-3 py-2 text-left text-red-600 hover:bg-red-50"
            onClick={() => run('ARCHIVE')}
          >
            Archive
          </button>
        )}
      </div>
    </details>
  );
}
