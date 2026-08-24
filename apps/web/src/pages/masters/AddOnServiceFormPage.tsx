import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { Save, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import {
  useAddOnService,
  useCreateAddOnService,
  useUpdateAddOnService,
} from '@/features/masters/masters.api';
import { fieldClass, MasterHeader, RichTextEditor, CurrencySelect } from './MasterUi';

interface FormValues {
  name: string;
  description: string;
  price: string;
  /** Carried through so editing never resets a non-default currency. */
  currency: string;
  status: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
}

/**
 * Create/edit Add-On Service.
 *
 * The reference form is deliberately small: name, description, price and an
 * status. The status select maps onto the shared MasterStatus enum so this
 * module keeps the same lifecycle as every other master.
 */
export function AddOnServiceFormPage() {
  const { addOnServiceId } = useParams<{ addOnServiceId: string }>();
  const navigate = useNavigate();
  const record = useAddOnService(addOnServiceId);
  const create = useCreateAddOnService();
  const update = useUpdateAddOnService(addOnServiceId ?? '');
  const [formError, setFormError] = useState('');

  const form = useForm<FormValues>({
    defaultValues: {
      name: '',
      description: '',
      price: '',
      currency: 'INR',
      status: 'ACTIVE',
    },
  });

  useEffect(() => {
    const value = record.data;
    if (!value) return;
    form.reset({
      name: value.name,
      description: value.description ?? '',
      price: value.price != null ? String(value.price) : '',
      currency: value.currency ?? 'INR',
      status: value.status as FormValues['status'],
    });
  }, [record.data, form]);

  if (addOnServiceId && record.isError) return <Navigate to="/masters/add-on-services" replace />;
  const mutation = addOnServiceId ? update : create;

  const submit = form.handleSubmit(async (values) => {
    setFormError('');
    const payload = {
      name: values.name.trim(),
      description: values.description || null,
      price: values.price === '' ? null : Number(values.price),
      currency: values.currency || 'INR',
      status: values.status,
    };
    try {
      const saved = addOnServiceId
        ? await update.mutateAsync(payload)
        : await create.mutateAsync(payload);
      navigate(`/masters/add-on-services/${saved.id}`);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'The service could not be saved.');
    }
  });

  return (
    <div className="space-y-5">
      <MasterHeader
        title={addOnServiceId ? 'Edit Add-On Service' : 'Create Add-On Service'}
        description="Optional extras offered alongside trips."
        current="Add-On Services"
      />

      <form onSubmit={submit} className="mx-auto w-full max-w-3xl space-y-4" noValidate>
        {formError && (
          <div
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
          >
            {formError}
          </div>
        )}

        <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
          <h2 className="border-b bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-800">
            Service Information
          </h2>
          <div className="space-y-4 p-4">
            <div>
              <label className="block text-sm font-medium text-slate-700">
                Service Name <span className="text-red-600">*</span>
                <input
                  className={fieldClass}
                  placeholder="Enter service name"
                  aria-invalid={Boolean(form.formState.errors.name)}
                  {...form.register('name', {
                    required: 'Service name is required.',
                    minLength: { value: 2, message: 'Use at least 2 characters.' },
                  })}
                />
              </label>
              {form.formState.errors.name && (
                <p role="alert" className="mt-1 text-xs font-medium text-red-600">
                  {form.formState.errors.name.message}
                </p>
              )}
            </div>

            <RichTextEditor
              label="Description"
              value={form.watch('description')}
              onChange={(value) => form.setValue('description', value)}
            />

            <div>
              <div className="block text-sm font-medium text-slate-700">
                <span>Price</span>
                <div className="mt-1 flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className={`${fieldClass} mt-0 min-w-0 flex-1`}
                    placeholder="e.g. 5000"
                    aria-label="Add-on service price"
                    aria-invalid={Boolean(form.formState.errors.price)}
                    {...form.register('price', {
                      validate: (value) => {
                        if (value === '' || value == null) return true;
                        const parsed = Number(value);
                        if (Number.isNaN(parsed)) return 'Enter a valid price.';
                        if (parsed < 0) return 'Price cannot be negative.';
                        if (parsed > 99_999_999.99) return 'Price looks too large.';
                        return true;
                      },
                    })}
                  />
                  <CurrencySelect
                    value={form.watch('currency')}
                    onChange={(currency) => form.setValue('currency', currency)}
                    aria-label="Add-on service price currency"
                  />
                </div>
              </div>
              {form.formState.errors.price && (
                <p role="alert" className="mt-1 text-xs font-medium text-red-600">
                  {form.formState.errors.price.message}
                </p>
              )}
            </div>

            <label className="block text-sm font-medium text-slate-700">
              Status
              <select className={fieldClass} {...form.register('status')}>
                <option value="ACTIVE">ACTIVE</option>
                <option value="INACTIVE">INACTIVE</option>
                <option value="ARCHIVED">ARCHIVED</option>
              </select>
            </label>
          </div>
          <div className="flex justify-end gap-2 border-t bg-slate-50 p-4">
            <Button variant="secondary" onClick={() => navigate('/masters/add-on-services')}>
              <X className="h-4 w-4" /> Cancel
            </Button>
            <Button type="submit" isLoading={mutation.isPending || form.formState.isSubmitting}>
              <Save className="h-4 w-4" /> {addOnServiceId ? 'Update' : 'Create'}
            </Button>
          </div>
        </section>
      </form>
    </div>
  );
}
