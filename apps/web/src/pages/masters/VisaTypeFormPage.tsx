import { useEffect } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { Controller, useFieldArray, useForm } from 'react-hook-form';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { type VisaTypeInput } from '@interscale/shared';
import { Button } from '@/components/ui/Button';
import {
  useCreateVisaType,
  useDestinations,
  useUpdateVisaType,
  useVisaType,
} from '@/features/masters/masters.api';
import { fieldClass, MasterHeader, RichTextEditor } from './MasterUi';

const LARGE = new URLSearchParams('pageSize=100&status=ACTIVE');

interface FormValues {
  destinationId: string;
  name: string;
  isActive: boolean;
  sections: { title: string; content: string }[];
}

const empty: FormValues = { destinationId: '', name: '', isActive: true, sections: [] };

export function VisaTypeFormPage() {
  const { visaTypeId } = useParams();
  const navigate = useNavigate();
  const visaType = useVisaType(visaTypeId);
  const destinations = useDestinations(LARGE);
  const create = useCreateVisaType();
  const update = useUpdateVisaType(visaTypeId ?? '');
  const form = useForm<FormValues>({ defaultValues: empty });
  const sections = useFieldArray({ control: form.control, name: 'sections' });

  useEffect(() => {
    if (!visaType.data) return;
    form.reset({
      destinationId: visaType.data.destinationId,
      name: visaType.data.name,
      isActive: visaType.data.status !== 'INACTIVE',
      sections: visaType.data.sections.map((section) => ({
        title: section.title,
        content: section.content,
      })),
    });
  }, [visaType.data, form]);

  if (visaTypeId && visaType.isError) return <Navigate to="/masters/visa-types" replace />;
  const mutation = visaTypeId ? update : create;

  const submit = form.handleSubmit(async (values) => {
    if (!values.destinationId) {
      form.setError('destinationId', { message: 'Select a destination.' });
      return;
    }
    if (values.name.trim().length < 2) {
      form.setError('name', { message: 'Enter a visa type name.' });
      return;
    }
    const payload: VisaTypeInput = {
      destinationId: values.destinationId,
      name: values.name.trim(),
      status: values.isActive ? 'ACTIVE' : 'INACTIVE',
      sections: values.sections
        .filter((section) => section.title.trim())
        .map((section) => ({ title: section.title.trim(), content: section.content })),
    };
    try {
      const saved = visaTypeId
        ? await update.mutateAsync(payload)
        : await create.mutateAsync(payload);
      navigate(`/masters/visa-types/${saved.id}`);
    } catch {
      /* surfaced via mutation.error below */
    }
  });

  return (
    <div className="space-y-5">
      <MasterHeader
        title={visaTypeId ? 'Edit Visa Type' : 'Create Visa Type'}
        description="A visa type belongs to one destination and can carry any number of sections."
        current={visaTypeId ? 'Edit Visa Type' : 'Create Visa Type'}
      />
      <form onSubmit={submit} className="space-y-5">
        {mutation.error && (
          <div role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {mutation.error.message}
          </div>
        )}
        <section className="overflow-hidden rounded-xl border bg-white shadow-sm">
          <div className="border-b bg-gradient-to-r from-brand-700 to-blue-600 px-5 py-4 text-lg font-semibold text-white">
            Visa Type Information
          </div>
          <div className="space-y-5 p-5">
            <label className="block text-sm font-medium">
              Destination *
              <select className={fieldClass} {...form.register('destinationId')}>
                <option value="">Select destination</option>
                {destinations.data?.data.map((destination) => (
                  <option key={destination.id} value={destination.id}>
                    {destination.name}
                  </option>
                ))}
              </select>
              {form.formState.errors.destinationId && (
                <span className="text-xs text-red-600">
                  {form.formState.errors.destinationId.message}
                </span>
              )}
            </label>
            <label className="block text-sm font-medium">
              Visa Type Name *
              <input
                className={fieldClass}
                placeholder="e.g. Tourist Visa, Business Visa"
                {...form.register('name')}
              />
              {form.formState.errors.name && (
                <span className="text-xs text-red-600">{form.formState.errors.name.message}</span>
              )}
            </label>
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" {...form.register('isActive')} /> Active
            </label>
          </div>
        </section>

        <section className="overflow-hidden rounded-xl border bg-white shadow-sm">
          <div className="flex items-center justify-between border-b bg-slate-50 px-5 py-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-700">Visa Sections</h3>
              <p className="text-xs text-slate-500">
                Add as many rich-text sections as this visa type needs (e.g. Overview, Visa Fees,
                Documents Required).
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => sections.append({ title: '', content: '' })}
            >
              <Plus className="h-4 w-4" /> Add Section
            </Button>
          </div>
          <div className="space-y-5 p-5">
            {!sections.fields.length && (
              <p className="text-sm text-slate-500">No sections yet. Add one to get started.</p>
            )}
            {sections.fields.map((field, index) => (
              <div key={field.id} className="space-y-3 rounded-lg border p-4">
                <div className="flex items-center gap-2">
                  <input
                    className={fieldClass}
                    placeholder="Section title (e.g. Overview)"
                    aria-label={`Section ${index + 1} title`}
                    {...form.register(`sections.${index}.title` as const)}
                  />
                  <button
                    type="button"
                    aria-label={`Move section ${index + 1} up`}
                    disabled={index === 0}
                    onClick={() => sections.move(index, index - 1)}
                    className="rounded p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                  >
                    <ArrowUp className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Move section ${index + 1} down`}
                    disabled={index === sections.fields.length - 1}
                    onClick={() => sections.move(index, index + 1)}
                    className="rounded p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                  >
                    <ArrowDown className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove section ${index + 1}`}
                    onClick={() => sections.remove(index)}
                    className="rounded p-2 text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <Controller
                  control={form.control}
                  name={`sections.${index}.content` as const}
                  render={({ field: contentField }) => (
                    <RichTextEditor
                      label={`Section ${index + 1} content`}
                      value={contentField.value}
                      onChange={contentField.onChange}
                    />
                  )}
                />
              </div>
            ))}
          </div>
        </section>

        <div className="sticky bottom-0 flex justify-end gap-2 rounded-xl border bg-white/95 p-4 shadow-lg backdrop-blur">
          <Link to={visaTypeId ? `/masters/visa-types/${visaTypeId}` : '/masters/visa-types'}>
            <Button variant="secondary">Cancel</Button>
          </Link>
          <Button type="submit" isLoading={mutation.isPending}>
            {visaTypeId ? 'Update Visa Type' : 'Create Visa Type'}
          </Button>
        </div>
      </form>
    </div>
  );
}
