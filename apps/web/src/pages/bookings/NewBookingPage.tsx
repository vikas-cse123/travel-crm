import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { BookingManualInput } from '@interscale/shared';
import { Button } from '@/components/ui/Button';
import { useQuotation } from '@/features/quotations/quotations.api';
import {
  useBookingLookups,
  useConvertQuotation,
  useCreateBooking,
} from '@/features/bookings/bookings.api';

const field = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm';
const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className="space-y-1 text-sm">
    <span className="font-medium text-slate-700">{label}</span>
    {children}
  </label>
);
type ManualFields = Omit<BookingManualInput, 'services' | 'itinerary' | 'paymentSchedule'>;

export function NewBookingPage() {
  const { quotationId } = useParams();
  const navigate = useNavigate();
  const quotation = useQuotation(quotationId);
  const convert = useConvertQuotation(quotationId ?? '');
  const create = useCreateBooking();
  const lookups = useBookingLookups();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ManualFields>({
    defaultValues: {
      currency: 'INR',
      rooms: 1,
      adults: 1,
      childrenWithBed: 0,
      childrenWithoutBed: 0,
      infants: 0,
      totalSellingAmount: 0,
    },
  });
  if (quotationId) {
    if (quotation.isLoading) return <div className="h-96 animate-pulse rounded-xl bg-white" />;
    if (!quotation.data)
      return <div className="rounded-xl bg-white p-12 text-center">Quotation unavailable.</div>;
    const q = quotation.data;
    const accepted = q.versions.find((version) => version.id === q.acceptedVersionId);
    return (
      <div className="mx-auto max-w-4xl space-y-5">
        <header className="flex items-center gap-3">
          <Link to={`/quotations/${q.id}`} className="rounded-lg p-2 hover:bg-white">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <p className="text-sm text-brand-700">Accepted quotation conversion</p>
            <h1 className="text-2xl font-semibold">Create booking from {q.quotationNumber}</h1>
          </div>
        </header>
        <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
          <h2 className="flex items-center gap-2 font-semibold text-emerald-900">
            <CheckCircle2 className="h-5 w-5" />
            Accepted commercial source
          </h2>
          <p className="mt-2 text-sm text-emerald-800">
            The exact accepted version will be copied. Future quotation changes cannot alter this
            booking.
          </p>
        </section>
        <section className="grid gap-4 rounded-xl border bg-white p-6 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ['Customer', q.customerName],
            ['Destination', q.destinationSummary],
            ['Accepted version', accepted ? `v${accepted.versionNumber}` : 'Unavailable'],
            [
              'Final amount',
              accepted
                ? new Intl.NumberFormat('en-IN', {
                    style: 'currency',
                    currency: accepted.currency,
                  }).format(Number(accepted.finalAmount))
                : '—',
            ],
            ['Adults', q.adults],
            ['Children', q.childrenWithBed + q.childrenWithoutBed],
            ['Infants', q.infants],
            ['Rooms', q.rooms],
          ].map(([label, value]) => (
            <div key={label}>
              <p className="text-xs uppercase text-slate-500">{label}</p>
              <p className="mt-1 font-semibold">{value}</p>
            </div>
          ))}
        </section>
        {!accepted || q.status !== 'ACCEPTED' ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-red-800">
            Only an accepted quotation with an immutable accepted version can be converted.
          </div>
        ) : (
          <section className="rounded-xl border bg-white p-6">
            <h2 className="font-semibold">Operational setup</h2>
            <p className="mt-1 text-sm text-slate-500">
              You can add travellers, payment installments and supplier confirmations in the booking
              workspace.
            </p>
            <div className="mt-5 flex justify-end">
              <Button
                isLoading={convert.isPending}
                onClick={() =>
                  convert.mutate(
                    { quotationVersionId: accepted.id, paymentSchedule: [] },
                    { onSuccess: (booking) => navigate(`/bookings/${booking.id}`) },
                  )
                }
              >
                Confirm and create booking
              </Button>
            </div>
            {convert.isError && (
              <p className="mt-3 text-sm text-red-700">{convert.error.message}</p>
            )}
          </section>
        )}
      </div>
    );
  }
  const submit = (values: ManualFields) =>
    create.mutate(
      {
        ...values,
        customerEmail: values.customerEmail || null,
        queryId: values.queryId || null,
        assignedToId: values.assignedToId || null,
        travelStartDate: values.travelStartDate || null,
        travelEndDate: values.travelEndDate || null,
        services: [],
        itinerary: [],
        paymentSchedule: [],
      },
      { onSuccess: (booking) => navigate(`/bookings/${booking.id}`) },
    );
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <header className="flex items-center gap-3">
        <Link to="/bookings" className="rounded-lg p-2 hover:bg-white">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <p className="text-sm text-brand-700">Explicit manual workflow</p>
          <h1 className="text-2xl font-semibold">Create manual booking</h1>
          <p className="text-sm text-slate-500">
            Use this only when no accepted quotation exists; the reason is permanently recorded.
          </p>
        </div>
      </header>
      <form className="space-y-5" onSubmit={handleSubmit(submit)}>
        <section className="rounded-xl border bg-white p-6">
          <h2 className="font-semibold">Customer and source lead</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Field label="Customer name">
              <input className={field} {...register('customerName', { required: true })} />
            </Field>
            <Field label="Linked lead ID (optional)">
              <input className={field} placeholder="UUID" {...register('queryId')} />
            </Field>
            <Field label="Email">
              <input className={field} type="email" {...register('customerEmail')} />
            </Field>
            <Field label="Phone">
              <input className={field} {...register('customerPhone', { required: true })} />
            </Field>
          </div>
        </section>
        <section className="rounded-xl border bg-white p-6">
          <h2 className="font-semibold">Travel details</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <Field label="Destination">
              <input className={field} {...register('destinationSummary', { required: true })} />
            </Field>
            <Field label="Travel start">
              <input className={field} type="date" {...register('travelStartDate')} />
            </Field>
            <Field label="Travel end">
              <input className={field} type="date" {...register('travelEndDate')} />
            </Field>
            {(
              [
                ['rooms', 'Rooms'],
                ['adults', 'Adults'],
                ['childrenWithBed', 'Children with bed'],
                ['childrenWithoutBed', 'Children without bed'],
                ['infants', 'Infants'],
              ] as const
            ).map(([name, label]) => (
              <Field key={name} label={label}>
                <input
                  className={field}
                  type="number"
                  min={name === 'rooms' || name === 'adults' ? 1 : 0}
                  {...register(name, { valueAsNumber: true, required: true })}
                />
              </Field>
            ))}
          </div>
        </section>
        <section className="rounded-xl border bg-white p-6">
          <h2 className="font-semibold">Commercial and assignment</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <Field label="Currency">
              <input
                className={field}
                maxLength={3}
                {...register('currency', { required: true })}
              />
            </Field>
            <Field label="Total selling amount">
              <input
                className={field}
                type="number"
                min="0"
                step="0.01"
                {...register('totalSellingAmount', { valueAsNumber: true, required: true })}
              />
            </Field>
            <Field label="Assigned user">
              <select className={field} {...register('assignedToId')}>
                <option value="">Me</option>
                {lookups.data?.users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.fullName}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </section>
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-6">
          <Field label="Reason for manual booking">
            <textarea
              className={field}
              rows={4}
              {...register('manualCreationReason', { required: true, minLength: 3 })}
            />
          </Field>
          {errors.manualCreationReason && (
            <p className="mt-2 text-sm text-red-700">A clear manual-booking reason is required.</p>
          )}
        </section>
        {create.isError && (
          <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{create.error.message}</p>
        )}
        <div className="flex justify-end">
          <Button type="submit" isLoading={create.isPending}>
            Create manual booking
          </Button>
        </div>
      </form>
    </div>
  );
}
