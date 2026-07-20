import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle2, LinkIcon } from 'lucide-react';
import { resetPasswordSchema, type ResetPasswordInput } from '@interscale/shared';
import { ApiError } from '@/api/client';
import { useResetPassword, useValidateResetToken } from '@/features/auth/auth.api';
import { AuthLayout } from '@/layouts/AuthLayout';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { PasswordRequirements } from '@/components/ui/PasswordRequirements';

export function ResetPasswordPage() {
  const { token = '' } = useParams<{ token: string }>();
  const validation = useValidateResetToken(token);
  const resetPassword = useResetPassword();

  const [succeeded, setSucceeded] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    mode: 'onTouched',
    defaultValues: { token, password: '', confirmPassword: '' },
  });

  const passwordValue = watch('password') ?? '';

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await resetPassword.mutateAsync({ ...values, token });
      setSucceeded(true);
    } catch (error) {
      setFormError(
        error instanceof ApiError ? error.message : 'Something went wrong. Please try again.',
      );
    }
  });

  if (validation.isPending) {
    return (
      <AuthLayout title="Checking your link…">
        <div className="space-y-2" aria-hidden="true">
          <div className="h-3 w-2/3 animate-pulse rounded bg-slate-100" />
          <div className="h-3 w-1/2 animate-pulse rounded bg-slate-100" />
        </div>
      </AuthLayout>
    );
  }

  // Covers expired, already-used and forged links alike — the API does not say
  // which, so neither does the UI.
  if (validation.isError || validation.data?.valid !== true) {
    return (
      <AuthLayout
        title="This link is no longer valid"
        footer={
          <Link to="/login" className="font-medium text-brand-600 hover:text-brand-700">
            Back to sign in
          </Link>
        }
      >
        <div className="space-y-4 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-600">
            <LinkIcon className="h-6 w-6" aria-hidden="true" />
          </span>
          <p className="text-sm text-slate-600">
            Password-reset links expire after 30 minutes and can be used only once.
          </p>
          <Link
            to="/forgot-password"
            className="inline-flex h-10 items-center rounded-lg bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700"
          >
            Request a new link
          </Link>
        </div>
      </AuthLayout>
    );
  }

  if (succeeded) {
    return (
      <AuthLayout title="Password changed">
        <div className="space-y-4 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
            <CheckCircle2 className="h-6 w-6" aria-hidden="true" />
          </span>
          <p role="status" className="text-sm text-slate-600">
            Your password has been changed and all other sessions were signed out.
          </p>
          <Link
            to="/login"
            className="inline-flex h-10 items-center rounded-lg bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700"
          >
            Sign in
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Choose a new password"
      subtitle="Signing in elsewhere will be required again."
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {formError && <Alert tone="error">{formError}</Alert>}

        <input type="hidden" {...register('token')} value={token} />

        <div>
          <FormField label="New password" error={errors.password?.message} required>
            {(field) => (
              <PasswordInput
                {...field}
                {...register('password')}
                autoComplete="new-password"
                placeholder="Create a strong password"
                hasError={Boolean(errors.password)}
              />
            )}
          </FormField>
          <PasswordRequirements value={passwordValue} />
        </div>

        <FormField label="Confirm new password" error={errors.confirmPassword?.message} required>
          {(field) => (
            <PasswordInput
              {...field}
              {...register('confirmPassword')}
              autoComplete="new-password"
              placeholder="Re-enter your password"
              hasError={Boolean(errors.confirmPassword)}
            />
          )}
        </FormField>

        <Button type="submit" fullWidth isLoading={isSubmitting || resetPassword.isPending}>
          Change password
        </Button>
      </form>
    </AuthLayout>
  );
}
