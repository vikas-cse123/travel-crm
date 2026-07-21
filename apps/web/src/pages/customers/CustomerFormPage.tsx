import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import {
  CUSTOMER_COMMUNICATION_TYPES,
  CUSTOMER_LIFECYCLE_STAGES,
  CUSTOMER_TYPES,
  labelForLookup,
  type CustomerInput,
} from '@interscale/shared';
import { Button } from '@/components/ui/Button';
import {
  useCreateCustomer,
  useCustomer,
  useCustomerDuplicates,
  useCustomerLookups,
  useUpdateCustomer,
} from '@/features/customers/customers.api';

type Values = {
  displayName: string;
  type: 'INDIVIDUAL' | 'CORPORATE';
  primaryPhone: string;
  alternatePhone: string;
  email: string;
  companyName: string;
  lifecycleStage: CustomerInput['lifecycleStage'];
  dateOfBirth: string;
  preferredContactMethod: CustomerInput['preferredContactMethod'] | '';
  preferredCurrency: string;
  assignedToId: string;
  travelPreferences: string;
  dietaryRequirements: string;
  specialRequirements: string;
  createAnyway: boolean;
};
const field = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm';
const initial: Values = {
  displayName: '',
  type: 'INDIVIDUAL',
  primaryPhone: '',
  alternatePhone: '',
  email: '',
  companyName: '',
  lifecycleStage: 'PROSPECT',
  dateOfBirth: '',
  preferredContactMethod: '',
  preferredCurrency: 'INR',
  assignedToId: '',
  travelPreferences: '',
  dietaryRequirements: '',
  specialRequirements: '',
  createAnyway: false,
};

