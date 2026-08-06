import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { SYSTEM_ADMIN_LANDING_PATH, loginSchema, type LoginInput } from '@interscale/shared';
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
  const [loginMode, setLoginMode] = useState<'admin' | 'user'>('admin');

  // Where the user was heading before the guard bounced them here.
  const returnTo = (location.state as { from?: string } | null)?.from ?? '/dashboard';

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '', rememberMe: false, loginMode: 'COMPANY_ADMIN' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const result = await login.mutateAsync({
        ...values,
        loginMode: loginMode === 'admin' ? 'COMPANY_ADMIN' : 'COMPANY_USER',
      });

      // An unverified account gets a session but no CRM access.
      if (result.requiresEmailVerification) {
        navigate('/verify-email', { replace: true });
        return;
      }

      // The System Admin always lands on the Masters area, never a tenant
      // module or dashboard.
      const destination = result.user.isSystemAdmin ? SYSTEM_ADMIN_LANDING_PATH : returnTo;
      navigate(destination, { replace: true });
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
        <div className="grid grid-cols-2 rounded-xl border border-slate-200 bg-slate-50 p-1">
          {[
            ['admin', 'Company Admin'],
            ['user', 'Company User'],
          ].map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
                loginMode === mode
                  ? 'bg-white text-brand-700 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
              onClick={() => setLoginMode(mode as 'admin' | 'user')}
            >
              {label}
            </button>
          ))}
        </div>
        {formError && <Alert tone="error">{formError}</Alert>}

        <FormField label="Work email" error={errors.email?.message} required>
          {(field) => (
            <input
              {...field}
              {...register('email')}
              type="email"
              autoComplete="email"
              placeholder={loginMode === 'admin' ? 'admin@agency.com' : 'user@agency.com'}
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
