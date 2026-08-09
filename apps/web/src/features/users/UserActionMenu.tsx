import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { KeyRound, MoreHorizontal } from 'lucide-react';
import type { ManagedUser } from '@interscale/shared';
import { useAuth } from '@/features/auth/AuthProvider';
import { useUserAction } from './users.api';
import { SetPasswordModal } from './SetPasswordModal';

export function UserActionMenu({ user }: { user: ManagedUser }) {
  const { hasPermission, user: me } = useAuth();
  const mutation = useUserAction();
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [setPasswordFor, setSetPasswordFor] = useState<ManagedUser | null>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  const isOwner = me?.role.hierarchyLevel === 100;
  const canSetPassword = isOwner && user.id !== me?.id;

  const openMenu = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const menuWidth = 192;
    const menuHeight = 176;
    const left = Math.max(12, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 12));
    const hasRoomBelow = rect.bottom + menuHeight + 12 <= window.innerHeight;
    const top = hasRoomBelow ? rect.bottom + 8 : Math.max(12, rect.top - menuHeight - 8);
    setPosition({ top, left });
    setOpen((value) => !value);
  };

  useEffect(() => {
    if (!open) return undefined;
    const close = (event: MouseEvent) => {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const closeMenu = () => setOpen(false);
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', closeOnEscape);
    window.addEventListener('scroll', closeMenu, true);
    window.addEventListener('resize', closeMenu);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', closeOnEscape);
      window.removeEventListener('scroll', closeMenu, true);
      window.removeEventListener('resize', closeMenu);
    };
  }, [open]);

  const run = (action: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED') => {
    const label = action.toLowerCase();
    if (window.confirm(`Are you sure you want to ${label} ${user.fullName}?`))
      mutation.mutate({ id: user.id, action });
  };

  const menu = (
    <div
      ref={menuRef}
      className="fixed z-[100] w-48 rounded-lg border border-slate-200 bg-card p-1 text-sm shadow-xl"
      style={{ top: position.top, left: position.left }}
    >
      <Link
        className="block rounded px-3 py-2 hover:bg-slate-50"
        to={`/users/${user.id}`}
        onClick={() => setOpen(false)}
      >
        View
      </Link>
      {hasPermission('users.update') && (
        <Link
          className="block rounded px-3 py-2 hover:bg-slate-50"
          to={`/users/${user.id}/edit`}
          onClick={() => setOpen(false)}
        >
          Edit
        </Link>
      )}
      {canSetPassword && (
        <button
          className="flex w-full items-center gap-2 rounded px-3 py-2 text-left hover:bg-slate-50"
          onClick={() => {
            setOpen(false);
            setSetPasswordFor(user);
          }}
        >
          <KeyRound className="h-4 w-4 text-slate-400" />
          Set New Password
        </button>
      )}
      {hasPermission('users.change_status') && user.id !== me?.id && (
        <>
          {user.status !== 'ACTIVE' && (
            <button
              className="block w-full rounded px-3 py-2 text-left hover:bg-slate-50"
              onClick={() => {
                setOpen(false);
                run('ACTIVE');
              }}
            >
              Restore / activate
            </button>
          )}
          {user.status === 'ACTIVE' && (
            <button
              className="block w-full rounded px-3 py-2 text-left hover:bg-slate-50"
              onClick={() => {
                setOpen(false);
                run('INACTIVE');
              }}
            >
              Deactivate
            </button>
          )}
          {user.status !== 'SUSPENDED' && (
            <button
              className="block w-full rounded px-3 py-2 text-left hover:bg-slate-50"
              onClick={() => {
                setOpen(false);
                run('SUSPENDED');
              }}
            >
              Suspend
            </button>
          )}
        </>
      )}
    </div>
  );

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="rounded p-2 hover:bg-slate-100"
        aria-label={`Actions for ${user.fullName}`}
        aria-expanded={open}
        onClick={openMenu}
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open ? createPortal(menu, document.body) : null}
      {setPasswordFor && (
        <SetPasswordModal user={setPasswordFor} onClose={() => setSetPasswordFor(null)} />
      )}
    </>
  );
}
