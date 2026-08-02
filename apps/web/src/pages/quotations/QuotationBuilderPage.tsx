import { useEffect, useMemo, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { ArrowLeft, Plus, Save, Trash2 } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  PERMISSIONS,
  labelForLookup,
  quotationVersionInputSchema,
  type QuotationVersionInput,
} from '@interscale/shared';
import { Button } from '@/components/ui/Button';
import { RichTextEditor } from '@/components/ui/RichTextEditor';
import { cn } from '@/utils/cn';
import { useAuth } from '@/features/auth/AuthProvider';
import { useQuotation, useUpdateQuotationVersion } from '@/features/quotations/quotations.api';
import { useAddOnServices } from '@/features/masters/masters.api';
import {
  CLEARED_SERVICE_MASTERS,
  HotelMasterFields,
  ServiceMasterFields,
  type HotelRowPatch,
  type ServiceRowPatch,
} from '@/features/quotations/MasterFields';

const field = 'w-full rounded-lg border border-slate-300 bg-card px-3 py-2 text-sm';

/** Tab model. `types` maps a tab to the service rows it owns (Hotel/Inclusions/Summary have their own UI). */
type ServiceType = QuotationVersionInput['services'][number]['serviceType'];
interface TabDef {
  key: string;
  label: string;
  types?: ServiceType[];
  required?: boolean;
}
const ADDON_TYPES: ServiceType[] = [
  'TRAVEL_INSURANCE',
  'RAIL',
  'PASSPORT_ASSISTANCE',
  'MEAL',
  'GUIDE',
  'OTHER_ADD_ON',
  'GENERAL_ENQUIRY',
];
const TABS: TabDef[] = [
  { key: 'flight', label: 'Flight', types: ['FLIGHT'], required: true },
  { key: 'hotel', label: 'Hotel', required: true },
  { key: 'sightseeing', label: 'Sightseeing', types: ['SIGHTSEEING'], required: true },
  { key: 'cruise', label: 'Cruise', types: ['CRUISE'] },
  { key: 'vehicle', label: 'Vehicle', types: ['VEHICLE_TRANSFER'] },
  { key: 'visa', label: 'Visa', required: true },
  { key: 'addon', label: 'Add-on Services', types: ADDON_TYPES },
  { key: 'inclusions', label: 'Inclusions & Exclusions' },
  { key: 'summary', label: 'Summary & Pricing' },
];

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
  perAdultPrice: 0,
  perChildWithBedPrice: 0,
  perChildWithoutBedPrice: 0,
  perInfantPrice: 0,
  taxNote: null,
  netAmount: 0,
  initialPaymentAmount: 0,
  paymentLink: null,
  showServiceChargesSeparately: false,
  markServiceChargesOutside: false,
  hidePricing: false,
  showIndividualPricing: false,
  inclusionsHtml: null,
  exclusionsHtml: null,
  paymentPolicies: null,
  cancellationPolicies: null,
  bookingTerms: null,
  includeVisa: true,
  visaSectionTitle: null,
  visaAmount: 0,
  visaDestination: null,
  visaType: null,
  visaServiceCharge: 0,
  visaGstPercent: 0,
  visaVfsCharge: 0,
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
  const addOnMasters = useAddOnServices(
    useMemo(() => new URLSearchParams({ status: 'ACTIVE', pageSize: '100' }), []),
  );
  const [activeTab, setActiveTab] = useState('flight');
  const [excluded, setExcluded] = useState<Record<string, boolean>>({});
  const form = useForm<QuotationVersionInput>({
    resolver: zodResolver(quotationVersionInputSchema),
    defaultValues: defaults,
  });
  const itinerary = useFieldArray({ control: form.control, name: 'itinerary' });
  const hotels = useFieldArray({ control: form.control, name: 'hotels' });
  const services = useFieldArray({ control: form.control, name: 'services' });
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
      perAdultPrice: Number(version.perAdultPrice ?? 0),
      perChildWithBedPrice: Number(version.perChildWithBedPrice ?? 0),
      perChildWithoutBedPrice: Number(version.perChildWithoutBedPrice ?? 0),
      perInfantPrice: Number(version.perInfantPrice ?? 0),
      taxNote: version.taxNote ?? null,
      netAmount: Number(version.netAmount ?? 0),
      initialPaymentAmount: Number(version.initialPaymentAmount ?? 0),
      paymentLink: version.paymentLink ?? null,
      showServiceChargesSeparately: version.showServiceChargesSeparately ?? false,
      markServiceChargesOutside: version.markServiceChargesOutside ?? false,
      hidePricing: version.hidePricing ?? false,
      showIndividualPricing: version.showIndividualPricing ?? false,
      inclusionsHtml: version.inclusionsHtml ?? null,
      exclusionsHtml: version.exclusionsHtml ?? null,
      paymentPolicies: version.paymentPolicies ?? null,
      cancellationPolicies: version.cancellationPolicies ?? null,
      bookingTerms: version.bookingTerms ?? null,
      includeVisa: version.includeVisa ?? true,
      visaSectionTitle: version.visaSectionTitle ?? null,
      visaAmount: Number(version.visaAmount ?? 0),
      visaDestination: version.visaDestination ?? null,
      visaType: version.visaType ?? null,
      visaServiceCharge: Number(version.visaServiceCharge ?? 0),
      visaGstPercent: Number(version.visaGstPercent ?? 0),
      visaVfsCharge: Number(version.visaVfsCharge ?? 0),
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
        serviceType: row.serviceType as ServiceType,
        airlineId: row.airlineId ?? null,
        cruiseId: row.cruiseId ?? null,
        cruiseRoomTypeId: row.cruiseRoomTypeId ?? null,
        vehicleId: row.vehicleId ?? null,
        sightseeingId: row.sightseeingId ?? null,
        addOnServiceId: row.addOnServiceId ?? null,
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

  const applyPatch = (path: 'hotels' | 'services', index: number, patch: object) => {
    for (const [key, value] of Object.entries(patch))
      form.setValue(`${path}.${index}.${key}` as 'hotels.0.hotelName', value as never, {
        shouldDirty: true,
      });
  };
  const applyHotel = (index: number, patch: HotelRowPatch) => applyPatch('hotels', index, patch);
  const applyService = (index: number, patch: ServiceRowPatch) =>
    applyPatch('services', index, patch);

  const estimate = useMemo(() => {
    const hotelRows = watchedHotels ?? [];
    const serviceRows = watchedServices ?? [];
    const isAddon = (row: { serviceType?: string }) =>
      ADDON_TYPES.includes((row.serviceType ?? '') as ServiceType);
    const packageServices = serviceRows.filter((row) => !isAddon(row));
    const addonServices = serviceRows.filter(isAddon);
    // Add-on services are quoted separately and are NOT part of the package total.
    const addon = addonServices
      .map((row) => Number(row.sellingPrice ?? 0) * Number(row.quantity ?? 1))
      .reduce((a, b) => a + b, 0);
    const cost = [
      ...hotelRows.map((row) => Number(row.internalCost ?? 0)),
      ...packageServices.map((row) => Number(row.internalCost ?? 0) * Number(row.quantity ?? 1)),
    ].reduce((a, b) => a + b, 0);
    const selling = [
      ...hotelRows.map((row) => Number(row.sellingPrice ?? 0)),
      ...packageServices.map((row) => Number(row.sellingPrice ?? 0) * Number(row.quantity ?? 1)),
    ].reduce((a, b) => a + b, 0);
    const markup =
      markupMode === 'PERCENTAGE'
        ? (selling * Number(markupValue)) / 100
        : markupMode === 'FIXED'
          ? Number(markupValue)
          : 0;
    const preTax = Math.max(0, selling + markup - Number(discount));
    const tax = (preTax * Number(taxRate)) / 100;
    return { cost, selling, markup, tax, addon, final: preTax + tax, margin: preTax - cost };
  }, [watchedHotels, watchedServices, markupMode, markupValue, taxRate, discount]);

  if (quotation.isLoading) return <div className="h-96 animate-pulse rounded-xl bg-card" />;
  if (!quotation.data || !version)
    return <div className="rounded-xl bg-card p-12 text-center">Draft version unavailable.</div>;
  if (version.status !== 'DRAFT')
    return (
      <div className="rounded-xl bg-card p-12 text-center">
        Finalized versions are immutable. Create a revision to edit.
      </div>
    );

  const q = quotation.data;
  const nights =
    q.travelStartDate && q.travelEndDate
      ? Math.max(
          0,
          Math.round(
            (new Date(q.travelEndDate).getTime() - new Date(q.travelStartDate).getTime()) /
              86_400_000,
          ),
        )
      : null;
  const travellers = [
    q.adults ? `${q.adults} Adult(s)` : '',
    q.childrenWithBed + q.childrenWithoutBed
      ? `${q.childrenWithBed + q.childrenWithoutBed} Child(ren)`
      : '',
    q.infants ? `${q.infants} Infant(s)` : '',
  ]
    .filter(Boolean)
    .join(', ');

  // Reference "Summary & Pricing": the package total is per-passenger pricing
  // multiplied by this lead's traveller mix. Add-ons are quoted separately.
  const pax = {
    adults: q.adults ?? 0,
    cwb: q.childrenWithBed ?? 0,
    cwob: q.childrenWithoutBed ?? 0,
    infants: q.infants ?? 0,
  };
  const perPax = {
    adult: Number(form.watch('perAdultPrice') ?? 0),
    cwb: Number(form.watch('perChildWithBedPrice') ?? 0),
    cwob: Number(form.watch('perChildWithoutBedPrice') ?? 0),
    infant: Number(form.watch('perInfantPrice') ?? 0),
  };
  const packageTotal =
    perPax.adult * pax.adults +
    perPax.cwb * pax.cwb +
    perPax.cwob * pax.cwob +
    perPax.infant * pax.infants;
  const packageMargin = packageTotal - Number(form.watch('netAmount') ?? 0);
  const currency = form.watch('currency');

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

  const isIncluded = (key: string) => !excluded[key];
  const toggleInclude = (key: string) =>
    setExcluded((current) => ({ ...current, [key]: !current[key] }));

  /** A coloured section header bar like the reference tabs' bodies. */
  const IncludeBar = ({ tabKey, label }: { tabKey: string; label: string }) => (
    <label className="flex items-center gap-2 text-sm font-semibold text-slate-800">
      <input
        type="checkbox"
        checked={isIncluded(tabKey)}
        onChange={() => toggleInclude(tabKey)}
      />
      Include {label} in Quotation
    </label>
  );

  /** Render the service rows belonging to a tab, plus an add button. */
  const serviceTab = (tab: TabDef) => {
    const types = tab.types ?? [];
    const rows = services.fields
      .map((row, index) => ({ row, index }))
      .filter(({ index }) =>
        types.includes((watchedServices?.[index]?.serviceType ?? 'SIGHTSEEING') as ServiceType),
      );
    return (
      <div className="space-y-4">
        <IncludeBar tabKey={tab.key} label={tab.label} />
        {isIncluded(tab.key) && (
          <>
            <div className="flex justify-end">
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  services.append({
                    serviceType: types[0] ?? 'OTHER_ADD_ON',
                    ...CLEARED_SERVICE_MASTERS,
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
                <Plus className="h-4 w-4" /> Add {tab.label}
              </Button>
            </div>
            {rows.length === 0 && (
              <p className="rounded-lg border border-dashed p-6 text-center text-sm text-slate-500">
                No {tab.label.toLowerCase()} added yet.
              </p>
            )}
            {rows.map(({ row, index }) => (
              <article key={row.id} className="grid gap-3 rounded-lg border p-4 md:grid-cols-4">
                <select
                  aria-label="Service type"
                  {...form.register(`services.${index}.serviceType`, {
                    onChange: () => applyService(index, CLEARED_SERVICE_MASTERS),
                  })}
                  className={field}
                >
                  {(tab.types ?? []).map((value) => (
                    <option key={value} value={value}>
                      {labelForLookup(value)}
                    </option>
                  ))}
                </select>
                <ServiceMasterFields
                  serviceType={watchedServices?.[index]?.serviceType ?? 'SIGHTSEEING'}
                  value={{
                    airlineId: watchedServices?.[index]?.airlineId,
                    cruiseId: watchedServices?.[index]?.cruiseId,
                    cruiseRoomTypeId: watchedServices?.[index]?.cruiseRoomTypeId,
                    vehicleId: watchedServices?.[index]?.vehicleId,
                    sightseeingId: watchedServices?.[index]?.sightseeingId,
                    addOnServiceId: watchedServices?.[index]?.addOnServiceId,
                  }}
                  onChange={(patch) => applyService(index, patch)}
                />
                <input
                  aria-label="Service name"
                  placeholder="Name / title"
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
                  placeholder="Qty"
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
                  placeholder="Selling price"
                  {...form.register(`services.${index}.sellingPrice`, { setValueAs: nullable })}
                  className={field}
                />
                <textarea
                  aria-label="Service description"
                  rows={2}
                  placeholder="Description"
                  {...form.register(`services.${index}.description`)}
                  className={`${field} md:col-span-3`}
                />
                <div className="flex items-end">
                  <Button size="sm" variant="ghost" onClick={() => services.remove(index)}>
                    <Trash2 className="h-4 w-4 text-red-600" /> Remove
                  </Button>
                </div>
              </article>
            ))}
          </>
        )}
      </div>
    );
  };

  /**
   * The Add-on Services tab is a master-driven include-table (reference layout):
   * every active add-on master is a row you toggle into the quotation. Including
   * one appends an OTHER_ADD_ON service carrying its name, description and price,
   * which the caller can then edit per-quotation.
   */
  const addonTable = () => {
    const masters = addOnMasters.data?.data ?? [];
    const includedIndex = (id: string) =>
      (watchedServices ?? []).findIndex((row) => row?.addOnServiceId === id);
    const total = masters.reduce((sum, master) => {
      const index = includedIndex(master.id);
      return index >= 0 ? sum + Number(watchedServices?.[index]?.sellingPrice ?? 0) : sum;
    }, 0);
    const currency = form.watch('currency');
    const toggle = (master: (typeof masters)[number], checked: boolean) => {
      if (checked) {
        services.append({
          serviceType: 'OTHER_ADD_ON',
          ...CLEARED_SERVICE_MASTERS,
          addOnServiceId: master.id,
          name: master.name,
          description: master.description ?? null,
          dayNumber: null,
          city: null,
          quantity: 1,
          internalCost: 0,
          sellingPrice: master.price ?? 0,
          taxCategory: null,
          notes: null,
          sequence: services.fields.length + 1,
        });
      } else {
        const index = includedIndex(master.id);
        if (index >= 0) services.remove(index);
      }
    };
    return (
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          Select additional services to include in this quotation:
        </p>
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-left text-slate-600">
                <th className="w-20 px-4 py-3 font-semibold">Include</th>
                <th className="w-48 px-4 py-3 font-semibold">Service</th>
                <th className="px-4 py-3 font-semibold">Description</th>
                <th className="w-40 px-4 py-3 font-semibold">Price</th>
              </tr>
            </thead>
            <tbody>
              {masters.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                    {addOnMasters.isPending
                      ? 'Loading add-on services…'
                      : 'No add-on services in the master list yet.'}
                  </td>
                </tr>
              )}
              {masters.map((master) => {
                const index = includedIndex(master.id);
                const included = index >= 0;
                return (
                  <tr key={master.id} className="border-t align-top">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        aria-label={`Include ${master.name}`}
                        checked={included}
                        onChange={(event) => toggle(master, event.target.checked)}
                      />
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-800">{master.name}</td>
                    <td className="px-4 py-3">
                      {included ? (
                        <textarea
                          aria-label={`${master.name} description`}
                          rows={2}
                          {...form.register(`services.${index}.description`)}
                          className={field}
                        />
                      ) : (
                        <p className="text-slate-500">{master.description || '—'}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-stretch overflow-hidden rounded-lg border border-slate-300">
                        <span className="flex items-center bg-slate-100 px-2 text-slate-500">
                          {currency}
                        </span>
                        <input
                          type="number"
                          step="0.01"
                          aria-label={`${master.name} price`}
                          disabled={!included}
                          value={
                            included ? (watchedServices?.[index]?.sellingPrice ?? 0) : (master.price ?? 0)
                          }
                          onChange={(event) =>
                            included &&
                            form.setValue(
                              `services.${index}.sellingPrice`,
                              event.target.value === '' ? 0 : Number(event.target.value),
                              { shouldDirty: true },
                            )
                          }
                          className="min-w-0 flex-1 bg-card px-3 py-2 outline-none disabled:bg-slate-50 disabled:text-slate-400"
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t bg-slate-50">
                <td colSpan={3} className="px-4 py-3 text-right font-semibold text-slate-700">
                  Total Add-on Services:
                </td>
                <td className="px-4 py-3 font-semibold text-slate-900">
                  {currency} {total.toFixed(2)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    );
  };

  /** Reference "Visa" tab — one dedicated section, not a list of service rows. */
  const visaSection = () => {
    const svc = Number(form.watch('visaServiceCharge') ?? 0);
    const gst = Number(form.watch('visaGstPercent') ?? 0);
    const vfs = Number(form.watch('visaVfsCharge') ?? 0);
    const gstAmount = (svc * gst) / 100;
    const consolidated = svc + gstAmount + vfs;
    const included = form.watch('includeVisa') ?? true;
    const moneyInput = (label: string, name: 'visaAmount' | 'visaServiceCharge' | 'visaVfsCharge') => (
      <label className="text-sm font-semibold text-slate-800">
        {label}
        <div className="mt-1 flex items-stretch overflow-hidden rounded-lg border border-slate-300 focus-within:border-brand-500">
          <span className="flex items-center bg-slate-100 px-2 text-slate-500">{currency}</span>
          <input
            type="number"
            step="0.01"
            aria-label={label}
            {...form.register(name, { valueAsNumber: true })}
            className="min-w-0 flex-1 bg-card px-3 py-2 text-sm outline-none"
          />
        </div>
      </label>
    );
    return (
      <div className="space-y-4">
        <label className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          <input type="checkbox" {...form.register('includeVisa')} />
          Include Visa in Quotation
        </label>
        {included && (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="text-sm font-semibold text-slate-800">
                Section Title
                <input
                  aria-label="Visa section title"
                  placeholder="Visa Details"
                  {...form.register('visaSectionTitle')}
                  className={`${field} mt-1`}
                />
              </label>
              {moneyInput('Amount', 'visaAmount')}
              <label className="text-sm font-semibold text-slate-800">
                Destination
                <input
                  aria-label="Visa destination"
                  {...form.register('visaDestination')}
                  className={`${field} mt-1`}
                />
              </label>
              <label className="text-sm font-semibold text-slate-800">
                Visa Type
                <input
                  aria-label="Visa type"
                  placeholder="Select Visa Type"
                  {...form.register('visaType')}
                  className={`${field} mt-1`}
                />
              </label>
            </div>
            <div className="grid gap-4 rounded-lg bg-slate-50 p-4 md:grid-cols-3">
              {moneyInput('Service Charge', 'visaServiceCharge')}
              <label className="text-sm font-semibold text-slate-800">
                GST %
                <input
                  type="number"
                  step="0.01"
                  aria-label="Visa GST percent"
                  {...form.register('visaGstPercent', { valueAsNumber: true })}
                  className={`${field} mt-1`}
                />
              </label>
              <label className="text-sm font-semibold text-slate-800">
                GST Amount
                <input
                  readOnly
                  value={`${currency} ${gstAmount.toFixed(2)}`}
                  className={`${field} mt-1 bg-slate-100`}
                />
              </label>
              {moneyInput('VFS Charge', 'visaVfsCharge')}
              <label className="text-sm font-semibold text-slate-800 md:col-span-2">
                Consolidated Total
                <input
                  readOnly
                  value={`${currency} ${consolidated.toFixed(2)}`}
                  className={`${field} mt-1 bg-slate-100`}
                />
                <span className="mt-1 block text-xs font-normal text-slate-500">
                  Service Charge + GST + VFS Charge
                </span>
              </label>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <form className="space-y-5" onSubmit={submit}>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link to={`/quotations/${quotationId}`} className="rounded-lg p-2 hover:bg-card">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <p className="text-sm text-slate-500">
              {q.quotationNumber} · Version {version.versionNumber}
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

      <div className="rounded-t-xl bg-gradient-to-r from-brand-700 to-blue-600 px-5 py-4 font-semibold text-white">
        Quotation for {q.customerName}
        {nights != null && ` (${nights} Nights / ${nights + 1} Days)`}
        {q.destinationSummary && ` — ${q.destinationSummary}`}
      </div>

      <section className="rounded-xl border bg-card p-5">
        <div className="grid gap-4 md:grid-cols-3">
          <label className="text-sm font-semibold text-slate-800">
            Quotation Title <span className="text-red-500">*</span>
            <input aria-label="Title" {...form.register('title')} className={`${field} mt-1`} />
          </label>
          <label className="text-sm font-semibold text-slate-800">
            Version
            <input
              value={version.versionNumber}
              readOnly
              className={`${field} mt-1 bg-slate-100`}
            />
          </label>
          <label className="text-sm font-semibold text-slate-800">
            Lead Stage
            <input
              value={q.query?.leadStage ? labelForLookup(q.query.leadStage) : ''}
              readOnly
              className={`${field} mt-1 bg-slate-100`}
            />
          </label>
        </div>
      </section>

      {/* Tab navigation */}
      <div className="flex flex-wrap gap-x-6 gap-y-2 border-b border-brand-500 px-1">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            aria-label={tab.label}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'relative -mb-px border-b-2 px-1 py-3 text-sm font-semibold',
              activeTab === tab.key
                ? 'border-brand-600 text-slate-900'
                : 'border-transparent text-brand-700 hover:text-brand-900',
            )}
          >
            {tab.label}
            {tab.required && <span className="ml-0.5 text-red-500">*</span>}
          </button>
        ))}
      </div>

      {/* Tab panels — only the active tab is mounted (RHF keeps field values). */}
      <section className="rounded-xl border bg-card p-5">
        {TABS.filter((t) => t.types && t.key === activeTab && t.key !== 'addon').map((tab) => (
          <div key={tab.key}>{serviceTab(tab)}</div>
        ))}

        {/* Add-on Services — master-driven include-table. */}
        {activeTab === 'addon' && addonTable()}

        {/* Visa — dedicated section. */}
        {activeTab === 'visa' && visaSection()}

        {/* Hotel */}
        {activeTab === 'hotel' && (
          <div className="space-y-4">
            <IncludeBar tabKey="hotel" label="Hotel" />
            {isIncluded('hotel') && (
              <>
                <div className="flex justify-end">
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
                        hotelId: null,
                        hotelRoomTypeId: null,
                        hotelMealPlanId: null,
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
                    <Plus className="h-4 w-4" /> Add Hotel
                  </Button>
                </div>
                {hotels.fields.length === 0 && (
                  <p className="rounded-lg border border-dashed p-6 text-center text-sm text-slate-500">
                    No hotels added yet.
                  </p>
                )}
                {hotels.fields.map((row, index) => (
                  <article key={row.id} className="grid gap-3 rounded-lg border bg-slate-50 p-4 md:grid-cols-4">
                    <HotelMasterFields
                      canCost={canCost}
                      value={{
                        hotelId: watchedHotels?.[index]?.hotelId,
                        hotelRoomTypeId: watchedHotels?.[index]?.hotelRoomTypeId,
                        hotelMealPlanId: watchedHotels?.[index]?.hotelMealPlanId,
                      }}
                      onChange={(patch) => applyHotel(index, patch)}
                    />
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
                      placeholder="Rooms"
                      {...form.register(`hotels.${index}.rooms`, { valueAsNumber: true })}
                      className={field}
                    />
                    <input
                      aria-label="Nights"
                      type="number"
                      min="1"
                      placeholder="Nights"
                      {...form.register(`hotels.${index}.nights`, { valueAsNumber: true })}
                      className={field}
                    />
                    <input
                      aria-label="Hotel check-in"
                      type="date"
                      value={toDate(watchedHotels?.[index]?.checkInDate?.toString() ?? null)}
                      onChange={(event) =>
                        form.setValue(
                          `hotels.${index}.checkInDate`,
                          event.target.value ? new Date(event.target.value) : null,
                          { shouldDirty: true },
                        )
                      }
                      className={field}
                    />
                    <input
                      aria-label="Hotel check-out"
                      type="date"
                      value={toDate(watchedHotels?.[index]?.checkOutDate?.toString() ?? null)}
                      onChange={(event) =>
                        form.setValue(
                          `hotels.${index}.checkOutDate`,
                          event.target.value ? new Date(event.target.value) : null,
                          { shouldDirty: true },
                        )
                      }
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
                    <input
                      aria-label="Hotel remark"
                      placeholder="Remark"
                      {...form.register(`hotels.${index}.notes`)}
                      className={`${field} md:col-span-2`}
                    />
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" {...form.register(`hotels.${index}.selected`)} />
                      Selected option
                    </label>
                    <div className="flex items-end">
                      <Button size="sm" variant="ghost" onClick={() => hotels.remove(index)}>
                        <Trash2 className="h-4 w-4 text-red-600" /> Remove
                      </Button>
                    </div>
                  </article>
                ))}
              </>
            )}
          </div>
        )}

        {/* Sightseeing day-wise itinerary lives with the Sightseeing tab. */}
        {activeTab === 'sightseeing' && (
          <div className="mt-6 border-t pt-5">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Day-wise Itinerary</h3>
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
                <Plus className="h-4 w-4" /> Add Day
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
          </div>
        )}

        {/* Inclusions & Exclusions — five rich-text blocks (reference layout). */}
        {activeTab === 'inclusions' && (
          <div className="space-y-5">
            <p className="text-sm text-slate-600">
              Customize the inclusions and exclusions for this quotation. These will override the
              default destination policies.
            </p>
            <div className="grid gap-5 lg:grid-cols-2">
              {(
                [
                  ['✅ Inclusions', 'inclusionsHtml', 'List all services and items included in the package.'],
                  ['❌ Exclusions', 'exclusionsHtml', 'List all services and items not included in the package.'],
                  ['💳 Payment Policies', 'paymentPolicies', 'Specify payment terms, advance requirements, etc.'],
                  ['🚫 Cancellation Policies', 'cancellationPolicies', 'Specify cancellation charges and conditions.'],
                ] as const
              ).map(([title, name, hint]) => (
                <div key={name}>
                  <h3 className="mb-1 font-semibold text-slate-800">{title}</h3>
                  <RichTextEditor
                    ariaLabel={title.replace(/^\S+\s/, '')}
                    value={form.watch(name) ?? ''}
                    onChange={(html) => form.setValue(name, html, { shouldDirty: true })}
                  />
                  <p className="mt-1 text-xs text-slate-500">{hint}</p>
                </div>
              ))}
            </div>
            <div>
              <h3 className="mb-1 font-semibold text-slate-800">📄 Booking Terms &amp; Conditions</h3>
              <RichTextEditor
                ariaLabel="Booking Terms & Conditions"
                value={form.watch('bookingTerms') ?? ''}
                onChange={(html) => form.setValue('bookingTerms', html, { shouldDirty: true })}
              />
              <p className="mt-1 text-xs text-slate-500">General terms, conditions, and important notes.</p>
            </div>
          </div>
        )}

        {/* Summary & Pricing — per-passenger package pricing (reference layout). */}
        {activeTab === 'summary' && (
          <div className="space-y-5">
            <section className="overflow-hidden rounded-xl border">
              <div className="bg-gradient-to-r from-brand-700 to-blue-600 px-5 py-3 font-semibold text-white">
                Package Pricing
              </div>
              <div className="space-y-5 p-5">
                <label className="block max-w-sm text-sm font-semibold text-slate-800">
                  Currency <span className="text-red-500">*</span>
                  <input aria-label="Currency" {...form.register('currency')} className={`${field} mt-1`} />
                </label>

                <div className="grid gap-4 md:grid-cols-4">
                  {(
                    [
                      ['Per Adult Price', 'perAdultPrice', true],
                      ['Per CWB Price', 'perChildWithBedPrice', false],
                      ['Per CWOB Price', 'perChildWithoutBedPrice', false],
                      ['Per Infant Price', 'perInfantPrice', false],
                    ] as const
                  ).map(([label, name, required]) => (
                    <label key={name} className="text-sm font-semibold text-slate-800">
                      {label} {required && <span className="text-red-500">*</span>}
                      <div className="mt-1 flex items-stretch overflow-hidden rounded-lg border border-slate-300 focus-within:border-brand-500">
                        <span className="flex items-center bg-slate-100 px-2 text-slate-500">{currency}</span>
                        <input
                          type="number"
                          step="0.01"
                          aria-label={label}
                          {...form.register(name, { valueAsNumber: true })}
                          className="min-w-0 flex-1 bg-card px-3 py-2 text-sm outline-none"
                        />
                      </div>
                    </label>
                  ))}
                </div>

                <div className="grid gap-4 md:grid-cols-4 lg:grid-cols-6">
                  {(
                    [
                      ['Adults', pax.adults],
                      ['CWB', pax.cwb],
                      ['CWOB', pax.cwob],
                      ['Infants', pax.infants],
                    ] as const
                  ).map(([label, value]) => (
                    <label key={label} className="text-sm font-semibold text-slate-800">
                      {label}
                      <input readOnly value={value} className={`${field} mt-1 bg-slate-100`} />
                    </label>
                  ))}
                  <label className="text-sm font-semibold text-slate-800">
                    Total Package Price
                    <input
                      readOnly
                      value={`${currency} ${packageTotal.toFixed(2)}`}
                      className={`${field} mt-1 bg-slate-100`}
                    />
                  </label>
                  <label className="text-sm font-semibold text-slate-800">
                    Tax Note on Total Price
                    <input
                      aria-label="Tax note"
                      placeholder="e.g. Inclusive of GST"
                      {...form.register('taxNote')}
                      className={`${field} mt-1`}
                    />
                  </label>
                </div>

                {canCost && (
                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="text-sm font-semibold text-slate-800">
                      Net Amount
                      <div className="mt-1 flex items-stretch overflow-hidden rounded-lg border border-slate-300 focus-within:border-brand-500">
                        <span className="flex items-center bg-slate-100 px-2 text-slate-500">{currency}</span>
                        <input
                          type="number"
                          step="0.01"
                          aria-label="Net Amount"
                          {...form.register('netAmount', { valueAsNumber: true })}
                          className="min-w-0 flex-1 bg-card px-3 py-2 text-sm outline-none"
                        />
                      </div>
                      <span className="mt-1 block text-xs font-normal text-slate-500">
                        Enter net amount to calculate margin.
                      </span>
                    </label>
                    <label className="text-sm font-semibold text-slate-800">
                      Margin
                      <input
                        readOnly
                        value={`${currency} ${packageMargin.toFixed(2)}`}
                        className={`${field} mt-1 bg-slate-100`}
                      />
                      <span className="mt-1 block text-xs font-normal text-slate-500">
                        Total Package Price − Net Amount. Internal cost {currency}{' '}
                        {estimate.cost.toFixed(2)}.
                      </span>
                    </label>
                  </div>
                )}
              </div>
            </section>

            <div className="rounded-xl bg-teal-600 p-5 text-white">
              <p className="font-semibold">Package Pricing Breakdown</p>
              {packageTotal === 0 ? (
                <p className="mt-1 text-sm text-white/80">Enter prices to see the breakdown.</p>
              ) : (
                <dl className="mt-3 grid gap-1 text-sm sm:grid-cols-2">
                  {(
                    [
                      [`Adult × ${pax.adults}`, perPax.adult * pax.adults],
                      [`CWB × ${pax.cwb}`, perPax.cwb * pax.cwb],
                      [`CWOB × ${pax.cwob}`, perPax.cwob * pax.cwob],
                      [`Infant × ${pax.infants}`, perPax.infant * pax.infants],
                    ] as const
                  ).map(([label, value]) => (
                    <div key={label} className="flex justify-between border-b border-white/20 py-1">
                      <dt>{label}</dt>
                      <dd>
                        {currency} {value.toFixed(2)}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>

            <div className="space-y-3 rounded-xl border p-5">
              {(
                [
                  ['showServiceChargesSeparately', 'Show Service Charges Separately in PDF (does not affect final total)'],
                  ['markServiceChargesOutside', 'Mark Service Charges as Outside Land Package Cost (does not affect final total)'],
                  ['hidePricing', 'Hide Pricing in Weblink and PDFs'],
                  ['showIndividualPricing', 'Show Individual Pricing Prominently'],
                ] as const
              ).map(([name, label]) => (
                <label key={name} className="flex items-start gap-2 text-sm font-semibold text-slate-800">
                  <input type="checkbox" className="mt-0.5" {...form.register(name)} />
                  {label}
                </label>
              ))}
            </div>

            <section className="rounded-xl border p-5">
              <h3 className="text-lg font-semibold text-slate-800">Initial Payment Details</h3>
              <div className="mt-3 grid gap-4 md:grid-cols-2">
                <label className="text-sm font-semibold text-slate-800">
                  Initial Amount for Booking
                  <div className="mt-1 flex items-stretch overflow-hidden rounded-lg border border-slate-300 focus-within:border-brand-500">
                    <span className="flex items-center bg-slate-100 px-2 text-slate-500">{currency}</span>
                    <input
                      type="number"
                      step="0.01"
                      aria-label="Initial amount for booking"
                      placeholder="Amount required to confirm booking"
                      {...form.register('initialPaymentAmount', { valueAsNumber: true })}
                      className="min-w-0 flex-1 bg-card px-3 py-2 text-sm outline-none"
                    />
                  </div>
                </label>
                <label className="text-sm font-semibold text-slate-800">
                  Payment Link
                  <input
                    aria-label="Payment link"
                    placeholder="https://example.com/pay"
                    {...form.register('paymentLink')}
                    className={`${field} mt-1`}
                  />
                </label>
              </div>
            </section>

            <section className="grid gap-4 rounded-xl border p-5 md:grid-cols-1">
              <label className="text-sm font-semibold text-slate-800">
                Introduction
                <textarea rows={2} {...form.register('introduction')} className={`${field} mt-1`} />
              </label>
              <label className="text-sm font-semibold text-slate-800">
                Customer notes
                <textarea rows={2} {...form.register('notes')} className={`${field} mt-1`} />
              </label>
              {canCost && (
                <label className="text-sm font-semibold text-slate-800">
                  Internal notes
                  <textarea rows={2} {...form.register('internalNotes')} className={`${field} mt-1`} />
                </label>
              )}
            </section>
          </div>
        )}
      </section>

      {/* Quotation Summary (always visible, like the reference) */}
      <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="bg-emerald-600 px-5 py-3 font-semibold text-white">Quotation Summary</div>
        <div className="grid gap-0 p-0 md:grid-cols-2">
          <table className="text-sm">
            <tbody>
              {[
                ['Client Name', q.customerName],
                ['Contact', [q.customerPhone, q.customerEmail].filter(Boolean).join(' / ')],
                ['Travelers', travellers || '—'],
                [
                  'Dates',
                  q.travelStartDate
                    ? `${new Date(q.travelStartDate).toLocaleDateString(undefined, {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}${nights != null ? ` (${nights} Nights / ${nights + 1} Days)` : ''}`
                    : '—',
                ],
                ['Destination', q.destinationSummary || '—'],
              ].map(([label, value]) => (
                <tr key={label} className="border-b last:border-0">
                  <th className="w-40 border-r bg-slate-50 px-4 py-3 text-left font-semibold text-slate-700">
                    {label}
                  </th>
                  <td className="px-4 py-3 text-slate-700">{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex flex-col justify-center gap-3 p-5">
            <div className="rounded-lg bg-emerald-600 p-4 text-white">
              <p className="text-sm opacity-90">Final Quotation Total</p>
              <p className="text-2xl font-bold">
                {currency} {packageTotal.toFixed(2)}
              </p>
              <p className="text-xs opacity-80">(Package Price)</p>
            </div>
            <div className="rounded-lg bg-amber-500 p-4 text-white">
              <p className="text-sm opacity-90">Add-on Services Total</p>
              <p className="text-2xl font-bold">
                {currency} {estimate.addon.toFixed(2)}
              </p>
              <p className="text-xs opacity-80">(Not added to final total)</p>
            </div>
          </div>
        </div>
      </section>

      <div className="flex gap-2">
        <Button type="submit" isLoading={save.isPending}>
          <Save className="h-4 w-4" />
          Save quotation draft
        </Button>
        <Link to={`/quotations/${quotationId}`}>
          <Button variant="secondary" type="button">
            Cancel
          </Button>
        </Link>
      </div>
    </form>
  );
}
