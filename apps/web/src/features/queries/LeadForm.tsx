import { useEffect } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { SERVICE_TYPES, type QueryInput } from '@interscale/shared';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/features/auth/AuthProvider';
import { useLeadLookups, usePhoneSearch, type Lead } from './queries.api';
import { useCustomer, useCustomerDuplicates } from '@/features/customers/customers.api';

interface ItineraryForm {
  country: string;
  destination: string;
  nights: number;
  sequence: number;
  arrivalDate: string;
  departureDate: string;
  notes: string;
}
interface FormValues {
  customerId: string;
  createNewCustomer: boolean;
  createAnyway: boolean;
  customerName: string;
  phone: string;
  alternatePhone: string;
  email: string;
  dateOfBirth: string;
  leadSource: string;
  leadType: string;
  leadStage: string;
  priority: string;
  departureCountry: string;
  departureCity: string;
  travelStartDate: string;
  travelEndDate: string;
  flexibleDates: boolean;
  rooms: number;
  adults: number;
  childrenWithBed: number;
  childrenWithoutBed: number;
  infants: number;
  extraBeds: number;
  expectedAmount: string;
  budgetMin: string;
  budgetMax: string;
  expectedMargin: string;
  currency: string;
  tripType: string;
  quotationRequired: boolean;
  bookingStatusPlaceholder: string;
  webLinkPlaceholder: string;
  supplierCostingNotes: string;
  assignedToId: string;
  internalRemarks: string;
  services: string[];
  itinerary: ItineraryForm[];
  initialNote: string;
  followUpAt: string;
}
const emptyRow = (sequence = 1): ItineraryForm => ({
  country: '',
  destination: '',
  nights: 1,
  sequence,
  arrivalDate: '',
  departureDate: '',
  notes: '',
});
const dateValue = (value?: string | null) => (value ? value.slice(0, 10) : '');
function defaults(lead?: Lead): FormValues {
  return {
    customerId: lead?.customer?.id ?? '',
    createNewCustomer: false,
    createAnyway: false,
    customerName: lead?.customerName ?? '',
    phone: lead?.phone ?? '',
    alternatePhone: lead?.alternatePhone ?? '',
    email: lead?.email ?? '',
    dateOfBirth: dateValue(lead?.dateOfBirth),
    leadSource: lead?.leadSource ?? 'WEBSITE',
    leadType: lead?.leadType ?? 'FRESH',
    leadStage: lead?.leadStage ?? 'NEW_LEAD',
    priority: lead?.priority ?? 'MEDIUM',
    departureCountry: lead?.departureCountry ?? '',
    departureCity: lead?.departureCity ?? '',
    travelStartDate: dateValue(lead?.travelStartDate),
    travelEndDate: dateValue(lead?.travelEndDate),
    flexibleDates: lead?.flexibleDates ?? false,
    rooms: lead?.rooms ?? 1,
    adults: lead?.adults ?? 1,
    childrenWithBed: lead?.childrenWithBed ?? 0,
    childrenWithoutBed: lead?.childrenWithoutBed ?? 0,
    infants: lead?.infants ?? 0,
    extraBeds: lead?.extraBeds ?? 0,
    expectedAmount: lead?.expectedAmount ?? '',
    budgetMin: lead?.budgetMin ?? '',
    budgetMax: lead?.budgetMax ?? '',
    expectedMargin: lead?.expectedMargin ?? '',
    currency: lead?.currency ?? 'INR',
    tripType: lead?.tripType ?? '',
    quotationRequired: lead?.quotationRequired ?? false,
    bookingStatusPlaceholder: lead?.bookingStatusPlaceholder ?? '',
    webLinkPlaceholder: lead?.webLinkPlaceholder ?? '',
    supplierCostingNotes: lead?.supplierCostingNotes ?? '',
    assignedToId: lead?.assignedToId ?? '',
    internalRemarks: lead?.internalRemarks ?? '',
    services: lead?.services.map((s) => s.serviceType) ?? ['GENERAL_ENQUIRY'],
    itinerary: lead?.itinerary.map((r) => ({
      ...r,
      arrivalDate: dateValue(r.arrivalDate),
      departureDate: dateValue(r.departureDate),
      notes: r.notes ?? '',
    })) ?? [emptyRow()],
    initialNote: '',
    followUpAt: '',
  };
}
const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className="space-y-1 text-sm font-medium text-slate-700">
    <span>{label}</span>
    {children}
  </label>
);
const inputClass = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm';
const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
    <h2 className="mb-4 text-base font-semibold text-slate-900">{title}</h2>
    {children}
  </section>
);

