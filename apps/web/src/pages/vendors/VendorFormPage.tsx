import { useEffect } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { z } from 'zod';
import {
  labelForLookup,
  PERMISSIONS,
  VENDOR_CONTRACT_TYPES,
  VENDOR_PAYMENT_TERMS,
  VENDOR_STATUSES,
  VENDOR_TYPES,
  type VendorInput,
} from '@interscale/shared';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/features/auth/AuthProvider';
import {
  useCreateVendor,
  useUpdateVendor,
  useVendor,
  useVendorDuplicates,
  useVendorLookups,
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
  contractType: 'NET_RATE',
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
const field = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm';
const clean = (value: string) => value || null;

export function VendorFormPage() {
  const { vendorId } = useParams();
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const vendor = useVendor(vendorId);
  const lookups = useVendorLookups();
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
    <div className="mx-auto max-w-6xl space-y-5">
      <header>
        <p className="text-sm font-medium text-brand-700">Supplier profile</p>
        <h1 className="text-2xl font-semibold">{vendorId ? 'Edit vendor' : 'Create vendor'}</h1>
        <p className="mt-1 text-sm text-slate-500">
          Vendor code is generated automatically and safely within your company.
        </p>
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
                  className="rounded-lg border bg-white p-3 text-sm"
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
        <section className="rounded-xl border bg-white p-5 shadow-sm">
          <h2 className="font-semibold">Vendor information</h2>
          <div className="mt-4 grid gap-5 md:grid-cols-2">
            <div className="space-y-4">
              <label className="block text-sm">
                Vendor name *<input className={`${field} mt-1`} {...register('name')} />
                {error('name') && <span className="text-xs text-red-600">{error('name')}</span>}
              </label>
              <label className="block text-sm">
                Vendor type *
                <select className={`${field} mt-1`} {...register('vendorType')}>
                  {VENDOR_TYPES.map((v) => (
                    <option key={v} value={v}>
                      {labelForLookup(v)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                Contact person
                <input className={`${field} mt-1`} {...register('contactPerson')} />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm">
                  Phone
                  <input className={`${field} mt-1`} {...register('primaryPhone')} />
                </label>
                <label className="text-sm">
                  Email
                  <input className={`${field} mt-1`} type="email" {...register('primaryEmail')} />
                  {error('primaryEmail') && (
                    <span className="text-xs text-red-600">{error('primaryEmail')}</span>
                  )}
                </label>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm">
                  Contract type
                  <select className={`${field} mt-1`} {...register('contractType')}>
                    {VENDOR_CONTRACT_TYPES.map((v) => (
                      <option key={v} value={v}>
                        {labelForLookup(v)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm">
                  Payment terms
                  <select className={`${field} mt-1`} {...register('paymentTerm')}>
                    {VENDOR_PAYMENT_TERMS.map((v) => (
                      <option key={v} value={v}>
                        {labelForLookup(v)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {watched.paymentTerm === 'CUSTOM' && (
                <label className="block text-sm">
                  Custom payment days
                  <input
                    className={`${field} mt-1`}
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
            <div className="space-y-4">
              <label className="block text-sm">
                Address
                <textarea className={`${field} mt-1 min-h-20`} {...register('address')} />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm">
                  City
                  <input className={`${field} mt-1`} {...register('city')} />
                </label>
                <label className="text-sm">
                  State
                  <input className={`${field} mt-1`} {...register('state')} />
                </label>
                <label className="text-sm">
                  Country
                  <input className={`${field} mt-1`} {...register('country')} />
                </label>
                <label className="text-sm">
                  Postal code
                  <input className={`${field} mt-1`} {...register('postalCode')} />
                </label>
              </div>
              <label className="block text-sm">
                Coverage areas
                <textarea
                  className={`${field} mt-1 min-h-20`}
                  placeholder="Cities, regions or countries covered"
                  {...register('coverageAreas')}
                />
              </label>
              <label className="block text-sm">
                Services offered
                <textarea
                  className={`${field} mt-1 min-h-20`}
                  placeholder="Describe the supplier capabilities"
                  {...register('servicesOffered')}
                />
              </label>
            </div>
          </div>
        </section>
        <section className="rounded-xl border bg-white p-5 shadow-sm">
          <h2 className="font-semibold">Contract, compliance and ownership</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <label className="text-sm">
              Contract starts
              <input className={`${field} mt-1`} type="date" {...register('contractStartDate')} />
            </label>
            <label className="text-sm">
              Contract ends
              <input className={`${field} mt-1`} type="date" {...register('contractEndDate')} />
              {error('contractEndDate') && (
                <span className="text-xs text-red-600">{error('contractEndDate')}</span>
              )}
            </label>
            <label className="text-sm">
              Assigned user
              <select className={`${field} mt-1`} {...register('assignedToId')}>
                <option value="">Unassigned</option>
                {lookups.data?.users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.fullName}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              GST number
              <input className={`${field} mt-1 uppercase`} {...register('gstNumber')} />
            </label>
            <label className="text-sm">
              PAN number
              <input className={`${field} mt-1 uppercase`} {...register('panNumber')} />
            </label>
            <label className="text-sm">
              Tax registration
              <input className={`${field} mt-1`} {...register('taxRegistrationNumber')} />
            </label>
            {vendorId && (
              <label className="text-sm">
                Status
                <select className={`${field} mt-1`} {...register('status')}>
                  {VENDOR_STATUSES.map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>
            )}
            {hasPermission(PERMISSIONS.VENDORS_VIEW_FINANCIALS) && (
              <label className="text-sm">
                Manual rating (0–5)
                <input
                  className={`${field} mt-1`}
                  min="0"
                  max="5"
                  step="0.1"
                  type="number"
                  {...register('rating')}
                />
              </label>
            )}
          </div>
        </section>
        <div className="flex justify-end gap-3">
          <Button
            type="button"
            variant="secondary"
            onClick={() => navigate(vendorId ? `/vendors/${vendorId}` : '/vendors')}
          >
            Cancel
          </Button>
          <Button disabled={mutation.isPending} type="submit">
            {mutation.isPending ? 'Saving…' : vendorId ? 'Save changes' : 'Create vendor'}
          </Button>
        </div>
      </form>
    </div>
  );
}
