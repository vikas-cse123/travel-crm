import { useEffect, useMemo } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { ArrowLeft, Plus, Save, Trash2 } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  PERMISSIONS,
  PRICING_MODES,
  MARKUP_MODES,
  SERVICE_TYPES,
  labelForLookup,
  quotationVersionInputSchema,
  type QuotationVersionInput,
} from '@interscale/shared';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/features/auth/AuthProvider';
import { useQuotation, useUpdateQuotationVersion } from '@/features/quotations/quotations.api';

const field = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm';
const defaults: QuotationVersionInput = {
  title: '',
  introduction: null,
  destinationSummary: '',
  travelStartDate: null,
  travelEndDate: null,
  currency: 'INR',
  pricingMode: 'ITEMIZED',
  markupMode: 'NONE',
  markupValue: 0,
  taxRate: 0,
  discountAmount: 0,
  notes: null,
  internalNotes: null,
  itinerary: [],
  hotels: [],
  services: [],
  inclusions: [],
  exclusions: [],
  terms: [],
};
const toDate = (value: string | null) => (value ? value.slice(0, 10) : '');
const nullable = (value: string) => (value === '' ? null : Number(value));
export function QuotationBuilderPage() {
  const { quotationId = '', versionId = '' } = useParams();
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const canCost = hasPermission(PERMISSIONS.QUOTATIONS_VIEW_COSTING);
  const quotation = useQuotation(quotationId);
  const save = useUpdateQuotationVersion(quotationId, versionId);
  const form = useForm<QuotationVersionInput>({
    resolver: zodResolver(quotationVersionInputSchema),
    defaultValues: defaults,
  });
  const itinerary = useFieldArray({ control: form.control, name: 'itinerary' });
  const hotels = useFieldArray({ control: form.control, name: 'hotels' });
  const services = useFieldArray({ control: form.control, name: 'services' });
  const inclusions = useFieldArray({ control: form.control, name: 'inclusions' });
  const exclusions = useFieldArray({ control: form.control, name: 'exclusions' });
  const terms = useFieldArray({ control: form.control, name: 'terms' });
  const version = quotation.data?.versions.find((row) => row.id === versionId);
  useEffect(() => {
    if (!version) return;
    form.reset({
      title: version.title,
      introduction: version.introduction,
      destinationSummary: version.destinationSummary,
      travelStartDate: version.travelStartDate ? new Date(version.travelStartDate) : null,
      travelEndDate: version.travelEndDate ? new Date(version.travelEndDate) : null,
      currency: version.currency,
      pricingMode: version.pricingMode as QuotationVersionInput['pricingMode'],
      markupMode: version.markupMode as QuotationVersionInput['markupMode'],
      markupValue: Number(version.markupValue),
      taxRate: Number(version.taxRate),
      discountAmount: Number(version.discountAmount),
      notes: version.notes,
      internalNotes: version.internalNotes ?? null,
      itinerary: version.itinerary.map((row) => ({
        ...row,
        date: row.date ? new Date(row.date) : null,
      })),
      hotels: version.hotels.map((row) => ({
        ...row,
        checkInDate: row.checkInDate ? new Date(row.checkInDate) : null,
        checkOutDate: row.checkOutDate ? new Date(row.checkOutDate) : null,
        internalCost: row.internalCost ? Number(row.internalCost) : 0,
        sellingPrice: row.sellingPrice ? Number(row.sellingPrice) : 0,
      })),
      services: version.services.map((row) => ({
        serviceType: row.serviceType as QuotationVersionInput['services'][number]['serviceType'],
        name: row.name,
        description: row.description,
        dayNumber: row.dayNumber,
        city: row.city,
        quantity: Number(row.quantity),
        internalCost: row.unitCost ? Number(row.unitCost) : 0,
        sellingPrice: Number(row.unitSellingPrice),
        taxCategory: row.taxCategory,
        notes: row.notes,
        sequence: row.sequence,
      })),
      inclusions: version.inclusions,
      exclusions: version.exclusions,
      terms: version.terms,
    });
  }, [version, form]);
  const watchedHotels = useWatch({ control: form.control, name: 'hotels' });
  const watchedServices = useWatch({ control: form.control, name: 'services' });
  const markupMode = useWatch({ control: form.control, name: 'markupMode' });
  const markupValue = useWatch({ control: form.control, name: 'markupValue' }) ?? 0;
  const taxRate = useWatch({ control: form.control, name: 'taxRate' }) ?? 0;
  const discount = useWatch({ control: form.control, name: 'discountAmount' }) ?? 0;
  const estimate = useMemo(() => {
    const hotels = watchedHotels ?? [];
    const services = watchedServices ?? [];
    const cost = [
      ...hotels.map((row) => Number(row.internalCost ?? 0)),
      ...services.map((row) => Number(row.internalCost ?? 0) * Number(row.quantity ?? 1)),
    ].reduce((a, b) => a + b, 0);
    const selling = [
      ...hotels.map((row) => Number(row.sellingPrice ?? 0)),
      ...services.map((row) => Number(row.sellingPrice ?? 0) * Number(row.quantity ?? 1)),
    ].reduce((a, b) => a + b, 0);
    const markup =
      markupMode === 'PERCENTAGE'
        ? (selling * Number(markupValue)) / 100
        : markupMode === 'FIXED'
          ? Number(markupValue)
          : 0;
    const preTax = Math.max(0, selling + markup - Number(discount));
    const tax = (preTax * Number(taxRate)) / 100;
    return { cost, selling, markup, tax, final: preTax + tax, margin: preTax - cost };
  }, [watchedHotels, watchedServices, markupMode, markupValue, taxRate, discount]);
  if (quotation.isLoading) return <div className="h-96 animate-pulse rounded-xl bg-white" />;
  if (!quotation.data || !version)
    return <div className="rounded-xl bg-white p-12 text-center">Draft version unavailable.</div>;
  if (version.status !== 'DRAFT')
    return (
      <div className="rounded-xl bg-white p-12 text-center">
        Finalized versions are immutable. Create a revision to edit.
      </div>
    );
  const submit = form.handleSubmit((value) => {
    const seq = <T extends object>(rows: T[]) =>
      rows.map((row, index) => ({ ...row, sequence: index + 1 }));
    save.mutate(
      {
        ...value,
        itinerary: seq(value.itinerary).map((row, index) => ({ ...row, dayNumber: index + 1 })),
        hotels: seq(value.hotels),
        services: seq(value.services),
        inclusions: seq(value.inclusions),
        exclusions: seq(value.exclusions),
        terms: seq(value.terms),
      },
      { onSuccess: () => navigate(`/quotations/${quotationId}`) },
    );
  });
  const textSection = (
    title: string,
    array: {
      fields: Array<{ id: string }>;
      append: (value: { content: string; sequence: number }) => void;
      remove: (index: number) => void;
    },
    name: 'inclusions' | 'exclusions' | 'terms',
  ) => (
    <section className="rounded-xl border bg-white p-5">
      <div className="flex justify-between">
        <h2 className="font-semibold">{title}</h2>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => array.append({ content: '', sequence: array.fields.length + 1 })}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      <div className="mt-3 space-y-2">
        {array.fields.map((row, index) => (
          <div key={row.id} className="flex gap-2">
            <textarea
              aria-label={`${name} ${index + 1}`}
              rows={2}
              {...form.register(`${name}.${index}.content`)}
              className={field}
            />
            <Button size="sm" variant="ghost" onClick={() => array.remove(index)}>
              <Trash2 className="h-4 w-4 text-red-600" />
            </Button>
          </div>
        ))}
      </div>
    </section>
  );
  return (
    <form className="space-y-5" onSubmit={submit}>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link to={`/quotations/${quotationId}`} className="rounded-lg p-2 hover:bg-white">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <p className="text-sm text-slate-500">
              {quotation.data.quotationNumber} · Version {version.versionNumber}
            </p>
            <h1 className="text-2xl font-semibold">Quotation builder</h1>
          </div>
        </div>
        <Button type="submit" isLoading={save.isPending}>
          <Save className="h-4 w-4" />
          Save draft
        </Button>
      </header>
      {save.isError && (
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{save.error.message}</p>
      )}
      <section className="rounded-xl border bg-white p-5">
        <h2 className="font-semibold">1. Customer and travel summary</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <label className="text-sm font-medium">
            Title
            <input {...form.register('title')} className={`${field} mt-1`} />
          </label>
          <label className="text-sm font-medium">
            Destination
            <input {...form.register('destinationSummary')} className={`${field} mt-1`} />
          </label>
          <label className="text-sm font-medium">
            Currency
            <input {...form.register('currency')} className={`${field} mt-1`} />
          </label>
          <label className="text-sm font-medium">
            Travel start
            <input
              type="date"
              value={toDate(form.watch('travelStartDate')?.toISOString() ?? null)}
              onChange={(event) =>
                form.setValue(
                  'travelStartDate',
                  event.target.value ? new Date(event.target.value) : null,
                  { shouldDirty: true },
                )
              }
              className={`${field} mt-1`}
            />
          </label>
          <label className="text-sm font-medium">
            Travel end
            <input
              type="date"
              value={toDate(form.watch('travelEndDate')?.toISOString() ?? null)}
              onChange={(event) =>
                form.setValue(
                  'travelEndDate',
                  event.target.value ? new Date(event.target.value) : null,
                  { shouldDirty: true },
                )
              }
              className={`${field} mt-1`}
            />
          </label>
          <label className="text-sm font-medium md:col-span-3">
            Introduction
            <textarea rows={3} {...form.register('introduction')} className={`${field} mt-1`} />
          </label>
        </div>
      </section>
      <section className="rounded-xl border bg-white p-5">
        <div className="flex justify-between">
          <h2 className="font-semibold">2. Hotels</h2>
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              hotels.append({
                city: '',
                hotelName: '',
                category: null,
                roomType: null,
                mealPlan: null,
                rooms: 1,
                nights: 1,
                checkInDate: null,
                checkOutDate: null,
                internalCost: 0,
                sellingPrice: 0,
                selected: true,
                notes: null,
                sequence: hotels.fields.length + 1,
              })
            }
          >
            <Plus className="h-4 w-4" />
            Hotel option
          </Button>
        </div>
        <div className="mt-4 space-y-3">
          {hotels.fields.map((row, index) => (
            <article
              key={row.id}
              className="grid gap-3 rounded-lg border bg-slate-50 p-4 md:grid-cols-4"
            >
              <input
                aria-label="Hotel city"
                placeholder="City"
                {...form.register(`hotels.${index}.city`)}
                className={field}
              />
              <input
                aria-label="Hotel name"
                placeholder="Hotel name"
                {...form.register(`hotels.${index}.hotelName`)}
                className={field}
              />
              <input
                aria-label="Room type"
                placeholder="Room type"
                {...form.register(`hotels.${index}.roomType`)}
                className={field}
              />
              <input
                aria-label="Meal plan"
                placeholder="Meal plan"
                {...form.register(`hotels.${index}.mealPlan`)}
                className={field}
              />
              <input
                aria-label="Rooms"
                type="number"
                min="1"
                {...form.register(`hotels.${index}.rooms`, { valueAsNumber: true })}
                className={field}
              />
              <input
                aria-label="Nights"
                type="number"
                min="1"
                {...form.register(`hotels.${index}.nights`, { valueAsNumber: true })}
                className={field}
              />
              {canCost && (
                <input
                  aria-label="Hotel internal cost"
                  type="number"
                  step="0.01"
                  placeholder="Internal cost"
                  {...form.register(`hotels.${index}.internalCost`, { setValueAs: nullable })}
                  className={field}
                />
              )}
              <input
                aria-label="Hotel selling price"
                type="number"
                step="0.01"
                placeholder="Selling price"
                {...form.register(`hotels.${index}.sellingPrice`, { setValueAs: nullable })}
                className={field}
              />
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" {...form.register(`hotels.${index}.selected`)} />
                Selected option
              </label>
              <Button size="sm" variant="ghost" onClick={() => hotels.remove(index)}>
                <Trash2 className="h-4 w-4 text-red-600" />
                Remove
              </Button>
            </article>
          ))}
        </div>
      </section>
      <section className="rounded-xl border bg-white p-5">
        <div className="flex justify-between">
          <h2 className="font-semibold">3. Day-wise itinerary</h2>
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              itinerary.append({
                dayNumber: itinerary.fields.length + 1,
                date: null,
                title: '',
                destination: '',
                description: '',
                meals: null,
                overnightLocation: null,
                activities: null,
                transfers: null,
                notes: null,
                sequence: itinerary.fields.length + 1,
              })
            }
          >
            <Plus className="h-4 w-4" />
            Itinerary day
          </Button>
        </div>
        <div className="mt-4 space-y-3">
          {itinerary.fields.map((row, index) => (
            <article key={row.id} className="rounded-lg border p-4">
              <div className="flex justify-between">
                <strong>Day {index + 1}</strong>
                <Button size="sm" variant="ghost" onClick={() => itinerary.remove(index)}>
                  <Trash2 className="h-4 w-4 text-red-600" />
                </Button>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <input
                  aria-label="Itinerary title"
                  placeholder="Title"
                  {...form.register(`itinerary.${index}.title`)}
                  className={field}
                />
                <input
                  aria-label="Itinerary destination"
                  placeholder="Destination"
                  {...form.register(`itinerary.${index}.destination`)}
                  className={field}
                />
                <input
                  aria-label="Itinerary meals"
                  placeholder="Meals"
                  {...form.register(`itinerary.${index}.meals`)}
                  className={field}
                />
                <textarea
                  aria-label="Itinerary description"
                  rows={3}
                  placeholder="Description"
                  {...form.register(`itinerary.${index}.description`)}
                  className={`${field} md:col-span-3`}
                />
                <input
                  aria-label="Activities"
                  placeholder="Activities"
                  {...form.register(`itinerary.${index}.activities`)}
                  className={field}
                />
                <input
                  aria-label="Transfers"
                  placeholder="Transfers"
                  {...form.register(`itinerary.${index}.transfers`)}
                  className={field}
                />
                <input
                  aria-label="Overnight"
                  placeholder="Overnight location"
                  {...form.register(`itinerary.${index}.overnightLocation`)}
                  className={field}
                />
              </div>
            </article>
          ))}
        </div>
      </section>
      <section className="rounded-xl border bg-white p-5">
        <div className="flex justify-between">
          <h2 className="font-semibold">
            4. Flights, transfers, sightseeing, visa, meals and other services
          </h2>
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              services.append({
                serviceType: 'SIGHTSEEING',
                name: '',
                description: null,
                dayNumber: null,
                city: null,
                quantity: 1,
                internalCost: 0,
                sellingPrice: 0,
                taxCategory: null,
                notes: null,
                sequence: services.fields.length + 1,
              })
            }
          >
            <Plus className="h-4 w-4" />
            Service
          </Button>
        </div>
        <div className="mt-4 space-y-3">
          {services.fields.map((row, index) => (
            <article key={row.id} className="grid gap-3 rounded-lg border p-4 md:grid-cols-4">
              <select
                aria-label="Service type"
                {...form.register(`services.${index}.serviceType`)}
                className={field}
              >
                {SERVICE_TYPES.map((value) => (
                  <option key={value} value={value}>
                    {labelForLookup(value)}
                  </option>
                ))}
              </select>
              <input
                aria-label="Service name"
                placeholder="Service name"
                {...form.register(`services.${index}.name`)}
                className={field}
              />
              <input
                aria-label="Service city"
                placeholder="City"
                {...form.register(`services.${index}.city`)}
                className={field}
              />
              <input
                aria-label="Service day"
                type="number"
                placeholder="Day"
                {...form.register(`services.${index}.dayNumber`, { setValueAs: nullable })}
                className={field}
              />
              <input
                aria-label="Quantity"
                type="number"
                step="0.01"
                {...form.register(`services.${index}.quantity`, { valueAsNumber: true })}
                className={field}
              />
              {canCost && (
                <input
                  aria-label="Service unit cost"
                  type="number"
                  step="0.01"
                  placeholder="Unit cost"
                  {...form.register(`services.${index}.internalCost`, { setValueAs: nullable })}
                  className={field}
                />
              )}
              <input
                aria-label="Service unit selling"
                type="number"
                step="0.01"
                placeholder="Unit selling"
                {...form.register(`services.${index}.sellingPrice`, { setValueAs: nullable })}
                className={field}
              />
              <input
                aria-label="Tax category"
                placeholder="Tax category"
                {...form.register(`services.${index}.taxCategory`)}
                className={field}
              />
              <Button size="sm" variant="ghost" onClick={() => services.remove(index)}>
                <Trash2 className="h-4 w-4 text-red-600" />
                Remove
              </Button>
            </article>
          ))}
        </div>
      </section>
      <div className="grid gap-5 lg:grid-cols-3">
        {textSection('5. Inclusions', inclusions, 'inclusions')}
        {textSection('6. Exclusions', exclusions, 'exclusions')}
        {textSection('7. Terms', terms, 'terms')}
      </div>
      <section className="grid gap-5 lg:grid-cols-3">
        <div className="rounded-xl border bg-white p-5 lg:col-span-2">
          <h2 className="font-semibold">8. Pricing and commercials</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <label className="text-sm font-medium">
              Pricing mode
              <select {...form.register('pricingMode')} className={`${field} mt-1`}>
                {PRICING_MODES.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
            <label className="text-sm font-medium">
              Markup mode
              <select {...form.register('markupMode')} className={`${field} mt-1`}>
                {MARKUP_MODES.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
            <label className="text-sm font-medium">
              Markup value
              <input
                type="number"
                step="0.01"
                {...form.register('markupValue', { valueAsNumber: true })}
                className={`${field} mt-1`}
              />
            </label>
            <label className="text-sm font-medium">
              Tax rate %
              <input
                type="number"
                step="0.0001"
                {...form.register('taxRate', { valueAsNumber: true })}
                className={`${field} mt-1`}
              />
            </label>
            <label className="text-sm font-medium">
              Discount amount
              <input
                type="number"
                step="0.01"
                {...form.register('discountAmount', { valueAsNumber: true })}
                className={`${field} mt-1`}
              />
            </label>
            <label className="text-sm font-medium md:col-span-3">
              Customer notes
              <textarea rows={3} {...form.register('notes')} className={`${field} mt-1`} />
            </label>
            {canCost && (
              <label className="text-sm font-medium md:col-span-3">
                Internal notes
                <textarea
                  rows={3}
                  {...form.register('internalNotes')}
                  className={`${field} mt-1`}
                />
              </label>
            )}
          </div>
        </div>
        <aside className="rounded-xl bg-slate-950 p-5 text-white">
          <p className="text-sm text-slate-300">Live estimate</p>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt>Selling subtotal</dt>
              <dd>{estimate.selling.toFixed(2)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Markup</dt>
              <dd>{estimate.markup.toFixed(2)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Tax</dt>
              <dd>{estimate.tax.toFixed(2)}</dd>
            </div>
            {canCost && (
              <>
                <div className="flex justify-between text-slate-300">
                  <dt>Internal cost</dt>
                  <dd>{estimate.cost.toFixed(2)}</dd>
                </div>
                <div className="flex justify-between text-slate-300">
                  <dt>Margin</dt>
                  <dd>{estimate.margin.toFixed(2)}</dd>
                </div>
              </>
            )}
          </dl>
          <div className="mt-4 border-t border-white/20 pt-4">
            <p className="text-sm">Estimated final</p>
            <p className="text-3xl font-semibold">
              {form.watch('currency')} {estimate.final.toFixed(2)}
            </p>
            <p className="mt-2 text-xs text-slate-400">
              The server recalculates and rounds every total authoritatively.
            </p>
          </div>
        </aside>
      </section>
      <div className="flex justify-end">
        <Button type="submit" isLoading={save.isPending}>
          <Save className="h-4 w-4" />
          Save quotation draft
        </Button>
      </div>
    </form>
  );
}
