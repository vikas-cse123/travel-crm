import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate, useParams } from 'react-router-dom';
import {
  labelForLookup,
  SERVICE_TYPES,
  VENDOR_SERVICE_STATUSES,
  type VendorRateInput,
  type VendorServiceInput,
} from '@interscale/shared';
import { Button } from '@/components/ui/Button';
import {
  useCreateVendorRate,
  useCreateVendorService,
  useUpdateVendorService,
  useVendor,
  useVendorService,
} from '@/features/vendors/vendors.api';

type Values = {
  serviceType: VendorServiceInput['serviceType'];
  name: string;
  description: string;
  destination: string;
  city: string;
  coverageArea: string;
  currency: string;
  baseCost: string;
  sellingReferencePrice: string;
  taxPercentage: string;
  commissionPercentage: string;
  validFrom: string;
  validUntil: string;
  status: VendorServiceInput['status'];
  notes: string;
};
const initial: Values = {
  serviceType: 'HOTEL',
  name: '',
  description: '',
  destination: '',
  city: '',
  coverageArea: '',
  currency: 'INR',
  baseCost: '',
  sellingReferencePrice: '',
  taxPercentage: '',
  commissionPercentage: '',
  validFrom: '',
  validUntil: '',
  status: 'ACTIVE',
  notes: '',
};
const field = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm';
export function VendorServiceFormPage() {
  const { vendorId = '', serviceId } = useParams();
  const navigate = useNavigate();
  const vendor = useVendor(vendorId);
  const service = useVendorService(vendorId, serviceId);
  const create = useCreateVendorService(vendorId);
  const update = useUpdateVendorService(vendorId, serviceId ?? '');
  const addRate = useCreateVendorRate(vendorId, serviceId ?? '');
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<Values>({ defaultValues: initial });
  const [rate, setRate] = useState({
    name: '',
    netRate: '',
    effectiveFrom: '',
    effectiveUntil: '',
    seasonName: '',
    cancellationPolicy: '',
  });
  useEffect(() => {
    if (!service.data) return;
    const s = service.data;
    reset({
      ...initial,
      serviceType: s.serviceType as Values['serviceType'],
      name: s.name,
      description: s.description ?? '',
      destination: s.destination ?? '',
      city: s.city ?? '',
      coverageArea: s.coverageArea ?? '',
      currency: s.currency,
      baseCost: s.baseCost ?? '',
      sellingReferencePrice: s.sellingReferencePrice ?? '',
      taxPercentage: s.taxPercentage ?? '',
      commissionPercentage: s.commissionPercentage ?? '',
      validFrom: s.validFrom?.slice(0, 10) ?? '',
      validUntil: s.validUntil?.slice(0, 10) ?? '',
      status: s.status as Values['status'],
      notes: s.notes ?? '',
    });
  }, [service.data, reset]);
  const submit = (v: Values) => {
    const payload = {
      ...v,
      description: v.description || null,
      destination: v.destination || null,
      city: v.city || null,
      coverageArea: v.coverageArea || null,
      baseCost: v.baseCost ? Number(v.baseCost) : null,
      sellingReferencePrice: v.sellingReferencePrice ? Number(v.sellingReferencePrice) : null,
      taxPercentage: v.taxPercentage ? Number(v.taxPercentage) : null,
      commissionPercentage: v.commissionPercentage ? Number(v.commissionPercentage) : null,
      validFrom: v.validFrom ? new Date(v.validFrom) : null,
      validUntil: v.validUntil ? new Date(v.validUntil) : null,
      notes: v.notes || null,
      metadata: null,
    } as VendorServiceInput;
    const done = () => navigate(`/vendors/${vendorId}/services`);
    if (serviceId) update.mutate(payload, { onSuccess: done });
    else create.mutate(payload, { onSuccess: done });
  };
  const submitRate = () => {
    if (!rate.name || !rate.netRate || !rate.effectiveFrom || !rate.effectiveUntil) return;
    addRate.mutate(
      {
        name: rate.name,
        currency: service.data?.currency ?? 'INR',
        rateType: 'NET_RATE',
        netRate: Number(rate.netRate),
        effectiveFrom: new Date(rate.effectiveFrom),
        effectiveUntil: new Date(rate.effectiveUntil),
        seasonName: rate.seasonName || null,
        cancellationPolicy: rate.cancellationPolicy || null,
      } as VendorRateInput,
      {
        onSuccess: () =>
          setRate({
            name: '',
            netRate: '',
            effectiveFrom: '',
            effectiveUntil: '',
            seasonName: '',
            cancellationPolicy: '',
          }),
      },
    );
  };
  const mutation = serviceId ? update : create;
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <header>
        <p className="text-sm font-medium text-brand-700">{vendor.data?.name ?? 'Vendor'}</p>
        <h1 className="text-2xl font-semibold">
          {serviceId ? 'Edit vendor service' : 'Add vendor service'}
        </h1>
        <p className="text-sm text-slate-500">
          Structured service data is copied into booking snapshots when selected.
        </p>
      </header>
      <form className="rounded-xl border bg-white p-5 shadow-sm" onSubmit={handleSubmit(submit)}>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-sm">
            Service type
            <select className={`${field} mt-1`} {...register('serviceType')}>
              {SERVICE_TYPES.map((v) => (
                <option key={v} value={v}>
                  {labelForLookup(v)}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Service name *
            <input
              className={`${field} mt-1`}
              {...register('name', { required: true, minLength: 2 })}
            />
            {errors.name && <span className="text-xs text-red-600">Enter a service name.</span>}
          </label>
          <label className="text-sm md:col-span-2">
            Description
            <textarea className={`${field} mt-1 min-h-20`} {...register('description')} />
          </label>
          <label className="text-sm">
            Destination
            <input className={`${field} mt-1`} {...register('destination')} />
          </label>
          <label className="text-sm">
            City
            <input className={`${field} mt-1`} {...register('city')} />
          </label>
          <label className="text-sm md:col-span-2">
            Coverage area
            <input className={`${field} mt-1`} {...register('coverageArea')} />
          </label>
          <label className="text-sm">
            Currency
            <input
              className={`${field} mt-1 uppercase`}
              maxLength={3}
              {...register('currency', { required: true })}
            />
          </label>
          <label className="text-sm">
            Base cost
            <input
              className={`${field} mt-1`}
              min="0"
              step="0.01"
              type="number"
              {...register('baseCost')}
            />
          </label>
          <label className="text-sm">
            Selling reference price
            <input
              className={`${field} mt-1`}
              min="0"
              step="0.01"
              type="number"
              {...register('sellingReferencePrice')}
            />
          </label>
          <label className="text-sm">
            Tax %
            <input
              className={`${field} mt-1`}
              min="0"
              max="100"
              step="0.01"
              type="number"
              {...register('taxPercentage')}
            />
          </label>
          <label className="text-sm">
            Commission %
            <input
              className={`${field} mt-1`}
              min="0"
              max="100"
              step="0.01"
              type="number"
              {...register('commissionPercentage')}
            />
          </label>
          <label className="text-sm">
            Valid from
            <input className={`${field} mt-1`} type="date" {...register('validFrom')} />
          </label>
          <label className="text-sm">
            Valid until
            <input className={`${field} mt-1`} type="date" {...register('validUntil')} />
          </label>
          <label className="text-sm">
            Status
            <select className={`${field} mt-1`} {...register('status')}>
              {VENDOR_SERVICE_STATUSES.map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <label className="text-sm md:col-span-2">
            Operational notes
            <textarea className={`${field} mt-1 min-h-20`} {...register('notes')} />
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => navigate(`/vendors/${vendorId}/services`)}
          >
            Cancel
          </Button>
          <Button disabled={mutation.isPending} type="submit">
            {mutation.isPending ? 'Saving…' : 'Save service'}
          </Button>
        </div>
      </form>
      {serviceId && (
        <section className="rounded-xl border bg-white p-5 shadow-sm">
          <h2 className="font-semibold">Rate management</h2>
          <p className="text-sm text-slate-500">
            Existing bookings keep their original snapshots when rates change.
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <input
              aria-label="Rate name"
              className={field}
              placeholder="Rate name"
              value={rate.name}
              onChange={(e) => setRate((current) => ({ ...current, name: e.target.value }))}
            />
            <input
              aria-label="Net rate"
              className={field}
              min="0"
              placeholder="Net rate"
              type="number"
              value={rate.netRate}
              onChange={(e) => setRate((current) => ({ ...current, netRate: e.target.value }))}
            />
            <input
              aria-label="Season"
              className={field}
              placeholder="Season"
              value={rate.seasonName}
              onChange={(e) => setRate((current) => ({ ...current, seasonName: e.target.value }))}
            />
            <label className="text-xs text-slate-500">
              Effective from
              <input
                className={`${field} mt-1`}
                type="date"
                value={rate.effectiveFrom}
                onChange={(e) =>
                  setRate((current) => ({ ...current, effectiveFrom: e.target.value }))
                }
              />
            </label>
            <label className="text-xs text-slate-500">
              Effective until
              <input
                className={`${field} mt-1`}
                type="date"
                value={rate.effectiveUntil}
                onChange={(e) =>
                  setRate((current) => ({ ...current, effectiveUntil: e.target.value }))
                }
              />
            </label>
            <input
              aria-label="Cancellation policy"
              className={field}
              placeholder="Cancellation policy"
              value={rate.cancellationPolicy}
              onChange={(e) =>
                setRate((current) => ({ ...current, cancellationPolicy: e.target.value }))
              }
            />
            <Button disabled={addRate.isPending} onClick={submitRate}>
              Add rate
            </Button>
          </div>
          {addRate.isError && (
            <p className="mt-3 text-sm text-red-600">
              The rate could not be saved. Review the dates and amount.
            </p>
          )}
          <div className="mt-5 divide-y rounded-lg border">
            {service.data?.rates.length ? (
              service.data.rates.map((row) => (
                <div key={String(row.id)} className="flex justify-between p-3 text-sm">
                  <span>
                    <strong>{String(row.name)}</strong> · {String(row.seasonName ?? 'Standard')}
                  </span>
                  <span>
                    {String(row.currency)} {String(row.netRate)}
                  </span>
                </div>
              ))
            ) : (
              <p className="p-4 text-sm text-slate-500">No rates yet.</p>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
