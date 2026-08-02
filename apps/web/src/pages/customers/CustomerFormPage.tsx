import { useEffect } from 'react';
import { ArrowLeft, Save } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import {
  CUSTOMER_COMMUNICATION_TYPES,
  CUSTOMER_TYPES,
  labelForLookup,
  type CustomerInput,
} from '@interscale/shared';
import { Button } from '@/components/ui/Button';
import {
  useCreateCustomer,
  useCustomer,
  useCustomerDuplicates,
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

const field =
  'w-full rounded-md border border-slate-300 bg-card px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100';
const initial: Values = {
  displayName: '',
  type: 'INDIVIDUAL',
  primaryPhone: '',
  alternatePhone: '',
  email: '',
  companyName: '',
  lifecycleStage: 'PROSPECT',
  dateOfBirth: '',
  preferredContactMethod: 'EMAIL',
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
    if (!customer.data) return;
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
      preferredContactMethod:
        (customer.data.preferredContactMethod as Values['preferredContactMethod']) ?? '',
      preferredCurrency: customer.data.preferredCurrency ?? 'INR',
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
    if (customerId) {
      update.mutate(payload, { onSuccess: () => navigate(`/customers/${customerId}`) });
      return;
    }
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
    <div className="space-y-5">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">
          {customerId ? 'Edit Customer' : 'Create Customer'}
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
            <h2 className="font-semibold text-amber-900">Possible duplicate customers</h2>
            <div className="mt-2 grid gap-2 md:grid-cols-2">
              {duplicates.data.slice(0, 4).map((match) => (
                <a
                  key={match.id}
                  className="rounded-lg border bg-card p-3 text-sm hover:border-brand-400"
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

        <section className="overflow-hidden rounded-md border bg-card shadow-sm">
          <div className="bg-blue-600 px-5 py-4 text-white">
            <h2 className="text-lg font-medium">Customer Information</h2>
          </div>
          <div className="grid gap-5 p-5 md:grid-cols-2">
            <div className="space-y-5">
              <label className="block text-sm font-semibold">
                Full Name <span className="text-red-500">*</span>
                <input
                  aria-label="Display name *"
                  className={`${field} mt-2 font-normal`}
                  {...register('displayName', { required: true, minLength: 2 })}
                />
                {errors.displayName && (
                  <span className="text-xs text-red-600">Enter at least two characters.</span>
                )}
              </label>
              <label className="block text-sm font-semibold">
                <span className="sr-only">Primary phone</span>
                <span aria-hidden="true">
                  Phone <span className="text-red-500">*</span>
                </span>
                <input
                  className={`${field} mt-2 font-normal`}
                  {...register('primaryPhone', { required: true })}
                />
                {errors.primaryPhone && (
                  <span className="text-xs text-red-600">Phone is required.</span>
                )}
              </label>
              <label className="block text-sm font-semibold">
                Email
                <input
                  className={`${field} mt-2 font-normal`}
                  type="email"
                  {...register('email')}
                />
              </label>
              <label className="block text-sm font-semibold">
                Customer Type
                <select className={`${field} mt-2 font-normal`} {...register('type')}>
                  {CUSTOMER_TYPES.map((value) => (
                    <option key={value} value={value}>
                      {labelForLookup(value)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-semibold">
                Communication Preference
                <select
                  className={`${field} mt-2 font-normal`}
                  {...register('preferredContactMethod')}
                >
                  <option value="">Not specified</option>
                  {CUSTOMER_COMMUNICATION_TYPES.map((value) => (
                    <option key={value} value={value}>
                      {labelForLookup(value)}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="space-y-5">
              <label className="block text-sm font-semibold">
                Preferences
                <textarea
                  className={`${field} mt-2 min-h-44 resize-y font-normal`}
                  placeholder="Customer preferences, special requirements, etc."
                  {...register('travelPreferences')}
                />
              </label>
              <label className="block text-sm font-semibold">
                Documents
                <textarea
                  className={`${field} mt-2 min-h-44 resize-y font-normal`}
                  placeholder="Document details, passport info, etc."
                  {...register('specialRequirements')}
                />
              </label>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 bg-slate-50 p-4">
            <Button
              disabled={mutation.isPending}
              type="submit"
              className="rounded-md bg-blue-600 hover:bg-blue-700"
            >
              <Save className="h-4 w-4" />
              {mutation.isPending ? 'Saving…' : customerId ? 'Save Changes' : 'Create Customer'}
            </Button>
            <Button type="button" variant="secondary" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-4 w-4" /> Cancel
            </Button>
          </div>
        </section>
      </form>
    </div>
  );
}
