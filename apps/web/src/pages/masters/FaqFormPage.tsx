import { useEffect, useRef, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { X } from 'lucide-react';
import { z } from 'zod';
import type { FaqInput } from '@interscale/shared';
import { Button } from '@/components/ui/Button';
import { useCreateFaq, useFaq, useUpdateFaq, useDestinations } from '@/features/masters/masters.api';
import { fieldClass, MasterHeader } from './MasterUi';

const schema = z.object({
  question: z.string().trim().min(1, 'Enter a question.').max(500),
  answer: z.string().trim().min(1, 'Enter an answer.').max(5000),
  destinations: z.array(z.string().trim().min(1).max(200)).max(50).nullable().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED']).default('ACTIVE'),
});
type Values = z.infer<typeof schema>;
const initial: Values = { question: '', answer: '', destinations: null, status: 'ACTIVE' };

export function FaqFormPage() {
  const { faqId } = useParams();
  const navigate = useNavigate();
  const alertRef = useRef<HTMLDivElement>(null);
  const faq = useFaq(faqId);
  const create = useCreateFaq();
  const update = useUpdateFaq(faqId ?? '');
  const destinations = useDestinations(new URLSearchParams({ status: 'ACTIVE', pageSize: '100' }));
  const [customInput, setCustomInput] = useState('');
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: initial });

  useEffect(() => {
    if (faq.data)
      form.reset({
        question: faq.data.question,
        answer: faq.data.answer,
        destinations: faq.data.destinations ?? null,
        status: faq.data.status as Values['status'],
      });
  }, [faq.data, form]);

  if (faqId && faq.isError) return <Navigate to="/masters/faqs" replace />;

  const mutation = faqId ? update : create;
  const scrollToAlert = () => {
    window.setTimeout(() => alertRef.current?.scrollIntoView({ block: 'center' }), 0);
  };

  const submit = (values: Values) => {
    const payload: FaqInput = {
      question: values.question.trim(),
      answer: values.answer.trim(),
      destinations: values.destinations?.length ? values.destinations : null,
      status: values.status,
    };
    if (faqId)
      update.mutate(payload, {
        onSuccess: () => navigate(`/masters/faqs/${faqId}`),
        onError: scrollToAlert,
      });
    else
      create.mutate(payload, {
        onSuccess: (row) => navigate(`/masters/faqs/${row.id}`),
        onError: scrollToAlert,
      });
  };

  const selected = (form.watch('destinations') ?? []) as string[];
  const destinationNames = destinations.data?.data ?? [];
  const suggestions = [
    ...new Set([
      ...destinationNames.map((d) => d.name),
      ...selected,
    ]),
  ].sort((a, b) => a.localeCompare(b));

  const toggleDestination = (name: string) => {
    const current = selected;
    const next = current.includes(name)
      ? current.filter((d) => d !== name)
      : [...current, name];
    form.setValue('destinations', next.length ? next : null);
  };

  const addCustomDestination = (raw: string) => {
    const name = raw.trim();
    if (!name || selected.includes(name)) return;
    form.setValue('destinations', [...selected, name]);
    setCustomInput('');
  };

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <MasterHeader
        title={faqId ? 'Edit FAQ' : 'Create FAQ'}
        current={faqId ? 'Edit FAQ' : 'Create FAQ'}
      />
      <form
        noValidate
        onSubmit={form.handleSubmit(submit, scrollToAlert)}
        className="overflow-hidden rounded-xl border bg-card shadow-sm"
      >
        <div className="border-b bg-gradient-to-r from-brand-700 to-blue-600 px-5 py-4 text-lg font-semibold text-white">
          FAQ Information
        </div>
        <div className="space-y-5 p-5">
          {mutation.error && (
            <div ref={alertRef} role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
              {mutation.error.message}
            </div>
          )}
          <label className="block text-sm font-medium">
            Question *
            <textarea
              className={`${fieldClass} min-h-[64px]`}
              placeholder="e.g. Is airport transfer included?"
              aria-invalid={Boolean(form.formState.errors.question)}
              {...form.register('question')}
            />
            {form.formState.errors.question && (
              <span className="text-xs text-red-600">{form.formState.errors.question.message}</span>
            )}
          </label>
          <label className="block text-sm font-medium">
            Answer *
            <textarea
              className={`${fieldClass} min-h-[140px]`}
              placeholder="e.g. Yes, a private airport transfer is included for all travellers…"
              aria-invalid={Boolean(form.formState.errors.answer)}
              {...form.register('answer')}
            />
            {form.formState.errors.answer && (
              <span className="text-xs text-red-600">{form.formState.errors.answer.message}</span>
            )}
          </label>

          <div className="rounded-lg border bg-slate-50/60 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-slate-800">Destinations</p>
              <button
                type="button"
                className="text-xs font-medium text-brand-700 underline"
                onClick={() => form.setValue('destinations', null)}
              >
                Clear (apply to all)
              </button>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Select one or more destinations. If none are selected the FAQ applies to every
              destination and will be prefilled in all quotations.
            </p>

            {selected.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {selected.map((name) => (
                  <span
                    key={name}
                    className="inline-flex items-center gap-1 rounded-full bg-brand-600 px-3 py-1 text-xs font-medium text-white"
                  >
                    {name}
                    <button
                      type="button"
                      aria-label={`Remove ${name}`}
                      onClick={() => toggleDestination(name)}
                      className="rounded-full p-0.5 hover:bg-white/20"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            <div className="mt-3 max-h-48 overflow-y-auto rounded-lg border bg-white p-3">
              {suggestions.length === 0 ? (
                <p className="text-sm text-slate-400">
                  No destinations available yet — type a destination below to add one.
                </p>
              ) : (
                <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                  {suggestions.map((name) => (
                    <label
                      key={name}
                      className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                    >
                      <input
                        type="checkbox"
                        checked={selected.includes(name)}
                        onChange={() => toggleDestination(name)}
                        className="h-4 w-4 rounded border-slate-300 text-brand-600"
                      />
                      {name}
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-3 flex items-center gap-2">
              <input
                aria-label="Add custom destination"
                value={customInput}
                onChange={(e) => setCustomInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addCustomDestination(customInput);
                  }
                }}
                placeholder="Type a destination and press Enter…"
                className="w-full max-w-xs rounded-lg border px-3 py-2 text-sm"
              />
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => addCustomDestination(customInput)}
              >
                Add
              </Button>
            </div>
          </div>

          {faqId && (
            <label className="block text-sm font-medium">
              Status
              <select className={fieldClass} {...form.register('status')}>
                <option>ACTIVE</option>
                <option>INACTIVE</option>
                <option>ARCHIVED</option>
              </select>
            </label>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t bg-slate-50 p-4">
          <Link to={faqId ? `/masters/faqs/${faqId}` : '/masters/faqs'}>
            <Button variant="secondary">Cancel</Button>
          </Link>
          <Button type="submit" isLoading={mutation.isPending}>
            {faqId ? 'Update FAQ' : 'Create FAQ'}
          </Button>
        </div>
      </form>
    </div>
  );
}