import { useEffect } from 'react';
import { ArrowLeft, Save } from 'lucide-react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { z } from 'zod';
import {
  labelForLookup,
  VENDOR_CONTRACT_TYPES,
  VENDOR_PAYMENT_TERMS,
  VENDOR_STATUSES,
  VENDOR_TYPES,
  type VendorInput,
} from '@interscale/shared';
import { Button } from '@/components/ui/Button';
import {
  useCreateVendor,
  useUpdateVendor,
  useVendor,
  useVendorDuplicates,
} from '@/features/vendors/vendors.api';

const optional = z.string().trim().max(2000);
const schema = z
  .object({
    name: z.string().trim().min(2, 'Enter at least two characters.').max(200),
    vendorType: z.enum(VENDOR_TYPES),
    contactPerson: optional,
    primaryPhone: z.string().trim().max(32),
    primaryEmail: z.string().trim().email('Enter a valid email.').or(z.literal('')),
    address: optional,
    city: z.string().trim().max(120),
    state: z.string().trim().max(120),
    country: z.string().trim().max(80),
    postalCode: z.string().trim().max(24),
    coverageAreas: optional,
    servicesOffered: optional,
    contractType: z.enum(VENDOR_CONTRACT_TYPES),
    contractStartDate: z.string(),
    contractEndDate: z.string(),
    paymentTerm: z.enum(VENDOR_PAYMENT_TERMS),
    customPaymentTermDays: z.string(),
    taxRegistrationNumber: z.string().trim().max(80),
    gstNumber: z.string().trim().max(32),
    panNumber: z.string().trim().max(20),
    assignedToId: z.string(),
    status: z.enum(VENDOR_STATUSES),
    rating: z.string(),
    createAnyway: z.boolean(),
  })
  .refine(
    (v) => !v.contractStartDate || !v.contractEndDate || v.contractStartDate <= v.contractEndDate,
    { path: ['contractEndDate'], message: 'End date must follow start date.' },
  )
  .refine((v) => v.paymentTerm !== 'CUSTOM' || Number(v.customPaymentTermDays) > 0, {
    path: ['customPaymentTermDays'],
    message: 'Enter custom term days.',
  });
type Values = z.infer<typeof schema>;
const contractOptions: Array<{ value: Values['contractType']; label: string }> = [
  { value: 'FIXED_CONTRACT', label: 'Rate Contract' },
  { value: 'ON_REQUEST', label: 'Allotment' },
  { value: 'COMMISSION_BASED', label: 'Commission Based' },
  { value: 'NET_RATE', label: 'Net Rate' },
];
const paymentOptions: Array<{ value: Values['paymentTerm']; label: string }> = [
  { value: 'IMMEDIATE', label: 'Immediate' },
  { value: 'NET_15', label: 'Net 15' },
  { value: 'NET_30', label: 'Net 30' },
  { value: 'NET_45', label: 'Net 45' },
  { value: 'ADVANCE', label: 'Advance Required' },
];
const initial: Values = {
  name: '',
  vendorType: 'HOTEL',
  contactPerson: '',
  primaryPhone: '',
  primaryEmail: '',
  address: '',
  city: '',
  state: '',
  country: 'India',
  postalCode: '',
  coverageAreas: '',
  servicesOffered: '',
  contractType: 'FIXED_CONTRACT',
  contractStartDate: '',
  contractEndDate: '',
  paymentTerm: 'NET_30',
  customPaymentTermDays: '',
  taxRegistrationNumber: '',
  gstNumber: '',
  panNumber: '',
  assignedToId: '',
  status: 'ACTIVE',
  rating: '',
  createAnyway: false,
};
const field =
  'w-full rounded-md border border-slate-300 bg-card px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100';
const clean = (value: string) => value || null;