export function CustomerFormPage() {
  const { customerId } = useParams();
  const navigate = useNavigate();
  const customer = useCustomer(customerId);
  const lookups = useCustomerLookups();
  const create = useCreateCustomer();
  const update = useUpdateCustomer(customerId ?? '');
  const {
    register,
    watch,
    reset,
    handleSubmit,
    formState: { errors },
  } = useForm<Values>({ defaultValues: initial });
  useEffect(() => {
    if (customer.data)
      reset({
        ...initial,
        displayName: customer.data.displayName,
        type: customer.data.type as Values['type'],
        primaryPhone: customer.data.primaryPhone ?? '',
        alternatePhone: customer.data.alternatePhone ?? '',
        email: customer.data.email ?? '',
        companyName: customer.data.companyName ?? '',
        lifecycleStage: customer.data.lifecycleStage as Values['lifecycleStage'],
        dateOfBirth: customer.data.dateOfBirth?.slice(0, 10) ?? '',
        assignedToId: customer.data.assignedTo?.id ?? '',
        travelPreferences: customer.data.travelPreferences ?? '',
        dietaryRequirements: customer.data.dietaryRequirements ?? '',
        specialRequirements: customer.data.specialRequirements ?? '',
      });
  }, [customer.data, reset]);
  const [displayName, primaryPhone, email] = watch(['displayName', 'primaryPhone', 'email']);
  const duplicates = useCustomerDuplicates({
    displayName,
    phone: primaryPhone,
    email,
    ...(customerId ? { excludeCustomerId: customerId } : {}),
  });
  const mutation = customerId ? update : create;
  const submit = (value: Values) => {
    const payload = {
      ...value,
      primaryPhone: value.primaryPhone || null,
      alternatePhone: value.alternatePhone || null,
      email: value.email || null,
      companyName: value.companyName || null,
      dateOfBirth: value.dateOfBirth ? new Date(value.dateOfBirth) : null,
      preferredContactMethod: value.preferredContactMethod || null,
      assignedToId: value.assignedToId || null,
      travelPreferences: value.travelPreferences || null,
      dietaryRequirements: value.dietaryRequirements || null,
      specialRequirements: value.specialRequirements || null,
    };
    if (customerId)
      update.mutate(payload, { onSuccess: () => navigate(`/customers/${customerId}`) });
    else
      create.mutate(
        {
          ...payload,
          status: 'ACTIVE',
          addresses: [],
          tagIds: [],
          source: 'MANUAL',
        } as CustomerInput,
        { onSuccess: (created) => navigate(`/customers/${created.id}`) },
      );
  };
  if (customerId && customer.isError) return <Navigate to="/customers" replace />;
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <header>
        <p className="text-sm font-medium text-brand-700">Customer profile</p>
        <h1 className="text-2xl font-semibold">{customerId ? 'Edit customer' : 'New customer'}</h1>
        <p className="mt-1 text-sm text-slate-500">
          Canonical contact details used to identify the relationship. Transaction snapshots remain
          unchanged.
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
            <h2 className="font-semibold text-amber-900">Possible duplicate customers</h2>
            <div className="mt-2 grid gap-2 md:grid-cols-2">
              {duplicates.data.slice(0, 4).map((match) => (
                <a
                  key={match.id}
                  className="rounded-lg border bg-white p-3 text-sm hover:border-brand-400"
                  href={`/customers/${match.id}`}
                >
                  <span className="font-semibold">{match.displayName}</span>
                  <p className="text-xs text-slate-500">
                    {match.customerNumber} · {match.primaryPhone || match.email}
                  </p>
                  <p className="mt-1 text-xs text-amber-800">
                    {match.reasons.map(labelForLookup).join(', ')}
                  </p>
                </a>
              ))}
            </div>
            {!customerId && duplicates.data.some((item) => item.strongMatch) && (
              <label className="mt-3 flex items-center gap-2 text-sm">
                <input type="checkbox" {...register('createAnyway')} />I reviewed these matches and
                still want a separate customer.
              </label>
            )}
          </section>
        ) : null}
        <section className="rounded-xl border bg-white p-5 shadow-sm">
          <h2 className="mb-4 font-semibold">Identity and contact</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <label className="space-y-1 text-sm">
              <span>Display name *</span>
              <input
                className={field}
                {...register('displayName', { required: true, minLength: 2 })}
              />
              {errors.displayName && (
                <span className="text-xs text-red-600">Enter at least two characters.</span>
              )}
            </label>
            <label className="space-y-1 text-sm">
              <span>Customer type</span>
              <select className={field} {...register('type')}>
                {CUSTOMER_TYPES.map((value) => (
                  <option key={value} value={value}>
                    {labelForLookup(value)}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span>Company name</span>
              <input className={field} {...register('companyName')} />
            </label>
            <label className="space-y-1 text-sm">
              <span>Primary phone</span>
              <input className={field} {...register('primaryPhone')} />
            </label>
            <label className="space-y-1 text-sm">
              <span>Alternate phone</span>
              <input className={field} {...register('alternatePhone')} />
            </label>
            <label className="space-y-1 text-sm">
              <span>Email</span>
              <input className={field} type="email" {...register('email')} />
            </label>
            <label className="space-y-1 text-sm">
              <span>Date of birth</span>
              <input className={field} type="date" {...register('dateOfBirth')} />
            </label>
            <label className="space-y-1 text-sm">
              <span>Lifecycle</span>
              <select className={field} {...register('lifecycleStage')}>
                {CUSTOMER_LIFECYCLE_STAGES.map((value) => (
                  <option key={value} value={value}>
                    {labelForLookup(value)}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span>Preferred contact</span>
              <select className={field} {...register('preferredContactMethod')}>
                <option value="">Not specified</option>
                {CUSTOMER_COMMUNICATION_TYPES.map((value) => (
                  <option key={value} value={value}>
                    {labelForLookup(value)}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span>Assigned agent</span>
              <select className={field} {...register('assignedToId')}>
                <option value="">Unassigned</option>
                {lookups.data?.users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.fullName}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>
        <section className="rounded-xl border bg-white p-5 shadow-sm">
          <h2 className="mb-4 font-semibold">Travel preferences</h2>
          <div className="grid gap-4 md:grid-cols-3">
            {[
              ['travelPreferences', 'Travel preferences'],
              ['dietaryRequirements', 'Dietary requirements'],
              ['specialRequirements', 'Special requirements'],
            ].map(([name, label]) => (
              <label key={name} className="space-y-1 text-sm">
                <span>{label}</span>
                <textarea className={`${field} min-h-28`} {...register(name as keyof Values)} />
              </label>
            ))}
          </div>
        </section>
        <div className="flex justify-end gap-3">
          <Button type="button" variant="ghost" onClick={() => navigate(-1)}>
            Cancel
          </Button>
          <Button disabled={mutation.isPending} type="submit">
            {mutation.isPending ? 'Saving…' : 'Save customer'}
          </Button>
        </div>
      </form>
    </div>
  );
}
