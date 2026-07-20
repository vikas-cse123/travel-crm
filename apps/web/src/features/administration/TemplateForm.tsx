import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  DEFAULT_PERMISSION_TEMPLATES,
  templateInputSchema,
  type ManagedTemplate,
  type TemplateInput,
} from '@interscale/shared';
import { Button } from '@/components/ui/Button';
import { FormField, inputClasses } from '@/components/ui/FormField';
import { PermissionPicker } from './PermissionPicker';
import { usePermissions } from './admin.api';
export function TemplateForm({
  template,
  onSubmit,
  pending,
  error,
}: {
  template?: ManagedTemplate | undefined;
  onSubmit: (v: TemplateInput) => void;
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
  } = useForm<TemplateInput>({
    resolver: zodResolver(templateInputSchema),
    defaultValues: { name: '', description: '', status: 'ACTIVE', permissions: [] },
  });
  useEffect(() => {
    if (template)
      reset({
        name: template.name,
        description: template.description ?? '',
        status: template.status,
        permissions: template.permissions?.map((p) => p.key) ?? [],
      });
  }, [template, reset]);
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
        <p role="alert" className="rounded bg-red-50 p-3 text-red-700">
          {error}
        </p>
      )}
      <div>
        <p className="mb-2 text-sm font-medium">Quick setup</p>
        <div className="flex flex-wrap gap-2">
          {DEFAULT_PERMISSION_TEMPLATES.map((q) => (
            <Button
              key={q.name}
              size="sm"
              variant="secondary"
              onClick={() => {
                setValue('permissions', [...q.permissionKeys], { shouldDirty: true });
                if (!template) setValue('description', q.description, { shouldDirty: true });
              }}
            >
              {q.name}
            </Button>
          ))}
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <FormField label="Template name" required error={errors.name?.message}>
          {(a) => (
            <input {...a} {...register('name')} className={inputClasses(Boolean(errors.name))} />
          )}
        </FormField>
        <FormField label="Status" required error={errors.status?.message}>
          {(a) => (
            <select {...a} {...register('status')} className={inputClasses(Boolean(errors.status))}>
              <option>ACTIVE</option>
              <option>INACTIVE</option>
            </select>
          )}
        </FormField>
        <div className="md:col-span-2">
          <FormField label="Description" error={errors.description?.message}>
            {(a) => (
              <textarea
                {...a}
                rows={3}
                {...register('description')}
                className={inputClasses(Boolean(errors.description))}
              />
            )}
          </FormField>
        </div>
      </div>
      {catalog.data ? (
        <PermissionPicker
          groups={catalog.data}
          value={permissions}
          onChange={(v) => setValue('permissions', v, { shouldDirty: true })}
        />
      ) : (
        <div className="h-40 animate-pulse bg-slate-100" />
      )}
      <div className="flex justify-end">
        <Button type="submit" isLoading={pending}>
          Save template
        </Button>
      </div>
    </form>
  );
}
