import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { registerSchema, type RegisterInput } from '@interscale/shared';
import { ApiError } from '@/api/client';
import { useRegister } from '@/features/auth/auth.api';
import { AuthLayout } from '@/layouts/AuthLayout';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { FormField, inputClasses } from '@/components/ui/FormField';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { PasswordRequirements } from '@/components/ui/PasswordRequirements';

export function SignupPage() {
  const navigate = useNavigate();
  const registerCompany = useRegister();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    // Re-validate as the user types once they have seen an error, so the
    // password checklist responds immediately.
    mode: 'onTouched',
    defaultValues: {
      companyName: '',
      fullName: '',
      email: '',
      phone: '',
      password: '',
      confirmPassword: '',
    },
  });

  const passwordValue = watch('password') ?? '';

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await registerCompany.mutateAsync(values);
      navigate('/verify-email', { replace: true });
    } catch (error) {
      if (error instanceof ApiError) {
        // A duplicate address belongs on the email field, not in a banner.
        if (error.status === 409) {
          setError('email', { message: error.message });
          return;
        }
        // Surface server-side field errors on the matching inputs.
        if (error.fields) {
          for (const [field, messages] of Object.entries(error.fields)) {
            setError(field as keyof RegisterInput, { message: messages[0] ?? 'Invalid value' });
          }
          return;
        }
        setFormError(error.message);
        return;
      }
      setFormError('Something went wrong. Please try again.');
    }
  });

  return (
    <AuthLayout
      title="Create your company account"
      subtitle="Set up your travel agency on Interscale in a couple of minutes."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-brand-600 hover:text-brand-700">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {formError && <Alert tone="error">{formError}</Alert>}

        <FormField label="Company name" error={errors.companyName?.message} required>
          {(field) => (
            <input
              {...field}
              {...register('companyName')}
              autoComplete="organization"
              placeholder="Blue Sky Travels"
              className={inputClasses(Boolean(errors.companyName))}
            />
          )}
        </FormField>

        <FormField label="Your full name" error={errors.fullName?.message} required>
          {(field) => (
            <input
              {...field}
              {...register('fullName')}
              autoComplete="name"
              placeholder="Priya Nair"
              className={inputClasses(Boolean(errors.fullName))}
            />
          )}
        </FormField>

        <FormField
          label="Work email"
          error={errors.email?.message}
          hint="We'll send a verification code here."
          required
        >
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

        <FormField label="Phone number" error={errors.phone?.message} required>
          {(field) => (
            <input
              {...field}
              {...register('phone')}
              type="tel"
              autoComplete="tel"
              placeholder="+91 98765 43210"
              className={inputClasses(Boolean(errors.phone))}
            />
          )}
        </FormField>

        <div>
          <FormField label="Password" error={errors.password?.message} required>
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

        <FormField label="Confirm password" error={errors.confirmPassword?.message} required>
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

        <div className="space-y-1.5">
          <label className="flex items-start gap-2.5 text-sm text-slate-600">
            <input
              {...register('acceptTerms')}
              type="checkbox"
              aria-invalid={Boolean(errors.acceptTerms)}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-brand-600"
            />
            <span>
              I accept the <span className="font-medium text-slate-800">Terms of Service</span> and{' '}
              <span className="font-medium text-slate-800">Privacy Policy</span>.
            </span>
          </label>
          {errors.acceptTerms && (
            <p role="alert" className="text-xs font-medium text-red-600">
              {errors.acceptTerms.message}
            </p>
          )}
        </div>

        <Button type="submit" fullWidth isLoading={isSubmitting || registerCompany.isPending}>
          Create account
        </Button>
      </form>
    </AuthLayout>
  );
}
