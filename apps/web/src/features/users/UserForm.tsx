import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createUserSchema, updateUserSchema, type ManagedUser } from '@interscale/shared';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { FormField, inputClasses } from '@/components/ui/FormField';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { PasswordRequirements } from '@/components/ui/PasswordRequirements';
import { useUserLookups } from './users.api';

type Values = {
  fullName: string;
  username: string;
  email: string;
  phone?: string | null;
  roleId: string;
  permissionTemplateId?: string | null;
  status?: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
  temporaryPassword?: string;
  confirmTemporaryPassword?: string;
  mustChangePassword: boolean;
};
export function UserForm({
  user,
  onSubmit,
  isLoading,
  error,
}: {
  user?: ManagedUser;
  onSubmit: (v: Values) => void;
  isLoading: boolean;
  error?: string | undefined;
}) {
  const editing = Boolean(user);
  const { data: lookups, isLoading: loadingLookups } = useUserLookups();
  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isDirty },
  } = useForm<Values>({
    resolver: zodResolver(editing ? updateUserSchema : createUserSchema),
    defaultValues: user
      ? {
          fullName: user.fullName,
          username: user.username,
          email: user.email,
          phone: user.phone,
          roleId: user.role.id,
          permissionTemplateId: user.permissionTemplate?.id ?? null,
          mustChangePassword: user.mustChangePassword ?? false,
        }
      : {
          fullName: '',
          username: '',
          email: '',
          phone: '',
          roleId: '',
          permissionTemplateId: null,
          status: 'ACTIVE',
          temporaryPassword: '',
          confirmTemporaryPassword: '',
          mustChangePassword: true,
        },
  });
  useEffect(() => {
    if (user)
      reset({
        fullName: user.fullName,
        username: user.username,
        email: user.email,
        phone: user.phone,
        roleId: user.role.id,
        permissionTemplateId: user.permissionTemplate?.id ?? null,
        mustChangePassword: user.mustChangePassword ?? false,
      });
  }, [user, reset]);
  useEffect(() => {
    const fn = (e: BeforeUnloadEvent) => {
      if (isDirty) e.preventDefault();
    };
    window.addEventListener('beforeunload', fn);
    return () => window.removeEventListener('beforeunload', fn);
  }, [isDirty]);
  const password = watch('temporaryPassword') ?? '';
  const field = (name: keyof Values, label: string, type = 'text') => (
    <FormField
      label={label}
      required={['fullName', 'username', 'email'].includes(name)}
      error={errors[name]?.message as string | undefined}
    >
      {(a) => (
        <input
          {...a}
          {...register(name)}
          type={type}
          className={inputClasses(Boolean(errors[name]))}
        />
      )}
    </FormField>
  );
  return (
    <form className="space-y-6 p-5" onSubmit={handleSubmit((v) => onSubmit(v))}>
      {error && <Alert tone="error">{error}</Alert>}
      <div className="grid gap-5 md:grid-cols-2">
        {field('fullName', 'Full name')}
        {field('username', 'Username')}
        {field('email', 'Email', 'email')}
        {field('phone', 'Phone', 'tel')}
        <FormField label="Role" required error={errors.roleId?.message}>
          {(a) => (
            <select
              {...a}
              {...register('roleId')}
              disabled={loadingLookups}
              className={inputClasses(Boolean(errors.roleId))}
            >
              <option value="">Select a role</option>
              {lookups?.roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          )}
        </FormField>
        <FormField label="Permission template" error={errors.permissionTemplateId?.message}>
          {(a) => (
            <select
              {...a}
              {...register('permissionTemplateId', { setValueAs: (v) => v || null })}
              className={inputClasses(Boolean(errors.permissionTemplateId))}
            >
              <option value="">No template</option>
              {lookups?.permissionTemplates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          )}
        </FormField>
        {!editing && (
          <>
            <FormField label="Status" required error={errors.status?.message}>
              {(a) => (
                <select
                  {...a}
                  {...register('status')}
                  className={inputClasses(Boolean(errors.status))}
                >
                  {['ACTIVE', 'INACTIVE', 'SUSPENDED'].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              )}
            </FormField>
            <div />
            <FormField
              label="Temporary password"
              required
              error={errors.temporaryPassword?.message}
            >
              {(a) => <PasswordInput {...a} {...register('temporaryPassword')} />}
            </FormField>
            <FormField
              label="Confirm temporary password"
              required
              error={errors.confirmTemporaryPassword?.message}
            >
              {(a) => <PasswordInput {...a} {...register('confirmTemporaryPassword')} />}
            </FormField>
            <PasswordRequirements value={password} />
          </>
        )}
      </div>
      <label className="flex items-center gap-3 text-sm">
        <input
          type="checkbox"
          {...register('mustChangePassword')}
          className="h-4 w-4 rounded border-slate-300"
        />
        Require password change on next login
      </label>
      <div className="flex justify-end">
        <Button type="submit" isLoading={isLoading}>
          {editing ? 'Save changes' : 'Create user'}
        </Button>
      </div>
    </form>
  );
}
