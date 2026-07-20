import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema, type LoginInput } from '@interscale/shared';
import { ApiError } from '@/api/client';
import { useLogin } from '@/features/auth/auth.api';
import { AuthLayout } from '@/layouts/AuthLayout';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { FormField, inputClasses } from '@/components/ui/FormField';
import { PasswordInput } from '@/components/ui/PasswordInput';

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const login = useLogin();
  const [formError, setFormError] = useState<string | null>(null);

  // Where the user was heading before the guard bounced them here.
  const returnTo = (location.state as { from?: string } | null)?.from ?? '/dashboard';

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '', rememberMe: false },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const result = await login.mutateAsync(values);

      // An unverified account gets a session but no CRM access.
      if (result.requiresEmailVerification) {
        navigate('/verify-email', { replace: true });
        return;
      }

      navigate(returnTo, { replace: true });
    } catch (error) {
      setFormError(
        error instanceof ApiError ? error.message : 'Something went wrong. Please try again.',
      );
    }
  });

  return (
    <AuthLayout
      title="Sign in"
      subtitle="Welcome back. Enter your details to continue."
      footer={
        <>
          Don&apos;t have an account?{' '}
          <Link to="/signup" className="font-medium text-brand-600 hover:text-brand-700">
            Create one
          </Link>
        </>
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

        <FormField label="Password" error={errors.password?.message} required>
          {(field) => (
            <PasswordInput
              {...field}
              {...register('password')}
              autoComplete="current-password"
              placeholder="Enter your password"
              hasError={Boolean(errors.password)}
            />
          )}
        </FormField>

        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              {...register('rememberMe')}
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 text-brand-600"
            />
            Remember me
          </label>

          <Link
            to="/forgot-password"
            className="text-sm font-medium text-brand-600 hover:text-brand-700"
          >
            Forgot password?
          </Link>
        </div>

        <Button type="submit" fullWidth isLoading={isSubmitting || login.isPending}>
          Sign in
        </Button>
      </form>
    </AuthLayout>
  );
}
