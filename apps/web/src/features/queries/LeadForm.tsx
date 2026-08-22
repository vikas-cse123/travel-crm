import { useEffect, useMemo, useRef, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import {
  Car,
  FileText,
  Hotel,
  PackagePlus,
  Plane,
  Search,
  Ship,
  Telescope,
  Trash2,
  Train,
  type LucideIcon,
} from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { type QueryInput } from '@interscale/shared';
import countries from 'world-countries';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/features/auth/AuthProvider';
import { useLead, useLeadLookups, usePhoneSearch, type Lead, type UserOption } from './queries.api';
import { useCustomer } from '@/features/customers/customers.api';
import { useDestinations } from '@/features/masters/masters.api';
import { cn } from '@/utils/cn';

const ITINERARY_DESTINATIONS_PARAMS = new URLSearchParams('pageSize=100&status=ACTIVE');

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
    departureCountry: lead?.departureCountry ?? 'India',
    departureCity: lead?.departureCity ?? 'Mumbai',
    travelStartDate: dateValue(lead?.travelStartDate),
    travelEndDate: '',
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
    services: lead ? lead.services.map((s) => s.serviceType) : ['HOTEL', 'SIGHTSEEING'],
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
const inputClass = 'w-full rounded-lg border border-slate-300 bg-card px-3 py-2 text-sm';
const sectionTones = {
  blue: 'bg-blue-600 text-white',
  teal: 'bg-teal-600 text-white',
  green: 'bg-green-600 text-white',
  slate: 'bg-slate-900 text-white',
} as const;
const Section = ({
  title,
  children,
  tone = 'slate',
}: {
  title: string;
  children: React.ReactNode;
  tone?: keyof typeof sectionTones;
}) => (
  <section className="overflow-hidden rounded-lg border border-slate-200 bg-card shadow-sm">
    <h2 className={cn('px-4 py-3 text-sm font-semibold', sectionTones[tone])}>{title}</h2>
    <div className="p-4">{children}</div>
  </section>
);
const INDIAN_DEPARTURE_CITIES = [
  { value: 'Ahmedabad', label: 'Ahmedabad (AMD)' },
  { value: 'Agra', label: 'Agra' },
  { value: 'Ajmer', label: 'Ajmer' },
  { value: 'Alappuzha', label: 'Alappuzha' },
  { value: 'Amritsar', label: 'Amritsar (ATQ)' },
  { value: 'Aurangabad', label: 'Aurangabad' },
  { value: 'Bhopal', label: 'Bhopal (BHO)' },
  { value: 'Bhubaneswar', label: 'Bhubaneswar (BBI)' },
  { value: 'Bengaluru', label: 'Bengaluru (BLR)' },
  { value: 'Calicut', label: 'Calicut (CCJ)' },
  { value: 'Chandigarh', label: 'Chandigarh (IXC)' },
  { value: 'Chennai', label: 'Chennai (MAA)' },
  { value: 'Coimbatore', label: 'Coimbatore (CJB)' },
  { value: 'Darjeeling', label: 'Darjeeling' },
  { value: 'Dehradun', label: 'Dehradun (DED)' },
  { value: 'Delhi', label: 'Delhi (DEL)' },
  { value: 'Gangtok', label: 'Gangtok' },
  { value: 'Goa', label: 'Goa (GOI)' },
  { value: 'Guwahati', label: 'Guwahati (GAU)' },
  { value: 'Gwalior', label: 'Gwalior (GWL)' },
  { value: 'Hyderabad', label: 'Hyderabad (HYD)' },
  { value: 'Indore', label: 'Indore (IDR)' },
  { value: 'Jabalpur', label: 'Jabalpur (JLR)' },
  { value: 'Jaipur', label: 'Jaipur (JAI)' },
  { value: 'Jaisalmer', label: 'Jaisalmer (JSA)' },
  { value: 'Jodhpur', label: 'Jodhpur (JDH)' },
  { value: 'Kochi', label: 'Kochi (COK)' },
  { value: 'Kodaikanal', label: 'Kodaikanal' },
  { value: 'Kolkata', label: 'Kolkata (CCU)' },
  { value: 'Leh', label: 'Leh (IXL)' },
  { value: 'Lucknow', label: 'Lucknow (LKO)' },
  { value: 'Madurai', label: 'Madurai (IXM)' },
  { value: 'Manali', label: 'Manali' },
  { value: 'Mangalore', label: 'Mangalore (IXE)' },
  { value: 'Munnar', label: 'Munnar' },
  { value: 'Mumbai', label: 'Mumbai (BOM)' },
  { value: 'Mysuru', label: 'Mysuru (MYQ)' },
  { value: 'Nagpur', label: 'Nagpur (NAG)' },
  { value: 'Nainital', label: 'Nainital' },
  { value: 'Ooty', label: 'Ooty' },
  { value: 'Patna', label: 'Patna (PAT)' },
  { value: 'Port Blair', label: 'Port Blair (IXZ)' },
  { value: 'Pune', label: 'Pune (PNQ)' },
  { value: 'Raipur', label: 'Raipur (RPR)' },
  { value: 'Rajkot', label: 'Rajkot (RAJ)' },
  { value: 'Ranchi', label: 'Ranchi (IXR)' },
  { value: 'Rishikesh', label: 'Rishikesh' },
  { value: 'Shimla', label: 'Shimla (SLV)' },
  { value: 'Srinagar', label: 'Srinagar (SXR)' },
  { value: 'Surat', label: 'Surat (STV)' },
  { value: 'Tirupati', label: 'Tirupati (TIR)' },
  { value: 'Trivandrum', label: 'Trivandrum (TRV)' },
  { value: 'Udaipur', label: 'Udaipur (UDR)' },
  { value: 'Varanasi', label: 'Varanasi (VNS)' },
  { value: 'Vijayawada', label: 'Vijayawada (VGA)' },
  { value: 'Visakhapatnam', label: 'Visakhapatnam (VTZ)' },
];
const CREATE_LEAD_SERVICES = [
  'CRUISE',
  'FLIGHT',
  'HOTEL',
  'VEHICLE_TRANSFER',
  'SIGHTSEEING',
  'VISA',
  'OTHER_ADD_ON',
] as const;
const SERVICE_LABELS: Partial<Record<string, string>> = {
  VEHICLE_TRANSFER: 'Vehicle (disposal)',
  OTHER_ADD_ON: 'Add-on Service (Rail, Passport, etc.)',
};
const SERVICE_ICONS: Partial<Record<string, LucideIcon>> = {
  FLIGHT: Plane,
  HOTEL: Hotel,
  CRUISE: Ship,
  VEHICLE_TRANSFER: Car,
  SIGHTSEEING: Telescope,
  VISA: FileText,
  RAIL: Train,
  PASSPORT_ASSISTANCE: FileText,
  OTHER_ADD_ON: PackagePlus,
  GENERAL_ENQUIRY: FileText,
};

export function LeadForm({
  lead,
  onSave,
  saving,
  error,
  errorFields,
}: {
  lead?: Lead;
  onSave: (v: QueryInput) => void;
  saving: boolean;
  error?: string;
  errorFields?: Record<string, string[]>;
}) {
  const { hasPermission, user } = useAuth();
  const [searchPhone, setSearchPhone] = useState('');
  const [submittedSearchPhone, setSubmittedSearchPhone] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
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
    formState: { isDirty },
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
  const { fields, append, remove } = useFieldArray({ control, name: 'itinerary' });
  const services = watch('services');
  const departureCountry = watch('departureCountry');
  const counts = watch([
    'rooms',
    'adults',
    'childrenWithBed',
    'childrenWithoutBed',
    'infants',
    'extraBeds',
  ]);
  const searchedMatches = usePhoneSearch(submittedSearchPhone);
  const searchMatchId = lead ? undefined : searchedMatches.data?.[0]?.id;
  const searchedLead = useLead(searchMatchId);
  const autofilledIdRef = useRef<string | null>(null);
  useEffect(() => {
    const found = searchedLead.data;
    if (!found || lead) return;
    if (autofilledIdRef.current === found.id) return;
    autofilledIdRef.current = found.id;
    reset(defaults(found));
  }, [searchedLead.data, lead, reset]);
  const countryOptions = useMemo(
    () => countries.map((country) => country.name.common).sort((a, b) => a.localeCompare(b)),
    [],
  );
  const cityOptions = useMemo(() => {
    if (departureCountry === 'India') return INDIAN_DEPARTURE_CITIES;
    return (lookups?.cities ?? [])
      .map((city) => ({ value: city, label: city }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [departureCountry, lookups?.cities]);
  // Itinerary destinations come from the Destinations master so each row's City
  // dropdown can show the cities linked to the chosen destination.
  const itineraryDestinations = useDestinations(ITINERARY_DESTINATIONS_PARAMS);
  const destinationCityMap = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const destination of itineraryDestinations.data?.data ?? []) {
      map.set(
        destination.name,
        destination.cities
          .slice()
          .sort((a, b) => a.sequence - b.sequence)
          .map((link) => link.city.name),
      );
    }
    return map;
  }, [itineraryDestinations.data?.data]);
  const itineraryRows = watch('itinerary');
  const fieldErrorMessages = Object.entries(errorFields ?? {})
    .flatMap(([field, messages]) => messages.map((message) => ({ field, message })))
    .slice(0, 6);
  /**
   * Eligible assignees for the "Assign To" field. The logged-in user is always
   * included (placed first and labelled "(You)") and deduplicated against the
   * team-member list the backend returns, so an Admin/Owner can assign a lead
   * to themselves or to another eligible team member.
   */
  const assigneeOptions = useMemo(() => {
    const team = lookups?.assignableUsers ?? [];
    const existingCurrentUser = team.find((assignableUser) => assignableUser.id === user?.id);
    const others = team.filter((assignableUser) => assignableUser.id !== user?.id);
    if (!user) return others;
    const me: UserOption = existingCurrentUser ?? {
      id: user.id,
      fullName: (user.fullName || '').trim() || user.username || 'You',
      username: user.username,
    };
    return [me, ...others];
  }, [lookups, user]);
  const childrenWithBedCount = Math.max(0, Math.min(100, Number(counts[2]) || 0));
  const childrenWithoutBedCount = Math.max(0, Math.min(100, Number(counts[3]) || 0));
  const infantCount = Math.max(0, Math.min(100, Number(counts[4]) || 0));
  const summary = [
    `${counts[1] || 0} Adult${counts[1] === 1 ? '' : 's'}`,
    counts[2] ? `${counts[2]} Child With Bed` : '',
    counts[3] ? `${counts[3]} Child Without Bed` : '',
    counts[4] ? `${counts[4]} Infant${counts[4] === 1 ? '' : 's'}` : '',
    counts[5] ? `${counts[5]} Extra Bed${counts[5] === 1 ? '' : 's'}` : '',
  ]
    .filter(Boolean)
    .join(', ');
  const submit = (v: FormValues) => {
    const itinerary = v.itinerary
      .filter((r) => r.country.trim() && r.destination.trim())
      .map((r, index) => ({
        ...r,
        sequence: index + 1,
        arrivalDate: r.arrivalDate ? new Date(r.arrivalDate) : null,
        departureDate: r.departureDate ? new Date(r.departureDate) : null,
        notes: r.notes || null,
      }));

    if (hasPermission('queries.assign') && !v.assignedToId) {
      setLocalError('Please fix the following errors: Assign To is required.');
      return;
    }
    if (!v.travelStartDate) {
      setLocalError('Please fix the following errors: Travel date is required.');
      return;
    }
    if (v.services.length === 0) {
      setLocalError('Please fix the following errors: Select at least one service required.');
      return;
    }
    if (itinerary.length === 0) {
      setLocalError(
        'Please fix the following errors: At least one destination and city must be selected.',
      );
      return;
    }
    setLocalError(null);

    onSave({
      ...v,
      customerId: v.customerId || null,
      flexibleDates: false,
      email: v.email || null,
      alternatePhone: v.alternatePhone || null,
      dateOfBirth: v.dateOfBirth ? new Date(v.dateOfBirth) : null,
      departureCountry: v.departureCountry || null,
      departureCity: v.departureCity || null,
      travelStartDate: v.travelStartDate ? new Date(v.travelStartDate) : null,
      travelEndDate: null,
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
      itinerary,
      initialNote: v.initialNote || null,
      initialFollowUp: v.followUpAt
        ? { scheduledAt: new Date(v.followUpAt), assignedToId: v.assignedToId || user?.id }
        : undefined,
    } as QueryInput);
  };
  return (
    <form
      onSubmit={handleSubmit(submit)}
      onKeyDown={(event) => {
        const target = event.target as HTMLElement;
        if (event.key === 'Enter' && target.tagName !== 'TEXTAREA') {
          event.preventDefault();
        }
      }}
      className="space-y-5"
    >
      {(localError || error) && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <p>{localError ?? error}</p>
          {!localError && fieldErrorMessages.length > 0 && (
            <ul className="mt-2 list-inside list-disc space-y-1">
              {fieldErrorMessages.map(({ field, message }) => (
                <li key={`${field}-${message}`}>
                  {field}: {message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.95fr)]">
        <Section title="Lead Information" tone="blue">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {!lead && (
              <div className="md:col-span-2 lg:col-span-3">
                <p className="mb-2 text-sm font-semibold text-slate-900">
                  Search Existing Lead by Phone
                </p>
                <div className="flex overflow-hidden rounded-lg border border-slate-300 bg-card">
                  <input
                    aria-label="Search existing lead by phone"
                    className="min-w-0 flex-1 px-3 py-2 text-sm outline-none"
                    inputMode="tel"
                    value={searchPhone}
                    onChange={(event) => setSearchPhone(event.target.value)}
                    placeholder="Enter phone number to search"
                  />
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700"
                    onClick={() => setSubmittedSearchPhone(searchPhone.trim())}
                  >
                    <Search className="h-4 w-4" /> Search
                  </button>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  Search existing leads by phone number to auto-fill form
                </p>
                {searchedMatches.data && searchedMatches.data.length === 0 && (
                  <p className="mt-2 text-xs text-slate-500">No matching lead found.</p>
                )}
              </div>
            )}
            <div className="md:col-span-2 lg:col-span-3">
              <Field label="Name *">
                <input
                  aria-label="Name"
                  className={inputClass}
                  {...register('customerName', { required: true, minLength: 2 })}
                />
              </Field>
            </div>
            <div className="md:col-span-2 lg:col-span-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Phone *">
                <input
                  aria-label="Phone"
                  className={inputClass}
                  inputMode="tel"
                  {...register('phone', { required: true, minLength: 5 })}
                />
              </Field>
              <Field label="Email">
                <input className={inputClass} type="email" {...register('email')} />
              </Field>
            </div>
            {(['leadSource', 'leadType', 'leadStage', 'priority'] as const).map((name) => (
              <Field
                key={name}
                label={
                  (
                    {
                      leadSource: 'Received *',
                      leadType: 'Type *',
                      leadStage: 'Stage *',
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
            <div className="md:col-span-2 lg:col-span-3 space-y-3">
              <p className="text-sm font-semibold text-slate-900">Assign Type</p>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="radio" checked readOnly /> Manual Assignment
              </label>
              {hasPermission('queries.assign') && (
                <p className="text-xs text-slate-500">
                  Assign this lead to yourself or another team member. This field is required.
                </p>
              )}
            </div>
            <Field label="Assign To *">
              <select
                aria-label="Assigned salesperson"
                className={inputClass}
                disabled={!hasPermission('queries.assign')}
                {...register('assignedToId')}
              >
                <option value="">
                  {hasPermission('queries.assign') ? 'Select User' : 'Assign to me'}
                </option>
                {assigneeOptions.map((assignableUser) => (
                  <option key={assignableUser.id} value={assignableUser.id}>
                    {assignableUser.fullName}
                    {assignableUser.id === user?.id ? ' (You)' : ''}
                  </option>
                ))}
              </select>
            </Field>
            <div className="md:col-span-2 lg:col-span-3">
              <Field label="Birth Date">
                <input className={inputClass} type="date" {...register('dateOfBirth')} />
              </Field>
            </div>
          </div>
        </Section>
        <Section title="Travel Details" tone="teal">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Travel Date *">
              <input className={inputClass} type="date" {...register('travelStartDate')} />
            </Field>
            <Field label="Departure country">
              <select
                className={inputClass}
                {...register('departureCountry', {
                  onChange: () => setValue('departureCity', '', { shouldDirty: true }),
                })}
              >
                <option value="">Select country</option>
                {countryOptions.map((country) => (
                  <option key={country} value={country}>
                    {country}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Departure city">
              <select className={inputClass} {...register('departureCity')}>
                <option value="">Select city</option>
                {cityOptions.map((city) => (
                  <option key={`${city.value}-${city.label}`} value={city.value}>
                    {city.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="mt-5 rounded-lg bg-slate-50 p-4">
            <input type="hidden" {...register('rooms', { valueAsNumber: true })} />
            <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
              {(
                [
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
                        adults: 'Adults *',
                        childrenWithBed: 'CWB',
                        childrenWithoutBed: 'CWOB',
                        infants: 'Infants',
                        extraBeds: 'Extra Beds',
                      } as const
                    )[name]
                  }
                >
                  <input
                    className={inputClass}
                    type="number"
                    min={name === 'adults' ? 1 : 0}
                    {...register(name, { valueAsNumber: true })}
                  />
                </Field>
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-500">
              <strong>CWB</strong> = Child with Bed | <strong>CWOB</strong> = Child without Bed |{' '}
              <strong>Infants</strong> = Visa charges only
            </p>
            {childrenWithBedCount > 0 && (
              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
                {Array.from({ length: childrenWithBedCount }, (_, index) => (
                  <Field key={`cwb-age-${index}`} label={`CWB ${index + 1} Age`}>
                    <input
                      className={inputClass}
                      type="number"
                      min="0"
                      placeholder="Age"
                      defaultValue={8}
                    />
                  </Field>
                ))}
              </div>
            )}
            {childrenWithoutBedCount > 0 && (
              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
                {Array.from({ length: childrenWithoutBedCount }, (_, index) => (
                  <Field key={`cwob-age-${index}`} label={`CWOB ${index + 1} Age`}>
                    <input
                      className={inputClass}
                      type="number"
                      min="0"
                      placeholder="Age"
                      defaultValue={4}
                    />
                  </Field>
                ))}
              </div>
            )}
            {infantCount > 0 && (
              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
                {Array.from({ length: infantCount }, (_, index) => (
                  <Field key={`infant-age-${index}`} label={`Infant ${index + 1} Age`}>
                    <input
                      className={inputClass}
                      type="number"
                      min="0"
                      placeholder="Age"
                      defaultValue={1}
                    />
                  </Field>
                ))}
              </div>
            )}
            <div className="mt-4 bg-slate-100 p-3">
              <p className="mb-2 text-sm font-semibold text-slate-800">Travelers:</p>
              <div className="rounded border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                {summary || '1 Adult(s)'}
              </div>
            </div>
          </div>
        </Section>
      </div>
      <Section title="Services Required *" tone="green">
        <p className="mb-4 text-sm text-slate-500">
          Select at least one service required for this lead, or check Add-on Service:
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {CREATE_LEAD_SERVICES.filter((value) => value !== 'VISA').map((value) => {
            const Icon = SERVICE_ICONS[value] ?? PackagePlus;
            const label =
              SERVICE_LABELS[value] ??
              lookups?.serviceTypes.find((service) => service.value === value)?.label ??
              value;
            return (
              <label key={value} className="flex items-center gap-2 text-sm font-semibold">
                <input
                  type="checkbox"
                  checked={services.includes(value)}
                  onChange={(e) =>
                    setValue(
                      'services',
                      e.target.checked
                        ? [...services, value]
                        : services.filter((service) => service !== value),
                      { shouldDirty: true },
                    )
                  }
                />
                <Icon className="h-4 w-4 text-slate-700" />
                {label}
              </label>
            );
          })}
        </div>
        {services.length === 0 && (
          <p className="mt-3 text-sm text-red-600">Select at least one service.</p>
        )}
      </Section>
      <Section title="Itinerary *" tone="blue">
        <div className="space-y-3">
          {fields.map((field, index) => (
            <div
              key={field.id}
              className="grid gap-3 rounded-lg border border-slate-200 bg-card p-4 md:grid-cols-[1fr_1fr_180px_240px]"
            >
              <Field label={`Destination ${index + 1}`}>
                <select
                  aria-label={`Destination ${index + 1}`}
                  className={inputClass}
                  {...register(`itinerary.${index}.country`, {
                    onChange: () =>
                      setValue(`itinerary.${index}.destination`, '', { shouldDirty: true }),
                  })}
                >
                  <option value="">Select Destination</option>
                  {(itineraryDestinations.data?.data ?? []).map((destination) => (
                    <option key={destination.id} value={destination.name}>
                      {destination.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={`City ${index + 1}`}>
                <select
                  aria-label={`City ${index + 1}`}
                  className={inputClass}
                  disabled={!itineraryRows?.[index]?.country}
                  {...register(`itinerary.${index}.destination`)}
                >
                  <option value="">
                    {itineraryRows?.[index]?.country ? 'Select City' : 'Select a destination first'}
                  </option>
                  {(destinationCityMap.get(itineraryRows?.[index]?.country ?? '') ?? []).map(
                    (cityName) => (
                      <option key={cityName} value={cityName}>
                        {cityName}
                      </option>
                    ),
                  )}
                </select>
              </Field>
              <Field label="Nights">
                <input
                  aria-label={`Nights ${index + 1}`}
                  type="number"
                  min="0"
                  className={inputClass}
                  {...register(`itinerary.${index}.nights`, { valueAsNumber: true })}
                />
              </Field>
              <div className="flex items-end gap-2">
                <Button
                  className="flex-1 bg-green-600 text-white hover:bg-green-700"
                  onClick={() => append(emptyRow(fields.length + 1))}
                >
                  Add More
                </Button>
                {fields.length > 1 && (
                  <Button
                    variant="ghost"
                    aria-label="Remove itinerary"
                    className="text-red-600 hover:bg-red-50"
                    onClick={() => remove(index)}
                  >
                    <Trash2 className="h-4 w-4" />
                    Remove
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </Section>
      <div className="flex justify-start gap-2 rounded-lg border bg-card p-4 shadow-sm">
        <Button type="submit" isLoading={saving}>
          {lead ? 'Save changes' : 'Create Lead'}
        </Button>
        <Button variant="secondary" onClick={() => history.back()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
