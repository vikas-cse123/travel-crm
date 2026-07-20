import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { MailCheck } from 'lucide-react';
import { forgotPasswordSchema, type ForgotPasswordInput } from '@interscale/shared';
import { ApiError } from '@/api/client';
import { useForgotPassword } from '@/features/auth/auth.api';
import { AuthLayout } from '@/layouts/AuthLayout';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { FormField, inputClasses } from '@/components/ui/FormField';

export function ForgotPasswordPage() {
  const forgotPassword = useForgotPassword();
  const [submitted, setSubmitted] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await forgotPassword.mutateAsync(values);
      // The same confirmation regardless of whether the account exists — the
      // screen must not become an account-existence oracle.
      setSubmitted(true);
    } catch (error) {
      setFormError(
        error instanceof ApiError ? error.message : 'Something went wrong. Please try again.',
      );
    }
  });

  if (submitted) {
    return (
      <AuthLayout
        title="Check your email"
        footer={
          <Link to="/login" className="font-medium text-brand-600 hover:text-brand-700">
            Back to sign in
          </Link>
        }
      >
        <div className="space-y-4 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
            <MailCheck className="h-6 w-6" aria-hidden="true" />
          </span>
          <p role="status" className="text-sm text-slate-600">
            If an account exists for this email, we have sent password-reset instructions.
          </p>
          <p className="text-xs text-slate-500">
            The link expires in 30 minutes and can be used once.
          </p>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Forgot your password?"
      subtitle="Enter your work email and we'll send you a reset link."
      footer={
        <Link to="/login" className="font-medium text-brand-600 hover:text-brand-700">
          Back to sign in
        </Link>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {formError && <Alert tone="error">{formError}</Alert>}

        <FormField label="Work email" error={errors.email?.message} required>
          {(field) => (
            <input
              {...field}
              {...register('email')}
              type="email"
              autoComplete="email"
              placeholder="you@agency.com"
              className={inputClasses(Boolean(errors.email))}
            />
          )}
        </FormField>

        <Button type="submit" fullWidth isLoading={isSubmitting || forgotPassword.isPending}>
          Send reset link
        </Button>
      </form>
    </AuthLayout>
  );
}
