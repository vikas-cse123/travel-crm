import { useEffect, useState } from 'react';
import { KeyRound, Loader2, X } from 'lucide-react';
import { passwordSchema } from '@interscale/shared';
import type { ManagedUser } from '@interscale/shared';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { PasswordRequirements } from '@/components/ui/PasswordRequirements';
import { ApiError } from '@/api/client';
import { useSetUserPassword } from '@/features/users/users.api';

/**
 * Owner-only "Set New Password" modal. Does not ask for the user's old
 * password — this is an administrative reset, not the normal change flow.
 */
export function SetPasswordModal({ user, onClose }: { user: ManagedUser; onClose: () => void }) {
  const mutation = useSetUserPassword();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitError, setSubmitError] = useState('');

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const passwordError = password
    ? passwordSchema.safeParse(password).error?.issues[0]?.message
    : '';
  const confirmError = confirm && confirm !== password ? 'Passwords do not match.' : '';

  const canSubmit =
    Boolean(password) &&
    !passwordError &&
    Boolean(confirm) &&
    confirm === password &&
    !mutation.isPending;

  const submit = () => {
    setSubmitError('');
    mutation.mutate(
      { id: user.id, password },
      {
        onSuccess: onClose,
        onError: (error) => {
          setSubmitError(
            error instanceof ApiError && error.message
              ? error.message
              : 'The password could not be updated.',
          );
        },
      },
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Set New Password"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl bg-card shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between rounded-t-xl bg-blue-600 px-5 py-3 text-white">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <KeyRound className="h-5 w-5" /> Set New Password
          </h2>
          <button
            aria-label="Close set password"
            onClick={onClose}
            className="rounded p-1 hover:bg-white/20"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <p className="text-sm text-slate-600">
            User: <span className="font-semibold text-slate-900">{user.fullName}</span>
          </p>

          <FormField label="New Password" error={passwordError} required>
            {({ id, 'aria-invalid': ariaInvalid, 'aria-describedby': describedBy }) => (
              <PasswordInput
                id={id}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="new-password"
                hasError={ariaInvalid}
                aria-describedby={describedBy}
              />
            )}
          </FormField>

          <PasswordRequirements value={password} />

          <FormField label="Confirm Password" error={confirmError} required>
            {({ id, 'aria-invalid': ariaInvalid, 'aria-describedby': describedBy }) => (
              <PasswordInput
                id={id}
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                autoComplete="new-password"
                hasError={ariaInvalid}
                aria-describedby={describedBy}
              />
            )}
          </FormField>

          {submitError && (
            <div
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
            >
              {submitError}
            </div>
          )}

          <div className="flex items-center justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={!canSubmit}>
              {mutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Saving…
                </>
              ) : (
                'Set Password'
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
