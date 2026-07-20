import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { roleInputSchema, type ManagedRole, type RoleInput } from '@interscale/shared';
import { Button } from '@/components/ui/Button';
import { FormField, inputClasses } from '@/components/ui/FormField';
import { PermissionPicker } from './PermissionPicker';
import { usePermissions } from './admin.api';
export function RoleForm({
  role,
  onSubmit,
  pending,
  error,
}: {
  role?: ManagedRole | undefined;
  onSubmit: (v: RoleInput) => void;
  pending: boolean;
  error?: string | undefined;
}) {
  const catalog = usePermissions();
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isDirty },
  } = useForm<RoleInput>({
    resolver: zodResolver(roleInputSchema),
    defaultValues: { name: '', description: '', hierarchyLevel: 50, permissions: [] },
  });
  useEffect(() => {
    if (role)
      reset({
        name: role.name,
        description: role.description ?? '',
        hierarchyLevel: role.hierarchyLevel,
        permissions: role.permissions?.map((p) => p.key) ?? [],
      });
  }, [role, reset]);
  useEffect(() => {
    const f = (e: BeforeUnloadEvent) => {
      if (isDirty) e.preventDefault();
    };
    window.addEventListener('beforeunload', f);
    return () => window.removeEventListener('beforeunload', f);
  }, [isDirty]);
  const permissions = watch('permissions');
  return (
    <form className="space-y-6" onSubmit={handleSubmit(onSubmit)}>
      {error && (
        <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}
      {role?.isSystem && (
        <p className="rounded bg-amber-50 p-3 text-sm text-amber-800">
          System role names and hierarchy levels are protected.
        </p>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        <FormField label="Name" required error={errors.name?.message}>
          {(a) => (
            <input
              {...a}
              {...register('name')}
              disabled={role?.isSystem}
              className={inputClasses(Boolean(errors.name))}
            />
          )}
        </FormField>
        <FormField label="Hierarchy level" required error={errors.hierarchyLevel?.message}>
          {(a) => (
            <input
              {...a}
              type="number"
              min="1"
              max="99"
              {...register('hierarchyLevel', { valueAsNumber: true })}
              disabled={role?.isSystem}
              className={inputClasses(Boolean(errors.hierarchyLevel))}
            />
          )}
        </FormField>
        <div className="md:col-span-2">
          <FormField label="Description" error={errors.description?.message}>
            {(a) => (
              <textarea
                {...a}
                {...register('description')}
                rows={3}
                className={inputClasses(Boolean(errors.description))}
              />
            )}
          </FormField>
        </div>
      </div>
      {catalog.isLoading ? (
        <div className="h-48 animate-pulse rounded bg-slate-100" />
      ) : catalog.data ? (
        <PermissionPicker
          groups={catalog.data}
          value={permissions}
          onChange={(v) => setValue('permissions', v, { shouldDirty: true })}
        />
      ) : (
        <p className="text-red-700">Permission catalog could not be loaded.</p>
      )}
      <div className="flex justify-end">
        <Button type="submit" isLoading={pending}>
          Save role
        </Button>
      </div>
    </form>
  );
}
