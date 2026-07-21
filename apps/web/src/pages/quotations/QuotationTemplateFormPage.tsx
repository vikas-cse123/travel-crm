import { useEffect } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useFieldArray, useForm } from 'react-hook-form';
import { ArrowDown, ArrowLeft, ArrowUp, Plus, Save, Trash2 } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  quotationTemplateInputSchema,
  SERVICE_TYPES,
  labelForLookup,
  type QuotationTemplateInput,
} from '@interscale/shared';
import { Button } from '@/components/ui/Button';
import { FormField, inputClasses } from '@/components/ui/FormField';
import {
  useQuotationTemplate,
  useSaveQuotationTemplate,
} from '@/features/quotations/quotations.api';

const defaults: QuotationTemplateInput = {
  name: '',
  description: null,
  destinationSummary: '',
  durationDays: 1,
  durationNights: 0,
  baseCurrency: 'INR',
  adultBasePrice: null,
  childWithBedBasePrice: null,
  childWithoutBedBasePrice: null,
  infantBasePrice: null,
  status: 'ACTIVE',
  internalNotes: null,
  itinerary: [],
  hotels: [],
  services: [],
  inclusions: [],
  exclusions: [],
  terms: [],
};
const field = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm';
const nullableNumber = (value: string) => (value === '' ? null : Number(value));
function Reorder({
  index,
  count,
  move,
  remove,
}: {
  index: number;
  count: number;
  move: (from: number, to: number) => void;
  remove: (index: number) => void;
}) {
  return (
    <div className="flex gap-1">
      <Button
        aria-label="Move up"
        size="sm"
        variant="ghost"
        disabled={index === 0}
        onClick={() => move(index, index - 1)}
      >
        <ArrowUp className="h-4 w-4" />
      </Button>
      <Button
        aria-label="Move down"
        size="sm"
        variant="ghost"
        disabled={index === count - 1}
        onClick={() => move(index, index + 1)}
      >
        <ArrowDown className="h-4 w-4" />
      </Button>
      <Button aria-label="Remove" size="sm" variant="ghost" onClick={() => remove(index)}>
        <Trash2 className="h-4 w-4 text-red-600" />
      </Button>
    </div>
  );
}
export function QuotationTemplateFormPage() {
  const { templateId } = useParams();
  const navigate = useNavigate();
  const detail = useQuotationTemplate(templateId);
  const save = useSaveQuotationTemplate(templateId);
  const form = useForm<QuotationTemplateInput>({
    resolver: zodResolver(quotationTemplateInputSchema),
    defaultValues: defaults,
  });
  const itinerary = useFieldArray({ control: form.control, name: 'itinerary' });
  const hotels = useFieldArray({ control: form.control, name: 'hotels' });
  const services = useFieldArray({ control: form.control, name: 'services' });
  const inclusions = useFieldArray({ control: form.control, name: 'inclusions' });
  const exclusions = useFieldArray({ control: form.control, name: 'exclusions' });
  const terms = useFieldArray({ control: form.control, name: 'terms' });
  useEffect(() => {
    if (!detail.data) return;
    const t = detail.data;
    form.reset({
      name: t.name,
      description: t.description,
      destinationSummary: t.destinationSummary,
      durationDays: t.durationDays,
      durationNights: t.durationNights,
      baseCurrency: t.baseCurrency,
      adultBasePrice: t.adultBasePrice ? Number(t.adultBasePrice) : null,
      childWithBedBasePrice: t.childWithBedBasePrice ? Number(t.childWithBedBasePrice) : null,
      childWithoutBedBasePrice: t.childWithoutBedBasePrice
        ? Number(t.childWithoutBedBasePrice)
        : null,
      infantBasePrice: t.infantBasePrice ? Number(t.infantBasePrice) : null,
      status: t.status,
      internalNotes: t.internalNotes ?? null,
      itinerary: t.itinerary.map((row) => ({ ...row, date: null })),
      hotels: t.hotels.map((row) => ({
        ...row,
        checkInDate: row.checkInDate ? new Date(row.checkInDate) : null,
        checkOutDate: row.checkOutDate ? new Date(row.checkOutDate) : null,
        internalCost: row.internalCost ? Number(row.internalCost) : null,
        sellingPrice: row.sellingPrice ? Number(row.sellingPrice) : null,
      })),
      services: t.services.map((row) => ({
        serviceType: row.serviceType as QuotationTemplateInput['services'][number]['serviceType'],
        name: row.name,
        description: row.description,
        dayNumber: row.dayNumber,
        city: row.city,
        quantity: Number(row.quantity),
        internalCost: row.internalCost ? Number(row.internalCost) : null,
        sellingPrice: row.sellingPrice ? Number(row.sellingPrice) : null,
        taxCategory: row.taxCategory,
        notes: row.notes,
        sequence: row.sequence,
      })),
      inclusions: t.inclusions,
      exclusions: t.exclusions,
      terms: t.terms,
    });
  }, [detail.data, form]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (form.formState.isDirty) event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [form.formState.isDirty]);
  const submit = form.handleSubmit((value) => {
    const resequence = <T extends object>(rows: T[]) =>
      rows.map((row, index) => ({ ...row, sequence: index + 1 }));
    save.mutate(
      {
        ...value,
        itinerary: resequence(value.itinerary).map((row, index) => ({
          ...row,
          dayNumber: index + 1,
        })),
        hotels: resequence(value.hotels),
        services: resequence(value.services),
        inclusions: resequence(value.inclusions),
        exclusions: resequence(value.exclusions),
        terms: resequence(value.terms),
      },
      { onSuccess: (created) => navigate(`/quotation-templates/${created.id}`) },
    );
  });
  return (
    <form className="space-y-5" onSubmit={submit}>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            to={templateId ? `/quotation-templates/${templateId}` : '/quotation-templates'}
            className="rounded-lg p-2 hover:bg-white"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <p className="text-sm text-slate-500">Quotation templates</p>
            <h1 className="text-2xl font-semibold">
              {templateId ? 'Edit template' : 'New quotation template'}
            </h1>
          </div>
        </div>
        <Button type="submit" isLoading={save.isPending}>
          <Save className="h-4 w-4" />
          Save template
        </Button>
      </header>
      {save.isError && (
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{save.error.message}</p>
      )}
      <section className="rounded-xl border bg-white p-5">
        <h2 className="font-semibold">1. Basic information</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <FormField label="Template name" required error={form.formState.errors.name?.message}>
            <input
              {...form.register('name')}
              className={inputClasses(Boolean(form.formState.errors.name))}
            />
          </FormField>
          <FormField
            label="Destination summary"
            required
            error={form.formState.errors.destinationSummary?.message}
          >
            <input
              {...form.register('destinationSummary')}
              placeholder="Goa • Calangute • Panjim"
              className={inputClasses(Boolean(form.formState.errors.destinationSummary))}
            />
          </FormField>
          <FormField label="Description">
            <textarea {...form.register('description')} rows={3} className={field} />
          </FormField>
          <FormField label="Internal notes">
            <textarea {...form.register('internalNotes')} rows={3} className={field} />
          </FormField>
          <FormField label="Days">
            <input
              type="number"
              {...form.register('durationDays', { valueAsNumber: true })}
              className={field}
            />
          </FormField>
          <FormField label="Nights">
            <input
              type="number"
              {...form.register('durationNights', { valueAsNumber: true })}
              className={field}
            />
          </FormField>
          <FormField label="Currency">
            <input {...form.register('baseCurrency')} maxLength={3} className={field} />
          </FormField>
          <FormField label="Status">
            <select {...form.register('status')} className={field}>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </select>
          </FormField>
        </div>
      </section>
      <section className="rounded-xl border bg-white p-5">
        <h2 className="font-semibold">2. Base pricing</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {(
            [
              ['adultBasePrice', 'Adult'],
              ['childWithBedBasePrice', 'Child with bed'],
              ['childWithoutBedBasePrice', 'Child without bed'],
              ['infantBasePrice', 'Infant'],
            ] as const
          ).map(([name, label]) => (
            <FormField key={name} label={label}>
              <input
                aria-label={label}
                type="number"
                min="0"
                step="0.01"
                value={form.watch(name) ?? ''}
                onChange={(event) =>
                  form.setValue(name, nullableNumber(event.target.value), { shouldDirty: true })
                }
                className={field}
              />
            </FormField>
          ))}
        </div>
      </section>
      <section className="rounded-xl border bg-white p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">3. Hotel options</h2>
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
                internalCost: null,
                sellingPrice: null,
                selected: true,
                notes: null,
                sequence: hotels.fields.length + 1,
              })
            }
          >
            <Plus className="h-4 w-4" />
            Add hotel
          </Button>
        </div>
        <div className="mt-4 space-y-3">
          {hotels.fields.map((row, index) => (
            <article key={row.id} className="rounded-lg border bg-slate-50 p-4">
              <div className="mb-3 flex justify-between">
                <strong>Hotel option {index + 1}</strong>
                <Reorder
                  index={index}
                  count={hotels.fields.length}
                  move={hotels.move}
                  remove={hotels.remove}
                />
              </div>
              <div className="grid gap-3 md:grid-cols-4">
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
                  aria-label="Category"
                  placeholder="Star category"
                  {...form.register(`hotels.${index}.category`)}
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
                  aria-label="Nights"
                  type="number"
                  min="1"
                  {...form.register(`hotels.${index}.nights`, { valueAsNumber: true })}
                  className={field}
                />
                <input
                  aria-label="Internal cost"
                  type="number"
                  step="0.01"
                  placeholder="Internal cost"
                  {...form.register(`hotels.${index}.internalCost`, { setValueAs: nullableNumber })}
                  className={field}
                />
                <input
                  aria-label="Selling price"
                  type="number"
                  step="0.01"
                  placeholder="Selling price"
                  {...form.register(`hotels.${index}.sellingPrice`, { setValueAs: nullableNumber })}
                  className={field}
                />
              </div>
            </article>
          ))}
        </div>
      </section>
      <section className="rounded-xl border bg-white p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">4. Day-wise itinerary</h2>
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
            Add day
          </Button>
        </div>
        <div className="mt-4 space-y-3">
          {itinerary.fields.map((row, index) => (
            <article key={row.id} className="rounded-lg border p-4">
              <div className="mb-3 flex justify-between">
                <strong>Day {index + 1}</strong>
                <Reorder
                  index={index}
                  count={itinerary.fields.length}
                  move={itinerary.move}
                  remove={itinerary.remove}
                />
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <input
                  aria-label="Day title"
                  placeholder="Title"
                  {...form.register(`itinerary.${index}.title`)}
                  className={field}
                />
                <input
                  aria-label="Day destination"
                  placeholder="Destination"
                  {...form.register(`itinerary.${index}.destination`)}
                  className={field}
                />
                <input
                  aria-label="Meals"
                  placeholder="Meals"
                  {...form.register(`itinerary.${index}.meals`)}
                  className={field}
                />
                <textarea
                  aria-label="Day description"
                  placeholder="Description"
                  rows={3}
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
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">5. Services and activities</h2>
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
                internalCost: null,
                sellingPrice: null,
                taxCategory: null,
                notes: null,
                sequence: services.fields.length + 1,
              })
            }
          >
            <Plus className="h-4 w-4" />
            Add service
          </Button>
        </div>
        <div className="mt-4 space-y-3">
          {services.fields.map((row, index) => (
            <article key={row.id} className="rounded-lg border p-4">
              <div className="mb-3 flex justify-between">
                <strong>Service {index + 1}</strong>
                <Reorder
                  index={index}
                  count={services.fields.length}
                  move={services.move}
                  remove={services.remove}
                />
              </div>
              <div className="grid gap-3 md:grid-cols-4">
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
                  placeholder="Name"
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
                  {...form.register(`services.${index}.dayNumber`, { setValueAs: nullableNumber })}
                  className={field}
                />
                <input
                  aria-label="Quantity"
                  type="number"
                  step="0.01"
                  {...form.register(`services.${index}.quantity`, { valueAsNumber: true })}
                  className={field}
                />
                <input
                  aria-label="Service cost"
                  type="number"
                  step="0.01"
                  placeholder="Internal cost"
                  {...form.register(`services.${index}.internalCost`, {
                    setValueAs: nullableNumber,
                  })}
                  className={field}
                />
                <input
                  aria-label="Service selling"
                  type="number"
                  step="0.01"
                  placeholder="Selling price"
                  {...form.register(`services.${index}.sellingPrice`, {
                    setValueAs: nullableNumber,
                  })}
                  className={field}
                />
                <input
                  aria-label="Tax category"
                  placeholder="Tax category"
                  {...form.register(`services.${index}.taxCategory`)}
                  className={field}
                />
              </div>
            </article>
          ))}
        </div>
      </section>
      <div className="grid gap-5 lg:grid-cols-3">
        {(
          [
            ['6. Inclusions', inclusions, 'inclusions'],
            ['7. Exclusions', exclusions, 'exclusions'],
            ['8. Terms and conditions', terms, 'terms'],
          ] as const
        ).map(([title, array, name]) => (
          <section key={name} className="rounded-xl border bg-white p-5">
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
        ))}
      </div>
      <div className="flex justify-end">
        <Button type="submit" isLoading={save.isPending}>
          <Save className="h-4 w-4" />
          Save template
        </Button>
      </div>
    </form>
  );
}