export function LeadForm({
  lead,
  onSave,
  saving,
  error,
}: {
  lead?: Lead;
  onSave: (v: QueryInput) => void;
  saving: boolean;
  error?: string;
}) {
  const { hasPermission, user } = useAuth();
  const [searchParams] = useSearchParams();
  const requestedCustomerId = lead ? '' : (searchParams.get('customerId') ?? '');
  const requestedCustomer = useCustomer(requestedCustomerId || undefined);
  const { data: lookups } = useLeadLookups();
  const {
    register,
    control,
    watch,
    setValue,
    reset,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<FormValues>({ defaultValues: defaults(lead) });
  useEffect(() => reset(defaults(lead)), [lead, reset]);
  useEffect(() => {
    if (!requestedCustomer.data || lead) return;
    setValue('customerId', requestedCustomer.data.id);
    setValue('customerName', requestedCustomer.data.displayName);
    setValue('phone', requestedCustomer.data.primaryPhone ?? '');
    setValue('email', requestedCustomer.data.email ?? '');
    setValue('alternatePhone', requestedCustomer.data.alternatePhone ?? '');
  }, [lead, requestedCustomer.data, setValue]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (isDirty) event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [isDirty]);
  const { fields, append, remove, move } = useFieldArray({ control, name: 'itinerary' });
  const phone = watch('phone');
  const customerName = watch('customerName');
  const email = watch('email');
  const services = watch('services');
  const counts = watch([
    'rooms',
    'adults',
    'childrenWithBed',
    'childrenWithoutBed',
    'infants',
    'extraBeds',
  ]);
  const matches = usePhoneSearch(phone);
  const customerMatches = useCustomerDuplicates({ displayName: customerName, phone, email });
  const summary = [
    `${counts[0] || 0} Room${counts[0] === 1 ? '' : 's'}`,
    `${counts[1] || 0} Adult${counts[1] === 1 ? '' : 's'}`,
    counts[2] ? `${counts[2]} Child With Bed` : '',
    counts[3] ? `${counts[3]} Child Without Bed` : '',
    counts[4] ? `${counts[4]} Infant${counts[4] === 1 ? '' : 's'}` : '',
    counts[5] ? `${counts[5]} Extra Bed${counts[5] === 1 ? '' : 's'}` : '',
  ]
    .filter(Boolean)
    .join(', ');
  const submit = (v: FormValues) =>
    onSave({
      ...v,
      email: v.email || null,
      alternatePhone: v.alternatePhone || null,
      dateOfBirth: v.dateOfBirth ? new Date(v.dateOfBirth) : null,
      departureCountry: v.departureCountry || null,
      departureCity: v.departureCity || null,
      travelStartDate: v.travelStartDate ? new Date(v.travelStartDate) : null,
      travelEndDate: v.travelEndDate ? new Date(v.travelEndDate) : null,
      expectedAmount: v.expectedAmount ? Number(v.expectedAmount) : null,
      budgetMin: v.budgetMin ? Number(v.budgetMin) : null,
      budgetMax: v.budgetMax ? Number(v.budgetMax) : null,
      expectedMargin: v.expectedMargin ? Number(v.expectedMargin) : null,
      tripType: v.tripType || null,
      bookingStatusPlaceholder: v.bookingStatusPlaceholder || null,
      webLinkPlaceholder: v.webLinkPlaceholder || null,
      supplierCostingNotes: v.supplierCostingNotes || null,
      assignedToId: v.assignedToId || null,
      internalRemarks: v.internalRemarks || null,
      services: v.services as QueryInput['services'],
      itinerary: v.itinerary.map((r, index) => ({
        ...r,
        sequence: index + 1,
        arrivalDate: r.arrivalDate ? new Date(r.arrivalDate) : null,
        departureDate: r.departureDate ? new Date(r.departureDate) : null,
        notes: r.notes || null,
      })),
      initialNote: v.initialNote || null,
      initialFollowUp: v.followUpAt
        ? { scheduledAt: new Date(v.followUpAt), assignedToId: v.assignedToId || user?.id }
        : undefined,
    } as QueryInput);
  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-5">
      {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      <Section title="Lead Information">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Field label="Customer name *">
            <input
              aria-label="Customer name"
              className={inputClass}
              {...register('customerName', { required: true, minLength: 2 })}
            />
            {errors.customerName && (
              <span className="text-xs text-red-600">Enter the customer name.</span>
            )}
          </Field>
          <Field label="Primary phone *">
            <input
              aria-label="Primary phone"
              className={inputClass}
              inputMode="tel"
              {...register('phone', { required: true, minLength: 5 })}
            />
          </Field>
          <Field label="Alternate phone">
            <input className={inputClass} {...register('alternatePhone')} />
          </Field>
          <Field label="Email">
            <input className={inputClass} type="email" {...register('email')} />
          </Field>
          {matches.data && matches.data.length > 0 && !lead && (
            <div className="md:col-span-2 lg:col-span-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
              <p className="font-medium text-amber-900">Possible duplicate leads found</p>
              {matches.data.map((m) => (
                <button
                  type="button"
                  key={m.id}
                  className="mr-3 mt-2 rounded-md bg-white px-3 py-2 text-left shadow-sm"
                  onClick={() => {
                    // The explicit "Use details" action is the confirmation;
                    // matches never overwrite the form automatically.
                    setValue('customerName', m.customerName, { shouldDirty: true });
                    setValue('phone', m.phone, { shouldDirty: true });
                    setValue('alternatePhone', m.alternatePhone ?? '', { shouldDirty: true });
                    setValue('email', m.email ?? '', { shouldDirty: true });
                  }}
                >
                  Use details from <strong>{m.queryNumber}</strong> · {m.customerName}
                </button>
              ))}
            </div>
          )}
          {customerMatches.data && customerMatches.data.length > 0 && !lead && (
            <div className="md:col-span-2 lg:col-span-4 rounded-lg border border-brand-200 bg-brand-50 p-3 text-sm">
              <p className="font-medium text-brand-900">Matching customer profiles</p>
              <p className="text-xs text-brand-700">
                Choose a profile to link this lead. If there is one exact match, the server links it
                automatically.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {customerMatches.data.map((match) => (
                  <label
                    key={match.id}
                    className="flex cursor-pointer items-center gap-2 rounded-md border bg-white px-3 py-2 shadow-sm"
                  >
                    <input type="radio" value={match.id} {...register('customerId')} />
                    <span>
                      <strong>{match.displayName}</strong>
                      <span className="block text-xs text-slate-500">
                        {match.customerNumber} · {match.primaryPhone || match.email}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
              <label className="mt-3 flex items-center gap-2">
                <input type="checkbox" {...register('createNewCustomer')} />
                Create a separate customer instead
              </label>
              {customerMatches.data.some((match) => match.strongMatch) && (
                <label className="mt-2 flex items-center gap-2">
                  <input type="checkbox" {...register('createAnyway')} />I reviewed the exact match
                  and still want a separate profile
                </label>
              )}
            </div>
          )}
          <Field label="Date of birth">
            <input className={inputClass} type="date" {...register('dateOfBirth')} />
          </Field>
          {(['leadSource', 'leadType', 'leadStage', 'priority'] as const).map((name) => (
            <Field
              key={name}
              label={
                (
                  {
                    leadSource: 'Lead source *',
                    leadType: 'Lead type *',
                    leadStage: 'Lead stage *',
                    priority: 'Priority *',
                  } as const
                )[name]
              }
            >
              <select className={inputClass} {...register(name)}>
                {lookups?.[
                  name === 'leadSource'
                    ? 'leadSources'
                    : name === 'leadType'
                      ? 'leadTypes'
                      : name === 'leadStage'
                        ? 'leadStages'
                        : 'priorities'
                ].map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
          ))}
          <Field label="Assignment">
            <select
              aria-label="Assigned salesperson"
              className={inputClass}
              disabled={!hasPermission('queries.assign')}
              {...register('assignedToId')}
            >
              <option value={user?.id}>Assign to me</option>
              {lookups?.assignableUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.fullName}
                </option>
              ))}
            </select>
          </Field>
          <label className="md:col-span-2 lg:col-span-3 space-y-1 text-sm font-medium">
            <span>Internal remarks</span>
            <textarea className={inputClass} rows={2} {...register('internalRemarks')} />
          </label>
        </div>
      </Section>
      <Section title="Travel Details">
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Travel start">
            <input className={inputClass} type="date" {...register('travelStartDate')} />
          </Field>
          <Field label="Travel end">
            <input className={inputClass} type="date" {...register('travelEndDate')} />
          </Field>
          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <input type="checkbox" {...register('flexibleDates')} /> Flexible dates
          </label>
          <Field label="Departure country">
            <input list="countries" className={inputClass} {...register('departureCountry')} />
            <datalist id="countries">
              {lookups?.countries.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </datalist>
          </Field>
          <Field label="Departure city">
            <input list="cities" className={inputClass} {...register('departureCity')} />
            <datalist id="cities">
              {lookups?.cities.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </datalist>
          </Field>
        </div>
      </Section>
      <Section title="Traveller Configuration">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-6">
          {(
            [
              'rooms',
              'adults',
              'childrenWithBed',
              'childrenWithoutBed',
              'infants',
              'extraBeds',
            ] as const
          ).map((name) => (
            <Field
              key={name}
              label={
                (
                  {
                    rooms: 'Rooms',
                    adults: 'Adults',
                    childrenWithBed: 'Children + bed',
                    childrenWithoutBed: 'Children no bed',
                    infants: 'Infants',
                    extraBeds: 'Extra beds',
                  } as const
                )[name]
              }
            >
              <input
                className={inputClass}
                type="number"
                min={name === 'rooms' || name === 'adults' ? 1 : 0}
                {...register(name, { valueAsNumber: true })}
              />
            </Field>
          ))}
        </div>
        <p className="mt-3 rounded-lg bg-brand-50 px-3 py-2 text-sm font-medium text-brand-800">
          {summary}
        </p>
      </Section>
      <Section title="Services Required">
        <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {(lookups?.serviceTypes ?? SERVICE_TYPES.map((value) => ({ value, label: value }))).map(
            (s) => (
              <label
                key={s.value}
                className="flex items-center gap-2 rounded-lg border p-3 text-sm"
              >
                <input
                  type="checkbox"
                  checked={services.includes(s.value)}
                  onChange={(e) =>
                    setValue(
                      'services',
                      e.target.checked
                        ? [...services, s.value]
                        : services.filter((x) => x !== s.value),
                      { shouldDirty: true },
                    )
                  }
                />
                {s.label}
              </label>
            ),
          )}
        </div>
        {services.length === 0 && (
          <p className="mt-2 text-sm text-red-600">Select at least one service.</p>
        )}
      </Section>
      <Section title="Itinerary">
        <div className="space-y-3">
          {fields.map((field, index) => (
            <div key={field.id} className="grid gap-3 rounded-lg bg-slate-50 p-3 md:grid-cols-12">
              <input
                aria-label={`Country ${index + 1}`}
                placeholder="Country"
                className={`${inputClass} md:col-span-2`}
                {...register(`itinerary.${index}.country`, { required: true })}
              />
              <input
                aria-label={`Destination ${index + 1}`}
                placeholder="Destination / city *"
                className={`${inputClass} md:col-span-3`}
                {...register(`itinerary.${index}.destination`, { required: true })}
              />
              <input
                aria-label={`Nights ${index + 1}`}
                type="number"
                min="0"
                className={`${inputClass} md:col-span-1`}
                {...register(`itinerary.${index}.nights`, { valueAsNumber: true })}
              />
              <input
                aria-label={`Arrival ${index + 1}`}
                type="date"
                className={`${inputClass} md:col-span-2`}
                {...register(`itinerary.${index}.arrivalDate`)}
              />
              <input
                aria-label={`Departure ${index + 1}`}
                type="date"
                className={`${inputClass} md:col-span-2`}
                {...register(`itinerary.${index}.departureDate`)}
              />
              <div className="flex gap-1 md:col-span-2">
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label="Move up"
                  disabled={index === 0}
                  onClick={() => move(index, index - 1)}
                >
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label="Move down"
                  disabled={index === fields.length - 1}
                  onClick={() => move(index, index + 1)}
                >
                  <ArrowDown className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label="Remove itinerary"
                  disabled={fields.length === 1}
                  onClick={() => remove(index)}
                >
                  <Trash2 className="h-4 w-4 text-red-600" />
                </Button>
              </div>
            </div>
          ))}
        </div>
        <Button
          className="mt-3"
          variant="secondary"
          onClick={() => append(emptyRow(fields.length + 1))}
        >
          <Plus className="h-4 w-4" /> Add destination
        </Button>
      </Section>
      <Section title="Commercial Details">
        <div className="grid gap-4 md:grid-cols-4">
          <Field label="Expected amount">
            <input className={inputClass} type="number" min="0" {...register('expectedAmount')} />
          </Field>
          <Field label="Minimum budget">
            <input className={inputClass} type="number" min="0" {...register('budgetMin')} />
          </Field>
          <Field label="Maximum budget">
            <input className={inputClass} type="number" min="0" {...register('budgetMax')} />
          </Field>
          <Field label="Currency">
            <select className={inputClass} {...register('currency')}>
              {lookups?.currencies.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </Field>
          <Field label="Expected margin">
            <input className={inputClass} type="number" min="0" {...register('expectedMargin')} />
          </Field>
          <Field label="Trip type">
            <select className={inputClass} {...register('tripType')}>
              <option value="">Select</option>
              {lookups?.tripTypes.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </Field>
          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <input type="checkbox" {...register('quotationRequired')} /> Quotation required
          </label>
          <Field label="Booking status placeholder">
            <input className={inputClass} {...register('bookingStatusPlaceholder')} />
          </Field>
          <Field label="Web link placeholder">
            <input className={inputClass} type="url" {...register('webLinkPlaceholder')} />
          </Field>
          <label className="space-y-1 text-sm font-medium md:col-span-3">
            <span>Supplier / costing notes</span>
            <textarea className={inputClass} rows={2} {...register('supplierCostingNotes')} />
          </label>
        </div>
      </Section>
      {!lead && (
        <Section title="Follow-Up and Notes">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Initial follow-up">
              <input className={inputClass} type="datetime-local" {...register('followUpAt')} />
            </Field>
            <label className="space-y-1 text-sm font-medium">
              <span>Initial note</span>
              <textarea className={inputClass} rows={3} {...register('initialNote')} />
            </label>
          </div>
        </Section>
      )}
      <div className="sticky bottom-4 flex justify-end rounded-xl border bg-white/95 p-3 shadow-lg backdrop-blur">
        <Button type="submit" isLoading={saving} disabled={services.length === 0}>
          {lead ? 'Save changes' : 'Create lead'}
        </Button>
      </div>
    </form>
  );
}
