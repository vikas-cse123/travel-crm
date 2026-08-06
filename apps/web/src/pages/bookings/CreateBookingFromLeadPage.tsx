import { lazy, useMemo, useRef } from 'react';
import { ArrowLeft, ChevronDown, Trash2 } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useFieldArray, useForm } from 'react-hook-form';
import { Button } from '@/components/ui/Button';
import {
  useBookingFromLeadPreview,
  useCreateBookingFromLead,
} from '@/features/bookings/bookings.api';

const LazyNewBookingPage = lazy(() =>
  import('./NewBookingPage').then((m) => ({ default: m.NewBookingPage })),
);

/**
 * Route-level wrapper for `/bookings/new`. When the lead-based identifiers are
 * present the lead workflow renders; otherwise the manual workflow stays.
 */
export function BookingCreateFlow() {
  const [searchParams] = useSearchParams();
  const leadId = searchParams.get('leadId');
  const quotationId = searchParams.get('quotationId');
  if (leadId && quotationId)
    return <CreateBookingFromLeadPage leadId={leadId} quotationId={quotationId} />;
  return <LazyNewBookingPage />;
}

const field =
  'w-full rounded-md border border-slate-300 bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500';
const labelCls = 'mb-1 block text-sm font-medium text-slate-700';

const REMINDER_OPTIONS = [
  { value: '1', label: '1 day before' },
  { value: '2', label: '2 days before' },
  { value: '3', label: '3 days before' },
  { value: '5', label: '5 days before' },
  { value: '7', label: '7 days before' },
  { value: '10', label: '10 days before' },
  { value: '15', label: '15 days before' },
];

const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat',
  'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh',
  'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 'Rajasthan',
  'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Delhi', 'Jammu and Kashmir', 'Puducherry', 'Ladakh', 'Andaman and Nicobar Islands', 'Chandigarh',
];

interface ReminderRow {
  daysBefore: string;
  dueTime: string;
}

interface FormValues {
  title: string;
  notes: string;
  totalSellingAmount: string;
  tcsExempt: boolean;
  gstChoice: string; // '' = company default, otherwise "<rate>:<mode>"
  placeOfSupply: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  foreignNational: boolean;
  customerState: string;
  reminders: ReminderRow[];
}

const formatAmount = (value: string, currency: string) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency, minimumFractionDigits: 2 }).format(
    Number(value) || 0,
  );

const travelDateFormat = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

/** Format a 'YYYY-MM-DD' value safely without local-timezone shifts. */
const formatDay = (value: string | null | undefined) => {
  if (!value) return '—';
  const [year, month, day] = value.slice(0, 10).split('-');
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return travelDateFormat.format(date);
};