export function VendorFormPage() {
  const { vendorId } = useParams();
  const navigate = useNavigate();
  const vendor = useVendor(vendorId);
  const create = useCreateVendor();
  const update = useUpdateVendor(vendorId ?? '');
  const {
    register,
    watch,
    reset,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: initial });
  useEffect(() => {
    if (!vendor.data) return;
    const v = vendor.data;
    reset({
      ...initial,
      name: v.name,
      vendorType: v.vendorType as Values['vendorType'],
      contactPerson: v.contactPerson ?? '',
      primaryPhone: v.primaryPhone ?? '',
      primaryEmail: v.primaryEmail ?? '',
      address: v.address ?? '',
      city: v.city ?? '',
      state: v.state ?? '',
      country: v.country ?? 'India',
      postalCode: v.postalCode ?? '',
      coverageAreas: v.coverageAreas ?? '',
      servicesOffered: v.servicesOffered ?? '',
      contractType: v.contractType as Values['contractType'],
      contractStartDate: v.contractStartDate?.slice(0, 10) ?? '',
      contractEndDate: v.contractEndDate?.slice(0, 10) ?? '',
      paymentTerm: v.paymentTerm as Values['paymentTerm'],
      gstNumber: v.gstNumber ?? '',
      panNumber: v.panNumber ?? '',
      assignedToId: v.assignedTo?.id ?? '',
      status: v.status as Values['status'],
      rating: v.rating ?? '',
    });
  }, [vendor.data, reset]);
  useEffect(() => {
    const leave = (event: BeforeUnloadEvent) => {
      if (isDirty) event.preventDefault();
    };
    window.addEventListener('beforeunload', leave);
    return () => window.removeEventListener('beforeunload', leave);
  }, [isDirty]);
  const watched = watch();
  const duplicates = useVendorDuplicates({
    name: watched.name,
    city: watched.city,
    phone: watched.primaryPhone,
    email: watched.primaryEmail,
    gstNumber: watched.gstNumber,
    panNumber: watched.panNumber,
    ...(vendorId ? { excludeVendorId: vendorId } : {}),
  });
  const mutation = vendorId ? update : create;
  const submit = (value: Values) => {
    const payload = {
      name: value.name,
      vendorType: value.vendorType,
      contactPerson: clean(value.contactPerson),
      primaryPhone: clean(value.primaryPhone),
      primaryEmail: clean(value.primaryEmail),
      address: clean(value.address),
      city: clean(value.city),
      state: clean(value.state),
      country: clean(value.country),
      postalCode: clean(value.postalCode),
      coverageAreas: clean(value.coverageAreas),
      servicesOffered: clean(value.servicesOffered),
      contractType: value.contractType,
      contractStartDate: value.contractStartDate ? new Date(value.contractStartDate) : null,
      contractEndDate: value.contractEndDate ? new Date(value.contractEndDate) : null,
      paymentTerm: value.paymentTerm,
      customPaymentTermDays: value.customPaymentTermDays
        ? Number(value.customPaymentTermDays)
        : null,
      taxRegistrationNumber: clean(value.taxRegistrationNumber),
      gstNumber: clean(value.gstNumber),
      panNumber: clean(value.panNumber),
      assignedToId: clean(value.assignedToId),
      status: value.status,
      rating: value.rating ? Number(value.rating) : null,
      createAnyway: value.createAnyway,
    } as VendorInput;
    if (vendorId) update.mutate(payload, { onSuccess: () => navigate(`/vendors/${vendorId}`) });
    else create.mutate(payload, { onSuccess: (row) => navigate(`/vendors/${row.id}`) });
  };
  if (vendorId && vendor.isError) return <Navigate to="/vendors" replace />;
  const error = (name: keyof Values) => errors[name]?.message;
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">
          {vendorId ? 'Edit Vendor' : 'Create Vendor'}
        </h1>
      </header>
      <form onSubmit={handleSubmit(submit)} className="space-y-5">
        {mutation.error && (
          <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {mutation.error.message}
          </div>
        )}
        {duplicates.data?.length ? (
          <section className="rounded-xl border border-amber-300 bg-amber-50 p-4">
            <h2 className="font-semibold text-amber-900">Possible duplicate vendors</h2>
            <div className="mt-2 grid gap-2 md:grid-cols-2">
              {duplicates.data.slice(0, 4).map((match) => (
                <a
                  key={match.id}
                  href={`/vendors/${match.id}`}
                  className="rounded-lg border bg-card p-3 text-sm"
                >
                  <span className="font-semibold">{match.name}</span>
                  <p className="text-xs text-slate-500">
                    {match.vendorCode} · {match.primaryPhone ?? match.primaryEmail ?? match.city}
                  </p>
                  <p className="mt-1 text-xs text-amber-800">
                    {match.reasons.map(labelForLookup).join(', ')}
                  </p>
                </a>
              ))}
            </div>
            {!vendorId && (
              <label className="mt-3 flex gap-2 text-sm">
                <input type="checkbox" {...register('createAnyway')} />I reviewed these matches and
                still want a separate vendor.
              </label>
            )}
          </section>
        ) : null}
        <section className="overflow-hidden rounded-md border bg-card shadow-sm">
          <div className="flex items-center justify-between bg-blue-600 px-5 py-4 text-white">
            <h2 className="text-lg font-medium">Vendor Information</h2>
            <span className="rounded bg-cyan-500 px-2 py-1 text-xs font-semibold text-white">
              Code will be auto-generated
            </span>
          </div>
          <div className="grid gap-5 p-5 md:grid-cols-2">
            <div className="space-y-5">
              <label className="block text-sm font-semibold">
                Vendor Name <span className="text-red-500">*</span>
                <input
                  aria-label="Vendor name *"
                  className={`${field} mt-2 font-normal`}
                  {...register('name')}
                />
                {error('name') && <span className="text-xs text-red-600">{error('name')}</span>}
              </label>
              <label className="block text-sm font-semibold">
                Vendor Type <span className="text-red-500">*</span>
                <select
                  aria-label="Vendor type *"
                  className={`${field} mt-2 font-normal`}
                  {...register('vendorType')}
                >
                  {VENDOR_TYPES.map((v) => (
                    <option key={v} value={v}>
                      {labelForLookup(v)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-semibold">
                Contact Person
                <input className={`${field} mt-2 font-normal`} {...register('contactPerson')} />
              </label>
              <label className="block text-sm font-semibold">
                Phone
                <input className={`${field} mt-2 font-normal`} {...register('primaryPhone')} />
              </label>
              <label className="block text-sm font-semibold">
                Email
                <input
                  className={`${field} mt-2 font-normal`}
                  type="email"
                  {...register('primaryEmail')}
                />
                {error('primaryEmail') && (
                  <span className="text-xs text-red-600">{error('primaryEmail')}</span>
                )}
              </label>
              <label className="block text-sm font-semibold">
                Contract Type
                <select className={`${field} mt-2 font-normal`} {...register('contractType')}>
                  {contractOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-semibold">
                Payment Terms
                <select className={`${field} mt-2 font-normal`} {...register('paymentTerm')}>
                  {paymentOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              {watched.paymentTerm === 'CUSTOM' && (
                <label className="block text-sm font-semibold">
                  Custom Payment Days
                  <input
                    className={`${field} mt-2 font-normal`}
                    min="1"
                    type="number"
                    {...register('customPaymentTermDays')}
                  />
                  {error('customPaymentTermDays') && (
                    <span className="text-xs text-red-600">{error('customPaymentTermDays')}</span>
                  )}
                </label>
              )}
            </div>
            <div className="space-y-5">
              <label className="block text-sm font-semibold">
                Address
                <textarea
                  className={`${field} mt-2 min-h-32 resize-y font-normal`}
                  placeholder="Full business address"
                  {...register('address')}
                />
              </label>
              <label className="block text-sm font-semibold">
                Coverage Areas
                <textarea
                  className={`${field} mt-2 min-h-32 resize-y font-normal`}
                  placeholder="Cities, regions or countries covered"
                  {...register('coverageAreas')}
                />
              </label>
              <label className="block text-sm font-semibold">
                Services Offered
                <textarea
                  className={`${field} mt-2 min-h-44 resize-y font-normal`}
                  placeholder="Detailed description of services offered"
                  {...register('servicesOffered')}
                />
              </label>
            </div>
          </div>
        </section>
        <div className="flex flex-wrap gap-2 rounded-md border bg-slate-50 p-4 shadow-sm">
          <Button
            disabled={mutation.isPending}
            type="submit"
            className="rounded-md bg-blue-600 hover:bg-blue-700"
          >
            <Save className="h-4 w-4" />
            {mutation.isPending ? 'Saving…' : vendorId ? 'Save Changes' : 'Create Vendor'}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => navigate(vendorId ? `/vendors/${vendorId}` : '/vendors')}
          >
            <ArrowLeft className="h-4 w-4" /> Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
