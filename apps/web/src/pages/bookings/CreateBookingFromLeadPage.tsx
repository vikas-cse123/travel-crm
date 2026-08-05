import { lazy, useMemo } from 'react';
import { ArrowLeft, CheckCircle2, ChevronDown, Trash2 } from 'lucide-react';
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
  'w-full rounded-lg border border-slate-300 bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500';
const labelCls = 'text-sm font-medium text-slate-700';

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
  reminders: ReminderRow[];
}

const formatAmount = (value: string, currency: string) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency, minimumFractionDigits: 2 }).format(
    Number(value) || 0,
  );

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
    formState: { errors },
  } = useForm<FormValues>({
    defaultValues: {
      title: '',
      notes: '',
      totalSellingAmount: '',
      tcsExempt: false,
      gstChoice: '',
      placeOfSupply: '',
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
  if (prefilledTitle && !watch('title')) setValue('title', prefilledTitle);
  if (data && !watch('totalSellingAmount')) setValue('totalSellingAmount', data.quotation.finalAmount);

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

  const onSubmit = (values: FormValues) => {
    const [gstRate, gstMode] = values.gstChoice ? values.gstChoice.split(':') : ['', ''];
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
        reminders: values.reminders.map((row) => ({
          daysBefore: Number(row.daysBefore),
          dueTime: row.dueTime,
        })),
      },
      {
        onSuccess: (booking) => navigate(`/bookings/${booking.id}`),
      },
    );
  };

  const duplicateOffsets = (rows: ReminderRow[]) => {
    const seen = new Set<string>();
    let duplicate = false;
    for (const row of rows) {
      if (seen.has(row.daysBefore)) duplicate = true;
      seen.add(row.daysBefore);
    }
    return duplicate;
  };

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="text-sm text-slate-500">
        <Link to="/" className="hover:text-slate-800">Home</Link>
        <span className="mx-1.5">/</span>
        <Link to="/bookings" className="hover:text-slate-800">Bookings</Link>
        <span className="mx-1.5">/</span>
        <span className="font-medium text-slate-800">Create</span>
      </nav>

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Create Booking</h1>
      </div>

      {preview.isLoading && (
        <div className="flex h-64 items-center justify-center text-sm text-slate-500">
          Loading booking preview...
        </div>
      )}

      {preview.isError && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-800">
          <p className="font-semibold">Unable to load booking preview.</p>
          <p className="mt-1 text-sm">{(preview.error as Error)?.message}</p>
          <Link to={`/queries/${leadId}`} className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-brand-700 hover:underline">
            <ArrowLeft className="h-4 w-4" /> Back to Lead
          </Link>
        </div>
      )}

      {data && (
        <>
          {/* Blue strip */}
          <div className="rounded-lg bg-blue-600 px-5 py-3 text-white">
            <p className="font-semibold">Create Booking from Lead: {data.lead.customerName}</p>
          </div>

          {/* Lead Information panel + customer status card */}
          <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
            <section className="rounded-xl border border-teal-200 bg-teal-50 p-5">
              <h2 className="font-semibold text-teal-900">Lead Information</h2>
              <div className="mt-4 grid gap-5 md:grid-cols-3">
                <div className="space-y-1.5 text-sm">
                  <p><span className="font-medium text-slate-600">Lead:</span> {data.lead.customerName}</p>
                  <p><span className="font-medium text-slate-600">Phone:</span> {data.lead.phone}</p>
                  <p><span className="font-medium text-slate-600">Email:</span> {data.lead.email || '—'}</p>
                </div>
                <div className="space-y-1.5 text-sm">
                  <p>
                    <span className="font-medium text-slate-600">Travel Date:</span>{' '}
                    {data.lead.travelStartDate
                      ? new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(data.lead.travelStartDate))
                      : '—'}
                  </p>
                  <p>
                    <span className="font-medium text-slate-600">Duration:</span> {data.lead.travellerSummary ? '—' : '—'} {data.lead.travelStartDate && data.lead.travelEndDate ? `${Math.round((new Date(data.lead.travelEndDate).getTime() - new Date(data.lead.travelStartDate).getTime()) / 86_400_000)} Nights / ${Math.round((new Date(data.lead.travelEndDate).getTime() - new Date(data.lead.travelStartDate).getTime()) / 86_400_000) + 1} Days` : '—'}
                  </p>
                  <p><span className="font-medium text-slate-600">Travellers:</span> {data.lead.travellerSummary}</p>
                </div>
                <div className="space-y-1.5 text-sm">
                  <p><span className="font-medium text-slate-600">Stage:</span> Booking Confirmed</p>
                  <p><span className="font-medium text-slate-600">Quotation:</span> Version {data.quotation.versionNumber}</p>
                  <p>
                    <span className="font-medium text-slate-600">Customer Price:</span>{' '}
                    {formatAmount(data.quotation.finalAmount, data.quotation.currency)}
                  </p>
                </div>
              </div>
              <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Services will be imported with profit tracking.
              </p>
            </section>

            {/* Customer status card */}
            {customerConflict ? (
              <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-red-800">
                <h3 className="font-semibold">Duplicate Customers</h3>
                <p className="mt-1 text-sm">
                  Multiple customers match this lead. Resolve the duplicates before creating the booking.
                </p>
              </div>
            ) : existingCustomer ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
                <h3 className="flex items-center gap-2 font-semibold text-emerald-900">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Existing Customer
                </h3>
                {customer && 'customerNumber' in customer && (
                  <p className="mt-1 text-sm font-medium text-emerald-800">
                    {customer.customerNumber} - {customer.displayName}
                  </p>
                )}
                <p className="mt-2 text-sm text-emerald-800">
                  This booking will be linked to the existing customer.
                </p>
              </div>
            ) : (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
                <h3 className="flex items-center gap-2 font-semibold text-amber-900">
                  <span className="rounded bg-amber-500 px-2 py-0.5 text-xs font-bold text-white">New</span> Customer
                </h3>
                <p className="mt-2 text-sm text-amber-800">
                  No existing customer was found for this phone number. A new customer will be created when the booking is created.
                </p>
              </div>
            )}
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {/* Booking title + notes */}
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-1">
                <span className={labelCls}>Booking Title *</span>
                <input className={field} {...register('title', { required: true })} />
                {errors.title && <span className="text-xs text-red-600">Booking title is required.</span>}
              </label>
              <label className="space-y-1">
                <span className={labelCls}>Notes</span>
                <textarea
                  className={`${field} min-h-20 resize-y`}
                  placeholder="Additional booking notes or instructions"
                  {...register('notes')}
                />
              </label>
            </div>

            {/* Amount + tax fields */}
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-1">
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
                <span className="block text-xs text-slate-400">
                  This is the total amount charged to the customer. Profit = Customer Amount - Vendor Costs.
                </span>
              </label>
              <div className="space-y-1">
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
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-1">
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
              <label className="space-y-1">
                <span className={labelCls}>Place of Supply (State)</span>
                <select className={`${field} appearance-none`} {...register('placeOfSupply')}>
                  <option value="">-- Auto (from lead/customer state) --</option>
                  {INDIAN_STATES.map((state) => (
                    <option key={state} value={state}>{state}</option>
                  ))}
                </select>
                <span className="block text-xs text-slate-400">
                  Leave blank to auto-fill from the lead or matched customer state. Override only when the place of service delivery differs.
                </span>
              </label>
            </div>

            {/* Booking reminders */}
            <section className="rounded-xl border border-slate-200 bg-card p-5">
              <h2 className="font-semibold text-slate-800">Booking Reminders</h2>
              <p className="mt-1 text-sm text-slate-500">
                Set reminders before travel start date. Reminders will be sent to the company admin and lead assignee.
              </p>
              <div className="mt-4 space-y-3">
                {fields.map((row, index) => (
                  <div key={row.id} className="flex flex-wrap items-center gap-3">
                    <label className="space-y-1">
                      <span className={labelCls}>Days Before Travel</span>
                      <select className={`${field} min-w-40`} {...register(`reminders.${index}.daysBefore`)}>
                        {REMINDER_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </label>
                    <label className="space-y-1">
                      <span className={labelCls}>Reminder Time</span>
                      <input type="time" className={field} {...register(`reminders.${index}.dueTime`, { required: true })} />
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
                ))}
              </div>
              {duplicateOffsets(watch('reminders')) && (
                <p className="mt-2 text-xs text-red-600">Duplicate reminder offsets are not allowed.</p>
              )}
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="mt-4"
                onClick={() => append({ daysBefore: '2', dueTime: '11:00' })}
              >
                + Add Another Reminder
              </Button>
            </section>

            {create.isError && (
              <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {(create.error as Error)?.message}
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Button type="submit" isLoading={create.isPending} disabled={Boolean(preview.data && false)}>
                Create Booking
              </Button>
              <Link
                to={`/queries/${leadId}`}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-card px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
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