export function CreateBookingFromLeadPage({
  leadId,
  quotationId,
}: {
  leadId: string;
  quotationId: string;
}) {
  const navigate = useNavigate();
  const preview = useBookingFromLeadPreview(leadId, quotationId);
  const create = useCreateBookingFromLead();

  const {
    register,
    handleSubmit,
    watch,
    control,
    setValue,
    setError,
    getValues,
    formState: { errors },
  } = useForm<FormValues>({
    defaultValues: {
      title: '',
      notes: '',
      totalSellingAmount: '',
      tcsExempt: false,
      gstChoice: '',
      placeOfSupply: '',
      customerName: '',
      customerPhone: '',
      customerEmail: '',
      foreignNational: false,
      customerState: '',
      reminders: [{ daysBefore: '2', dueTime: '11:00' }],
    },
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'reminders' });

  const data = preview.data;
  const currency = data?.quotation.currency ?? 'INR';

  // Prefill booking title + total amount from the finalized quotation when the
  // preview loads (only when the user has not started editing).
  const prefilledTitle = useMemo(() => {
    if (!data) return '';
    return `${data.lead.customerName} - ${data.quotation.title}`;
  }, [data]);

  // Hydrate editable fields once from the preview. Guarded by a ref so clearing
  // a field never silently re-prefills it while the user is editing.
  const hydrated = useRef(false);
  if (data && !hydrated.current) {
    hydrated.current = true;
    setValue('title', prefilledTitle);
    setValue('totalSellingAmount', data.quotation.finalAmount);
    setValue('customerName', data.lead.customerName);
    setValue('customerPhone', data.lead.phone);
    if (data.lead.email?.trim()) setValue('customerEmail', data.lead.email);
    if (data.customerState) setValue('customerState', data.customerState);
  }

  const gstOptions = useMemo(() => {
    if (!data) return [];
    const def = data.company.defaultGstRate;
    const defMode = data.company.defaultGstMode === 'INCLUSIVE' ? 'Inclusive' : 'Additive';
    return [
      { value: '', label: `Default (${def}% ${defMode})` },
      { value: '0:NONE', label: '0% - No GST' },
      { value: '5:ADDITIVE', label: '5% - Additive' },
      { value: '5:INCLUSIVE', label: '5% - Inclusive' },
      { value: '18:ADDITIVE', label: '18% - Additive' },
      { value: '18:INCLUSIVE', label: '18% - Inclusive' },
    ];
  }, [data]);

  const customer = data?.customer;
  const customerConflict = customer !== null && customer !== undefined && 'conflict' in customer;
  const existingCustomer =
    customer !== null && customer !== undefined && !('conflict' in customer);
  const newCustomerRequired = customer === null || customer === undefined;

  const duplicateOffsets = (rows: ReminderRow[]) => {
    const seen = new Set<string>();
    let duplicate = false;
    for (const row of rows) {
      if (!row.daysBefore) continue;
      if (seen.has(row.daysBefore)) duplicate = true;
      seen.add(row.daysBefore);
    }
    return duplicate;
  };

  const watchedReminders = watch('reminders');
  const hasDuplicateOffsets = duplicateOffsets(watchedReminders);
  const usedOffsets = new Set(watchedReminders.map((row) => row.daysBefore).filter(Boolean));

  const onSubmit = (values: FormValues) => {
    const [gstRate, gstMode] = values.gstChoice ? values.gstChoice.split(':') : ['', ''];
    // Blank reminder rows (no offset chosen) are never submitted, and completed
    // duplicate offsets are never sent to the API.
    const completedReminders = values.reminders.filter((row) => row.daysBefore.trim() !== '');
    if (duplicateOffsets(completedReminders)) {
      setError('reminders', { type: 'custom', message: 'Duplicate reminder offsets are not allowed.' });
      return;
    }
    create.mutate(
      {
        leadId,
        quotationId,
        title: values.title.trim(),
        notes: values.notes.trim() || null,
        totalSellingAmount: Number(values.totalSellingAmount),
        tcsExempt: values.tcsExempt,
        gstRate: gstRate ? Number(gstRate) : null,
        gstMode: (gstMode || null) as never,
        placeOfSupply: values.placeOfSupply || null,
        ...(newCustomerRequired
          ? {
              customer: {
                displayName: values.customerName.trim(),
                phone: values.customerPhone.trim(),
                email: values.customerEmail.trim() || null,
                state: values.customerState.trim() || null,
              },
            }
          : {}),
        reminders: completedReminders.map((row) => ({
          daysBefore: Number(row.daysBefore),
          dueTime: row.dueTime,
        })),
      },
      {
        onSuccess: (booking) => navigate(`/bookings/${booking.id}`),
      },
    );
  };

  const quotationLabel = data
    ? data.quotation.quotationNumber?.trim()
      ? `${data.quotation.quotationNumber} · Version ${data.quotation.versionNumber}`
      : `Version ${data.quotation.versionNumber}`
    : '';

  return (
    <div className="space-y-5">
      {/* Breadcrumb */}
      <nav className="text-sm text-slate-500">
        <Link to="/" className="hover:text-slate-800">Home</Link>
        <span className="mx-1.5">/</span>
        <Link to="/bookings" className="hover:text-slate-800">Bookings</Link>
        <span className="mx-1.5">/</span>
        <span className="font-medium text-slate-800">Create</span>
      </nav>

      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Create Booking</h1>

      {preview.isLoading && (
        <div className="flex h-64 items-center justify-center text-sm text-slate-500">
          Loading booking preview...
        </div>
      )}

      {preview.isError && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-red-800">
          <p className="font-semibold">Unable to load booking preview.</p>
          <p className="mt-1 text-sm">{(preview.error as Error)?.message}</p>
          <Link to={`/queries/${leadId}`} className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-brand-700 hover:underline">
            <ArrowLeft className="h-4 w-4" /> Back to Lead
          </Link>
        </div>
      )}

      {data && (
        <>
          {/* Blue title strip */}
          <div className="rounded-md bg-blue-600 px-4 py-2.5 text-white">
            <p className="text-sm font-semibold">Create Booking from Lead: {data.lead.customerName}</p>
          </div>

          {/* Lead Information panel */}
          <section className="rounded-md border border-teal-200 bg-teal-50 p-4">
            <h2 className="text-sm font-semibold text-teal-900">Lead Information</h2>
            <div className="mt-3 grid gap-4 text-sm md:grid-cols-3">
              <div className="space-y-1">
                <p><span className="font-medium text-slate-600">Lead:</span> {data.lead.customerName}</p>
                <p><span className="font-medium text-slate-600">Phone:</span> {data.lead.phone}</p>
                {data.lead.email?.trim() && (
                  <p><span className="font-medium text-slate-600">Email:</span> {data.lead.email}</p>
                )}
              </div>
              <div className="space-y-1">
                <p>
                  <span className="font-medium text-slate-600">Travel Date:</span>{' '}
                  {formatDay(data.duration.travelStart)}
                </p>
                <p>
                  <span className="font-medium text-slate-600">Duration:</span>{' '}
                  {data.duration.durationLabel ?? '—'}
                </p>
                <p><span className="font-medium text-slate-600">Travellers:</span> {data.lead.travellerSummary}</p>
              </div>
              <div className="space-y-1">
                <p><span className="font-medium text-slate-600">Stage:</span> Booking Confirmed</p>
                <p><span className="font-medium text-slate-600">Quotation:</span> {quotationLabel}</p>
                <p>
                  <span className="font-medium text-slate-600">Customer Price:</span>{' '}
                  {formatAmount(data.quotation.finalAmount, data.quotation.currency)}
                </p>
              </div>
            </div>
            <p className="mt-3 rounded border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-800">
              Services will be imported with profit tracking.
            </p>
          </section>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            {/* Existing-customer / duplicate-customer inline notes (compact, no cards) */}
            {existingCustomer && customer && 'customerNumber' in customer && (
              <p className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                This booking will be linked to the existing customer {customer.customerNumber} - {customer.displayName}.
              </p>
            )}
            {customerConflict && (
              <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                Multiple customers match this lead. Resolve the duplicates before creating the booking.
              </p>
            )}

            {/* Main booking form — dense two-column layout */}
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-3">
                <label className="block">
                  <span className={labelCls}>Booking Title *</span>
                  <input className={field} {...register('title', { required: true })} />
                  {errors.title && <span className="text-xs text-red-600">Booking title is required.</span>}
                </label>

                <label className="block">
                  <span className={labelCls}>Total Customer Amount ({currency}) *</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className={field}
                    {...register('totalSellingAmount', { required: true, min: 0 })}
                  />
                  {errors.totalSellingAmount && (
                    <span className="text-xs text-red-600">A non-negative total customer amount is required.</span>
                  )}
                </label>

                <div className="pt-1">
                  <label className="flex items-start gap-2 text-sm text-slate-700">
                    <input type="checkbox" className="mt-0.5" {...register('tcsExempt')} />
                    <span>
                      <span className="font-medium">TCS Exempt</span> - Exempt this booking from TCS calculation
                    </span>
                  </label>
                  <p className="pl-6 text-xs text-slate-400">
                    Check this option if this international booking should be exempted from TCS calculation.
                  </p>
                </div>

                <label className="block">
                  <span className={labelCls}>GST Rate</span>
                  <div className="relative">
                    <select className={`${field} appearance-none pr-8`} {...register('gstChoice')}>
                      {gstOptions.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  </div>
                </label>

                <label className="block">
                  <span className={labelCls}>Place of Supply (State)</span>
                  <select className={`${field} appearance-none`} {...register('placeOfSupply')}>
                    <option value="">-- Auto (from lead/customer state) --</option>
                    {INDIAN_STATES.map((state) => (
                      <option key={state} value={state}>{state}</option>
                    ))}
                  </select>
                  <span className="mt-1 block text-xs text-slate-400">
                    Leave blank to auto-fill from the lead or matched customer state. Override only when the place of service delivery differs.
                  </span>
                </label>
              </div>

              <label className="block">
                <span className={labelCls}>Notes</span>
                <textarea
                  className={`${field} h-full min-h-32 resize-y`}
                  placeholder="Additional booking notes or instructions"
                  {...register('notes')}
                />
              </label>
            </div>

            {/* Create New Customer — only when no matching customer exists. */}
            {newCustomerRequired && (
              <section className="rounded-md border border-slate-200 p-4">
                <h2 className="text-sm font-semibold text-slate-800">Create New Customer</h2>
                <hr className="my-3 border-slate-200" />
                <div className="grid gap-3 md:grid-cols-3">
                  <label className="block">
                    <span className={labelCls}>Full Name *</span>
                    <input
                      className={field}
                      {...register('customerName', { required: true, minLength: 2 })}
                    />
                    {errors.customerName && (
                      <span className="text-xs text-red-600">A customer name is required.</span>
                    )}
                  </label>
                  <label className="block">
                    <span className={labelCls}>Phone *</span>
                    <input
                      className={field}
                      {...register('customerPhone', { required: true, minLength: 5 })}
                    />
                    {errors.customerPhone && (
                      <span className="text-xs text-red-600">A phone number is required.</span>
                    )}
                  </label>
                  <label className="block">
                    <span className={labelCls}>Email</span>
                    <input
                      type="email"
                      className={field}
                      placeholder={data.lead.email?.trim() ? '' : 'Optional'}
                      {...register('customerEmail')}
                    />
                  </label>
                </div>
                <div className="mt-3 flex flex-wrap items-start gap-6">
                  <label className="flex items-start gap-2 pt-2 text-sm text-slate-700">
                    <input type="checkbox" className="mt-0.5" {...register('foreignNational')} />
                    <span>
                      <span className="font-medium">Foreign National</span>
                      <span className="mt-0.5 block text-xs text-slate-400">
                        Check if the customer is not an Indian resident.
                      </span>
                    </span>
                  </label>
                  <label className="block w-64">
                    <span className={labelCls}>State *</span>
                    <select
                      className={`${field} appearance-none`}
                      {...register('customerState', {
                        validate: (value) => {
                          if (getValues('foreignNational')) return true;
                          if (!value) return 'State is required for a domestic customer.';
                          return true;
                        },
                      })}
                    >
                      <option value="">-- Select State --</option>
                      {INDIAN_STATES.map((state) => (
                        <option key={state} value={state}>{state}</option>
                      ))}
                    </select>
                    {errors.customerState && (
                      <span className="text-xs text-red-600">{errors.customerState.message}</span>
                    )}
                  </label>
                </div>
              </section>
            )}

            {/* Booking Reminders */}
            <section className="rounded-md border border-slate-200 p-4">
              <h2 className="text-sm font-semibold text-slate-800">Booking Reminders</h2>
              <p className="mt-1 text-sm text-slate-500">
                Set reminders before travel start date ({formatDay(data.duration.travelStart)}). Reminders will be sent to the company admin and lead assignee.
              </p>
              <div className="mt-3 space-y-3">
                {fields.map((row, index) => {
                  const currentOffset = watchedReminders[index]?.daysBefore;
                  return (
                    <div key={row.id} className="flex flex-wrap items-center gap-3">
                      <label className="block">
                        <span className={labelCls}>Days Before Travel</span>
                        <select className={`${field} min-w-40`} {...register(`reminders.${index}.daysBefore`)}>
                          <option value="">Select...</option>
                          {REMINDER_OPTIONS.map((option) => (
                            <option
                              key={option.value}
                              value={option.value}
                              disabled={usedOffsets.has(option.value) && currentOffset !== option.value}
                            >
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block">
                        <span className={labelCls}>Reminder Time</span>
                        <input
                          type="time"
                          className={field}
                          {...register(`reminders.${index}.dueTime`, {
                            validate: (value) => {
                              const offset = getValues(`reminders.${index}.daysBefore`);
                              if (offset && !value) return 'Reminder time is required for this reminder.';
                              return true;
                            },
                          })}
                        />
                        {errors.reminders?.[index]?.dueTime && (
                          <span className="block text-xs text-red-600">
                            {errors.reminders?.[index]?.dueTime?.message}
                          </span>
                        )}
                      </label>
                      {fields.length > 1 && (
                        <button
                          type="button"
                          aria-label="Remove reminder"
                          onClick={() => remove(index)}
                          className="mt-5 inline-flex items-center gap-1 rounded-md bg-red-50 px-2 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Remove
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
              {hasDuplicateOffsets && (
                <p className="mt-2 text-xs text-red-600">Duplicate reminder offsets are not allowed.</p>
              )}
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="mt-3 border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                onClick={() => append({ daysBefore: '', dueTime: '11:00' })}
              >
                + Add Another Reminder
              </Button>
            </section>

            {create.isError && (
              <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {(create.error as Error)?.message}
              </div>
            )}

            {/* Bottom action row */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
              <Button type="submit" isLoading={create.isPending}>
                Create Booking
              </Button>
              <Link
                to={`/queries/${leadId}`}
                className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-card px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <ArrowLeft className="h-4 w-4" /> Back to Lead
              </Link>
            </div>
          </form>
        </>
      )}
    </div>
  );
}
