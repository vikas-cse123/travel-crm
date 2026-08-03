import { useEffect, useState } from 'react';
import {
  Building2,
  CarFront,
  CheckCircle2,
  Download,
  ExternalLink,
  Info as InfoIcon,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Ship,
  Plane,
  Star,
  XCircle,
} from 'lucide-react';
import { useParams } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import type {
  FlightJourney,
  FlightSegment,
  QuotationVersion,
  SightseeingDay,
} from '@/features/quotations/quotations.api';

interface PublicQuotation {
  company: {
    name: string;
    email: string;
    phone: string | null;
    website: string | null;
    address: string | null;
    primaryColor: string;
  };
  quotation: {
    quotationNumber: string;
    customerName: string;
    destinationSummary: string;
    travelStartDate: string | null;
    travelEndDate: string | null;
    adults: number;
    childrenWithBed: number;
    childrenWithoutBed: number;
    infants: number;
    rooms: number;
    validUntil: string | null;
    status: string;
  };
  version: QuotationVersion;
  heroImageUrl?: string | null;
  hotelPresentations?: Record<
    string,
    {
      imageUrl: string | null;
      starCategory: number | null;
      starRating: string | null;
      address: string | null;
      reviewLink: string | null;
      checkInTime: string | null;
      checkOutTime: string | null;
      destination: string;
      country: string;
    }
  >;
  vehiclePresentations?: Record<
    string,
    {
      imageUrl: string | null;
      name: string;
      vehicleType: string;
      capacity: number | null;
    }
  >;
  airlinePresentations?: Record<string, { name: string; logoUrl: string | null }> | undefined;
  sightseeingPresentations?: Record<string, { imageUrl: string | null }> | undefined;
  downloadUrl: string | null;
}
interface Envelope<T> {
  success: boolean;
  data?: T;
  error?: { message: string };
}
async function publicRequest<T>(path: string, method = 'GET', body?: unknown) {
  const response = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const payload = (await response.json()) as Envelope<T>;
  if (!response.ok || !payload.success || !payload.data)
    throw new Error(payload.error?.message || 'Request failed.');
  return payload.data;
}

const ADDON_SERVICE_TYPES = new Set([
  'TRAVEL_INSURANCE',
  'RAIL',
  'PASSPORT_ASSISTANCE',
  'MEAL',
  'GUIDE',
  'OTHER_ADD_ON',
  'GENERAL_ENQUIRY',
]);

/** Staff-authored rich text, defanged before it reaches the customer's browser. */
const sanitizeHtml = (html: string) =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/\son\w+="[^"]*"/gi, '')
    .replace(/\son\w+='[^']*'/gi, '')
    .replace(/javascript:/gi, '');

function RichHtml({ html }: { html: string }) {
  return (
    <div
      className="text-sm leading-relaxed text-slate-600 [&_a]:text-blue-600 [&_a]:underline [&_li]:mb-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mb-2 [&_ul]:list-disc [&_ul]:pl-5"
      dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }}
    />
  );
}

const dateShort = (value: string | null | undefined) =>
  value
    ? new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(
        new Date(value),
      )
    : null;

const publicHotelSectionTitle = (value: string | null | undefined) => {
  const title = value?.trim();
  return !title || title === 'Accommodation Details' ? 'Your Hotels' : title;
};

function Info({ label, value, full }: { label: string; value: string; full?: boolean }) {
  return (
    <div className={full ? 'sm:col-span-2' : ''}>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-0.5 font-semibold text-slate-800">{value || '—'}</p>
    </div>
  );
}

function SectionTitle({ children }: { children: string }) {
  return (
    <h2
      className="mb-4 border-l-4 pl-3 text-2xl font-bold text-slate-800"
      style={{ borderColor: '#16a34a' }}
    >
      {children}
    </h2>
  );
}

/** A single flight journey (outbound or return) rendered as timeline cards. */
function FlightJourneyView({
  title,
  journey,
  color,
  airlinePresentations,
}: {
  title: string;
  journey: FlightJourney;
  color: string;
  airlinePresentations?: Record<string, { name: string; logoUrl: string | null }> | undefined;
}) {
  const segments = (journey.segments ?? []).filter(
    (s) => s.airlineName || s.from || s.to || s.departureTime || s.flightNumber,
  );
  if (!segments.length) return null;
  const route = [journey.fromCity, journey.toCity].filter(Boolean).join(' → ');
  return (
    <section className="overflow-hidden rounded-xl border shadow-sm">
      <div
        className="flex flex-wrap items-center gap-2 px-5 py-3 font-semibold text-white"
        style={{ backgroundColor: color }}
      >
        <Plane className="h-5 w-5" /> {title}
        {route && <span className="text-sm font-normal opacity-90">{route}</span>}
      </div>
      <div className="space-y-4 p-4">
        {segments.map((s, i) => {
          const airline = s.airlineId ? airlinePresentations?.[s.airlineId] : undefined;
          const airlineName = s.airlineName || airline?.name || 'Airline';
          return (
            <div key={i} className="rounded-lg border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
                <div className="flex items-center gap-2">
                  <span
                    className="rounded px-2 py-0.5 text-xs font-semibold text-white"
                    style={{ backgroundColor: color }}
                  >
                    Segment {i + 1}
                  </span>
                  {airline?.logoUrl ? (
                    <img
                      src={airline.logoUrl}
                      alt={`${airlineName} logo`}
                      className="h-8 w-12 rounded bg-white object-contain"
                    />
                  ) : (
                    <Plane className="h-4 w-4" style={{ color }} />
                  )}
                  <strong className="text-slate-800">{airlineName}</strong>
                  {s.flightNumber && <span className="text-slate-500">{s.flightNumber}</span>}
                </div>
                {s.travelClass && (
                  <span className="text-sm font-medium text-slate-500">{s.travelClass} Class</span>
                )}
              </div>
              {i > 0 && s.connectionVia && (
                <p className="mt-2 text-xs text-slate-500">Connection via {s.connectionVia}</p>
              )}
              <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                <div className="text-left">
                  <div className="text-2xl font-bold" style={{ color }}>
                    {s.departureTime || '--:--'}
                  </div>
                  <div className="font-medium text-slate-700">{s.from || '—'}</div>
                  <div className="text-xs text-slate-400">{dateShort(s.departureDate) ?? ''}</div>
                </div>
                <div className="flex flex-col items-center px-1">
                  <div className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
                    <span className="h-px w-10 sm:w-24" style={{ backgroundColor: color }} />
                    <Plane className="h-4 w-4" style={{ color }} />
                    <span className="h-px w-10 sm:w-24" style={{ backgroundColor: color }} />
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
                  </div>
                  {s.duration && <div className="mt-1 text-xs text-slate-500">🕐 {s.duration}</div>}
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold" style={{ color }}>
                    {s.arrivalTime || '--:--'}
                  </div>
                  <div className="font-medium text-slate-700">{s.to || '—'}</div>
                  <div className="text-xs text-slate-400">{dateShort(s.arrivalDate) ?? ''}</div>
                </div>
              </div>
              {(s.cabinLuggage || s.checkInLuggage) && (
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3 text-xs text-slate-600">
                  <span className="font-semibold">🧳 Baggage:</span>
                  {s.cabinLuggage && (
                    <span className="rounded border px-2 py-0.5">Cabin: {s.cabinLuggage}</span>
                  )}
                  {s.checkInLuggage && (
                    <span className="rounded border px-2 py-0.5">Check-in: {s.checkInLuggage}</span>
                  )}
                </div>
              )}
              {s.notes && s.notes.replace(/<[^>]*>/g, '').trim() && (
                <div className="mt-3 border-t pt-3">
                  <p className="mb-1 flex items-center gap-1 text-xs font-semibold text-slate-600">
                    ℹ️ Notes:
                  </p>
                  <RichHtml html={s.notes} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

const SIGHTSEEING_TRANSFER_LABELS: Record<string, string> = {
  PRIVATE: 'Private Transfer',
  SHARED: 'Shared Transfer',
  NO_TRANSFER: 'No Transfer',
};
const SIGHTSEEING_MEAL_MODE_LABELS: Record<string, string> = {
  NO_TRANSFER: 'No Transfer',
  INCLUDE_AT_HOTEL: 'Hotel',
  WITH_TRANSFER: 'With Transfer',
};

/** Reference "Your Itinerary" — day-wise sightseeing activities. */
function SightseeingItineraryView({
  days,
  color,
  images,
}: {
  days: SightseeingDay[];
  color: string;
  images: Record<string, { imageUrl: string | null }>;
}) {
  const shown = days.filter(
    (day) => day.title || (day.activities ?? []).some((a) => a.name || a.description),
  );
  if (!shown.length) return null;
  const dayImage = (day: SightseeingDay) => {
    for (const activity of day.activities ?? []) {
      const url = activity.sightseeingId ? images[activity.sightseeingId]?.imageUrl : null;
      if (url) return url;
    }
    return null;
  };
  const mealLabel = (day: SightseeingDay) => {
    const list = [
      day.meals?.breakfast && 'Breakfast',
      day.meals?.lunch && 'Lunch',
      day.meals?.dinner && 'Dinner',
    ]
      .filter(Boolean)
      .join(', ');
    if (!list) return null;
    const mode = SIGHTSEEING_MEAL_MODE_LABELS[day.mealMode];
    return `${list}${mode ? ` (${mode})` : ''}`;
  };
  return (
    <section>
      <SectionTitle>Your Itinerary</SectionTitle>
      <div className="space-y-5">
        {shown.map((day, index) => {
          const image = dayImage(day);
          return (
          <article
            key={index}
            className="grid gap-6 rounded-2xl bg-card p-6 shadow-sm md:grid-cols-[minmax(0,320px)_1fr]"
          >
            {image ? (
              <img
                src={image}
                alt={day.title ?? 'Itinerary day'}
                className="h-56 w-full rounded-xl object-cover md:h-full"
              />
            ) : (
              <div className="hidden md:block" />
            )}
            <div>
            <h3 className="text-lg font-semibold text-slate-800">
              {day.title || `Day ${day.dayNumber}`}
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              {[day.city, dateShort(day.date)].filter(Boolean).join('  |  ')}
            </p>
            <div className="mt-4 rounded-xl bg-slate-50 p-4">
              <p className="font-semibold text-slate-700">Activities &amp; Details</p>
              <div className="mt-3 space-y-4">
                {(day.activities ?? [])
                  .filter((a) => a.name || a.description)
                  .map((activity, aIndex) => (
                    <div key={aIndex}>
                      <p className="flex items-center gap-2 font-semibold text-slate-800">
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        {activity.name}
                      </p>
                      {activity.description && (
                        <div className="mt-1">
                          <RichHtml html={activity.description} />
                        </div>
                      )}
                    </div>
                  ))}
              </div>
              <span
                className="mt-4 inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold text-white"
                style={{ backgroundColor: color }}
              >
                🚗 {SIGHTSEEING_TRANSFER_LABELS[day.dailyTransfer] ?? day.dailyTransfer}
              </span>
            </div>
            {mealLabel(day) && (
              <p className="mt-3 text-sm text-slate-700">
                <span className="font-semibold">🍽 Meals:</span> {mealLabel(day)}
              </p>
            )}
            </div>
          </article>
          );
        })}
      </div>
    </section>
  );
}

export function PublicQuotationPage() {
  const { token = '' } = useParams();
  const [data, setData] = useState<PublicQuotation | null>(null);
  const [error, setError] = useState('');
  const [decision, setDecision] = useState<'accept' | 'reject' | null>(null);
  const [name, setName] = useState('');
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState('');
  useEffect(() => {
    void publicRequest<PublicQuotation>(`/public/quotations/${encodeURIComponent(token)}`)
      .then((value) => {
        setData(value);
        setName(value.quotation.customerName);
      })
      .catch((value: unknown) =>
        setError(value instanceof Error ? value.message : 'Quotation unavailable.'),
      );
  }, [token]);
  if (error)
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
        <div className="max-w-md rounded-xl bg-card p-8 text-center shadow">
          <XCircle className="mx-auto h-10 w-10 text-red-600" />
          <h1 className="mt-3 text-xl font-semibold">Quotation unavailable</h1>
          <p className="mt-2 text-slate-500">{error}</p>
        </div>
      </main>
    );
  if (!data) return <div className="min-h-screen animate-pulse bg-slate-100" />;
  const q = data.quotation,
    v = data.version,
    company = data.company;
  const color = /^#[0-9a-f]{6}$/i.test(company.primaryColor) ? company.primaryColor : '#2563eb';

  const fmt = (value: number) =>
    new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: v.currency,
      maximumFractionDigits: 0,
    }).format(value);

  const selectedHotels = v.hotels.filter((hotel) => hotel.selected);
  const visibleHotels = selectedHotels.length > 0 ? selectedHotels : v.hotels;
  const hotelNights = visibleHotels.reduce((sum, hotel) => sum + Number(hotel.nights ?? 0), 0);
  const nights =
    q.travelStartDate && q.travelEndDate
      ? Math.max(
          0,
          Math.round(
            (new Date(q.travelEndDate).getTime() - new Date(q.travelStartDate).getTime()) /
              86_400_000,
          ),
        )
      : hotelNights;
  const duration = nights > 0 ? `${nights} Nights / ${nights + 1} Days` : null;

  const travelers = [
    q.adults && `${q.adults} Adult${q.adults > 1 ? 's' : ''}`,
    q.childrenWithBed && `${q.childrenWithBed} CWB`,
    q.childrenWithoutBed && `${q.childrenWithoutBed} CWOB`,
    q.infants && `${q.infants} Infant${q.infants > 1 ? 's' : ''}`,
  ]
    .filter(Boolean)
    .join(', ');

  const perPaxLines = (
    [
      [q.adults, 'Adults', v.perAdultPrice],
      [q.childrenWithBed, 'CWB', v.perChildWithBedPrice],
      [q.childrenWithoutBed, 'CWOB', v.perChildWithoutBedPrice],
      [q.infants, 'Infants', v.perInfantPrice],
    ] as const
  ).filter(([count, , price]) => Number(count) > 0 && Number(price ?? 0) > 0);

  const packageTotal =
    Number(v.perAdultPrice ?? 0) * q.adults +
    Number(v.perChildWithBedPrice ?? 0) * q.childrenWithBed +
    Number(v.perChildWithoutBedPrice ?? 0) * q.childrenWithoutBed +
    Number(v.perInfantPrice ?? 0) * q.infants;
  const finalTotal = packageTotal > 0 ? packageTotal : Number(v.finalAmount);
  const addonTotal = v.services
    .filter((service) => ADDON_SERVICE_TYPES.has(service.serviceType))
    .reduce(
      (sum, service) => sum + Number(service.unitSellingPrice ?? 0) * Number(service.quantity ?? 1),
      0,
    );
  const visaConsolidated =
    Number(v.visaServiceCharge ?? 0) +
    (Number(v.visaServiceCharge ?? 0) * Number(v.visaGstPercent ?? 0)) / 100 +
    Number(v.visaVfsCharge ?? 0);
  const showVisa =
    v.includeVisa &&
    (Number(v.visaAmount ?? 0) > 0 ||
      Number(v.visaServiceCharge ?? 0) > 0 ||
      Boolean(v.visaType) ||
      Boolean(v.visaDestination));

  const svcOf = (type: string) => v.services.filter((service) => service.serviceType === type);
  const cruises = svcOf('CRUISE');
  const vehicles = svcOf('VEHICLE_TRANSFER');
  const experiences = v.services.filter(
    (service) =>
      !ADDON_SERVICE_TYPES.has(service.serviceType) &&
      service.serviceType !== 'FLIGHT' &&
      service.serviceType !== 'CRUISE' &&
      service.serviceType !== 'VEHICLE_TRANSFER',
  );
  // Reference "Flight Details" — structured journeys from flightDetails.
  const fd = v.flightDetails;
  const flightJourneys =
    fd && fd.include
      ? ([
          (fd.journeyType === 'ROUND_TRIP' || fd.journeyType === 'ONEWAY_OUTBOUND') && {
            key: 'outbound',
            title: 'Outbound Journey',
            journey: fd.outbound,
            color: '#2563eb',
          },
          (fd.journeyType === 'ROUND_TRIP' || fd.journeyType === 'ONEWAY_RETURN') && {
            key: 'return',
            title: 'Return Journey',
            journey: fd.returnJourney,
            color: '#16a34a',
          },
        ].filter(Boolean) as Array<{
          key: string;
          title: string;
          journey: FlightJourney;
          color: string;
        }>)
      : [];
  const segmentHasData = (segment: FlightSegment) =>
    Boolean(
      segment.airlineName ||
      segment.from ||
      segment.to ||
      segment.departureTime ||
      segment.flightNumber,
    );
  const hasFlights = flightJourneys.some((leg) =>
    (leg.journey?.segments ?? []).some(segmentHasData),
  );
  const sightseeingDays =
    v.sightseeingDetails?.include !== false ? (v.sightseeingDetails?.days ?? []) : [];
  const badges = [
    hasFlights && 'Flights',
    v.hotels.length > 0 && 'Hotels',
    svcOf('SIGHTSEEING').length > 0 && 'Sightseeing',
    cruises.length > 0 && 'Cruise',
    vehicles.length > 0 && 'Transportation',
    showVisa && 'Visa',
  ].filter(Boolean) as string[];

  const preparedBy = v.createdBy?.fullName ?? '';
  const contactLine = [company.phone, company.email].filter(Boolean).join(' | ');
  const canRespond = !['ACCEPTED', 'REJECTED', 'EXPIRED'].includes(q.status) && !result;

  const decide = async () => {
    if (!decision) return;
    setBusy(true);
    try {
      await publicRequest(
        `/public/quotations/${encodeURIComponent(token)}/${decision}`,
        'POST',
        decision === 'accept'
          ? { customerName: name, confirmed: true, note: note || null }
          : { reason, note: note || null },
      );
      setResult(
        decision === 'accept'
          ? 'Your acceptance has been recorded. The travel team will contact you next.'
          : 'Your response has been recorded. The travel team may contact you to discuss alternatives.',
      );
      setDecision(null);
    } catch (value) {
      setError(value instanceof Error ? value.message : 'Unable to record response.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-100 pb-16">
      {/* Hero */}
      <header
        className="bg-slate-900 bg-cover bg-center px-6 py-20 text-white"
        style={
          data.heroImageUrl
            ? {
                backgroundImage: `linear-gradient(to right, rgba(15,23,42,0.78), rgba(15,23,42,0.35)), url(${data.heroImageUrl})`,
              }
            : { background: `linear-gradient(135deg, ${color} 0%, ${color}cc 60%, #0f172a 140%)` }
        }
      >
        <div className="mx-auto max-w-5xl">
          <h1 className="text-4xl font-bold sm:text-5xl">{q.destinationSummary}</h1>
          {duration && <p className="mt-2 text-lg text-white/80">{duration}</p>}
          <p className="mt-4 text-2xl font-semibold">{v.title}</p>
          {v.introduction && <p className="mt-2 max-w-2xl text-white/80">{v.introduction}</p>}
        </div>
      </header>

      <div className="mx-auto -mt-8 max-w-5xl space-y-6 px-4">
        {/* Summary + price */}
        <section className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-2xl bg-card p-6 shadow-lg lg:col-span-2">
            <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2 md:grid-cols-4">
              <Info label="Traveler Name" value={q.customerName} />
              <Info label="Travel Date" value={dateShort(q.travelStartDate) ?? 'Flexible'} />
              <Info label="Duration" value={duration ?? 'As advised'} />
              <Info label="Travelers" value={travelers} />
              <Info
                label="Rooms"
                value={q.rooms ? `${q.rooms} Room${q.rooms > 1 ? 's' : ''}` : '—'}
              />
              <Info label="Quotation ID" value={q.quotationNumber} />
              <Info label="Destinations" value={q.destinationSummary} full />
              {preparedBy && (
                <Info
                  label="Prepared By"
                  value={`${preparedBy}${contactLine ? ` · ${contactLine}` : ''}`}
                  full
                />
              )}
            </div>
          </div>
          <div className="flex flex-col justify-center rounded-2xl bg-emerald-600 p-6 text-white shadow-lg">
            <p className="text-center text-sm font-medium uppercase tracking-wide text-white/85">
              Total Package Price
            </p>
            {v.hidePricing ? (
              <p className="mt-3 text-center text-lg font-medium">
                Pricing shared separately by the travel team.
              </p>
            ) : (
              <>
                <p className="mt-1 text-center text-4xl font-bold">{fmt(finalTotal)}</p>
                <p className="mt-1 text-center text-xs italic text-white/80">
                  {v.taxNote || 'Inclusive of all taxes'}
                </p>
                {perPaxLines.length > 0 && (
                  <div className="mt-3 space-y-1 text-center text-sm text-white/90">
                    {perPaxLines.map(([count, label, price]) => (
                      <p key={label}>
                        {count} {label} × {fmt(Number(price ?? 0))}
                      </p>
                    ))}
                  </div>
                )}
                {addonTotal > 0 && (
                  <p className="mt-2 text-center text-xs text-white/80">
                    + {fmt(addonTotal)} add-ons (optional)
                  </p>
                )}
              </>
            )}
            {company.phone && (
              <a
                href={`tel:${company.phone}`}
                className="mt-4 flex items-center justify-center gap-2 rounded-lg bg-white px-4 py-2.5 font-semibold text-slate-800 hover:bg-slate-50"
              >
                <Phone className="h-4 w-4" /> Contact Now
              </a>
            )}
          </div>
        </section>

        {/* Services Include */}
        {badges.length > 0 && (
          <section className="rounded-2xl bg-card p-6 shadow-sm">
            <h2 className="font-semibold text-slate-800">Services Include</h2>
            <div className="mt-4 flex flex-wrap gap-3">
              {badges.map((badge) => (
                <span
                  key={badge}
                  className="flex items-center gap-2 rounded-full bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700"
                >
                  <CheckCircle2 className="h-4 w-4" /> {badge}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* Itinerary */}
        {v.itinerary.length > 0 && (
          <section>
            <SectionTitle>Your Itinerary</SectionTitle>
            <div className="space-y-4">
              {v.itinerary.map((day) => (
                <article key={day.id} className="rounded-2xl bg-card p-6 shadow-sm">
                  <div className="flex flex-wrap items-baseline justify-between gap-2 border-b pb-3">
                    <h3 className="text-lg font-semibold text-slate-800">
                      Day {day.dayNumber}: {day.title}
                    </h3>
                    <p className="text-sm font-medium" style={{ color }}>
                      {day.destination}
                      {dateShort(day.date) ? ` · ${dateShort(day.date)}` : ''}
                    </p>
                  </div>
                  <p className="mt-3 text-sm font-semibold text-slate-700">
                    Activities &amp; Details
                  </p>
                  <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-600">
                    {day.description}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                    {day.transfers && <span>🚗 {day.transfers}</span>}
                    {day.meals && <span>🍽 Meals: {day.meals}</span>}
                    {day.overnightLocation && <span>🏨 Overnight: {day.overnightLocation}</span>}
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        {/* Hotels */}
        {visibleHotels.length > 0 && (
          <section>
            <SectionTitle>{publicHotelSectionTitle(v.hotelDetails?.sectionTitle)}</SectionTitle>
            <div className="grid gap-4 md:grid-cols-2">
              {visibleHotels.map((hotel, hotelIndex) => {
                const presentation = data.hotelPresentations?.[hotel.id];
                const category =
                  presentation?.starCategory ?? Number(hotel.category?.match(/\d+/)?.[0] ?? 0);
                return (
                  <article
                    key={hotel.id}
                    className="overflow-hidden rounded-xl border bg-card shadow-sm sm:grid sm:grid-cols-[42%_1fr]"
                  >
                    <div className="flex min-h-52 items-center justify-center bg-slate-100">
                      {presentation?.imageUrl ? (
                        <img
                          src={presentation.imageUrl}
                          alt={hotel.hotelName}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="text-center text-slate-400">
                          <Building2 className="mx-auto h-12 w-12" />
                          <p className="mt-2 text-xs">Hotel image unavailable</p>
                        </div>
                      )}
                    </div>
                    <div className="p-5">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="text-lg font-bold leading-tight text-slate-800">
                          {hotel.hotelName}
                        </h3>
                        {presentation?.reviewLink && (
                          <a
                            href={presentation.reviewLink}
                            target="_blank"
                            rel="noreferrer"
                            className="shrink-0 text-xs font-medium text-blue-600 hover:underline"
                          >
                            Review <ExternalLink className="inline h-3 w-3" />
                          </a>
                        )}
                      </div>
                      {category > 0 && (
                        <div className="mt-2 flex gap-0.5" aria-label={`${category} star hotel`}>
                          {Array.from({ length: Math.min(5, category) }, (_, index) => (
                            <Star key={index} className="h-4 w-4 fill-amber-400 text-amber-400" />
                          ))}
                        </div>
                      )}
                      {presentation?.starRating && (
                        <span className="mt-2 inline-block rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                          {presentation.starRating}/5
                        </span>
                      )}
                      <p className="mt-3 flex items-start gap-1.5 text-sm text-slate-500">
                        <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
                        {hotel.city}
                        {presentation?.country ? `, ${presentation.country}` : ''}
                      </p>
                      <div className="mt-5 space-y-1.5 text-sm text-slate-700">
                        <p>
                          <strong>Room Type:</strong> {hotel.roomType || 'As selected'}
                        </p>
                        <p>
                          <strong>Meal Plan:</strong> {hotel.mealPlan || 'As selected'}
                        </p>
                        <p>
                          <strong>Nights:</strong>{' '}
                          <span className="rounded bg-emerald-600 px-2 py-0.5 font-semibold text-white">
                            {hotel.nights}
                          </span>
                        </p>
                      </div>
                      <div className="mt-4 space-y-1 text-xs text-slate-500">
                        <p>
                          Check-in: {dateShort(hotel.checkInDate) ?? '—'} |{' '}
                          {presentation?.checkInTime ?? '14:00'}
                        </p>
                        <p>
                          Check-out: {dateShort(hotel.checkOutDate) ?? '—'} |{' '}
                          {presentation?.checkOutTime ?? '12:00'}
                        </p>
                      </div>
                      {hotel.notes && (
                        <p className="mt-3 text-xs italic text-slate-500">{hotel.notes}</p>
                      )}
                      {hotelIndex === 0 && v.hotelDetails?.description && (
                        <div
                          className="mt-4 flex items-start gap-2 border-t pt-3"
                          aria-label="Hotel description"
                        >
                          <InfoIcon className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                          <div className="min-w-0 flex-1 [&_p]:mr-4 [&_p]:inline-block">
                            <RichHtml html={v.hotelDetails.description} />
                          </div>
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        )}

        {/* Flight Details — structured journeys/segments. */}
        {hasFlights && (
          <section>
            <SectionTitle>Flight Details</SectionTitle>
            <div className="space-y-4">
              {flightJourneys.map((leg) => (
                <FlightJourneyView
                  key={leg.key}
                  title={leg.title}
                  journey={leg.journey}
                  color={leg.color}
                  airlinePresentations={data.airlinePresentations}
                />
              ))}
            </div>
          </section>
        )}

        {/* Your Itinerary — day-wise sightseeing activities. */}
        {sightseeingDays.length > 0 && (
          <SightseeingItineraryView
            days={sightseeingDays}
            color="#16a34a"
            images={data.sightseeingPresentations ?? {}}
          />
        )}

        {/* Transportation — one reference-style card per configured vehicle. */}
        {vehicles.length > 0 && (
          <section>
            <SectionTitle>{vehicles[0]?.taxCategory?.trim() || 'Transportation'}</SectionTitle>
            <div className="grid gap-4 md:grid-cols-2">
              {vehicles.map((vehicle) => {
                const presentation = data.vehiclePresentations?.[vehicle.id];
                return (
                  <article
                    key={vehicle.id}
                    className="max-w-xl overflow-hidden rounded-xl border bg-card shadow-sm"
                  >
                    <div className="flex min-h-56 items-center justify-center bg-slate-100">
                      {presentation?.imageUrl ? (
                        <img
                          src={presentation.imageUrl}
                          alt={vehicle.name}
                          className="h-64 w-full object-cover"
                        />
                      ) : (
                        <div className="text-center text-slate-400">
                          <CarFront className="mx-auto h-14 w-14" />
                          <p className="mt-2 text-xs">Vehicle image unavailable</p>
                        </div>
                      )}
                    </div>
                    <div className="space-y-3 p-5">
                      <h3 className="text-xl font-bold text-slate-800">
                        {vehicle.name || presentation?.name || 'Vehicle'}
                      </h3>
                      <div className="space-y-1 text-sm text-slate-600">
                        <p>
                          <strong className="text-slate-700">Type:</strong>{' '}
                          {vehicle.city || presentation?.vehicleType || 'As selected'}
                        </p>
                        {vehicle.notes && (
                          <p>
                            <strong className="text-slate-700">Usage:</strong> {vehicle.notes}
                          </p>
                        )}
                      </div>
                      {vehicle.description && <RichHtml html={vehicle.description} />}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        )}

        {cruises.length > 0 && (
          <section className="rounded-2xl bg-card p-6 shadow-sm">
            <h2 className="flex items-center gap-2 font-semibold text-slate-800">
              <Ship className="h-5 w-5" style={{ color }} /> Cruise Details
            </h2>
            <div className="mt-3 space-y-3">
              {cruises.map((cruise) => (
                <div key={cruise.id} className="border-b pb-2 last:border-0">
                  <strong className="text-slate-800">{cruise.name}</strong>
                  {cruise.description && (
                    <p className="text-sm text-slate-600">{cruise.description}</p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}
        {experiences.length > 0 && (
          <section className="rounded-2xl bg-card p-6 shadow-sm">
            <h2 className="font-semibold text-slate-800">Services &amp; Experiences</h2>
            <div className="mt-3 space-y-3">
              {experiences.map((service) => (
                <div key={service.id} className="border-b pb-2 last:border-0">
                  <strong className="text-slate-800">{service.name}</strong>
                  {service.description && (
                    <p className="text-sm text-slate-600">{service.description}</p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Visa */}
        {showVisa && (
          <section className="rounded-2xl bg-card p-6 shadow-sm">
            <h2 className="font-semibold text-slate-800">{v.visaSectionTitle || 'Visa'}</h2>
            <div className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
              {v.visaDestination && (
                <p>
                  <span className="text-slate-400">Destination:</span> {v.visaDestination}
                </p>
              )}
              {v.visaType && (
                <p>
                  <span className="text-slate-400">Visa type:</span> {v.visaType}
                </p>
              )}
              {Number(v.visaAmount ?? 0) > 0 && (
                <p>
                  <span className="text-slate-400">Amount:</span> {fmt(Number(v.visaAmount))}
                </p>
              )}
              {(Number(v.visaServiceCharge ?? 0) > 0 || Number(v.visaVfsCharge ?? 0) > 0) && (
                <p>
                  <span className="text-slate-400">Consolidated total:</span>{' '}
                  {fmt(visaConsolidated)}
                </p>
              )}
            </div>
          </section>
        )}

        {/* Policies */}
        {(v.inclusionsHtml ||
          v.inclusions.length > 0 ||
          v.exclusionsHtml ||
          v.exclusions.length > 0 ||
          v.paymentPolicies ||
          v.cancellationPolicies ||
          v.bookingTerms ||
          v.terms.length > 0) && (
          <section>
            <SectionTitle>Policies</SectionTitle>
            <div className="grid gap-4 md:grid-cols-2">
              {(
                [
                  ['Inclusions', v.inclusionsHtml, v.inclusions],
                  ['Exclusions', v.exclusionsHtml, v.exclusions],
                  ['Payment Policies', v.paymentPolicies, null],
                  ['Cancellation Policies', v.cancellationPolicies, null],
                  ['Booking Terms', v.bookingTerms, v.terms],
                ] as const
              ).map(([label, html, rows]) =>
                html || (rows && rows.length) ? (
                  <section key={label} className="rounded-2xl bg-card p-6 shadow-sm">
                    <h3 className="mb-2 font-semibold text-slate-800">{label}</h3>
                    {html ? (
                      <RichHtml html={html} />
                    ) : (
                      <ul className="space-y-1.5 text-sm text-slate-600">
                        {(rows ?? []).map((row) => (
                          <li key={row.id}>• {row.content}</li>
                        ))}
                      </ul>
                    )}
                  </section>
                ) : null,
              )}
            </div>
          </section>
        )}

        {/* Contact Us */}
        <section className="rounded-2xl bg-card p-6 text-center shadow-sm">
          <h2 className="text-xl font-bold text-slate-800">Contact Us</h2>
          <p className="mt-1 text-sm text-slate-500">
            Ready to book this journey or have questions? Get in touch for more information.
          </p>
          <p className="mt-4 text-lg font-semibold text-slate-800">{company.name}</p>
          {preparedBy && <p className="text-slate-600">{preparedBy}</p>}
          {company.phone && <p className="text-slate-600">{company.phone}</p>}
          {company.email && <p className="text-slate-600">{company.email}</p>}
          {company.address && <p className="mt-1 text-sm text-slate-500">{company.address}</p>}
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {company.phone && (
              <a href={`tel:${company.phone}`}>
                <Button variant="secondary">
                  <Phone className="h-4 w-4" /> Call Now
                </Button>
              </a>
            )}
            {company.phone && (
              <a
                href={`https://wa.me/${company.phone.replace(/[^0-9]/g, '')}`}
                target="_blank"
                rel="noreferrer"
              >
                <Button variant="secondary">
                  <MessageCircle className="h-4 w-4" /> WhatsApp
                </Button>
              </a>
            )}
            {company.email && (
              <a href={`mailto:${company.email}`}>
                <Button variant="secondary">
                  <Mail className="h-4 w-4" /> Email
                </Button>
              </a>
            )}
          </div>
        </section>

        {/* Decision + download */}
        <section className="rounded-2xl bg-panel p-6 text-panel-foreground shadow-lg">
          <div className="flex flex-wrap items-center justify-between gap-5">
            <div>
              {!v.hidePricing && (
                <>
                  <p className="text-sm text-panel-foreground/70">Final quotation amount</p>
                  <p className="mt-1 text-4xl font-semibold">{fmt(finalTotal)}</p>
                </>
              )}
              <p className="mt-2 text-sm text-panel-foreground/60">
                Valid until{' '}
                {q.validUntil ? new Date(q.validUntil).toLocaleDateString() : 'as advised'}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {data.downloadUrl && (
                <a href={data.downloadUrl}>
                  <Button variant="secondary">
                    <Download className="h-4 w-4" />
                    Download PDF
                  </Button>
                </a>
              )}
              {canRespond && (
                <>
                  <Button onClick={() => setDecision('accept')}>
                    <CheckCircle2 className="h-4 w-4" />
                    Accept
                  </Button>
                  <Button variant="danger" onClick={() => setDecision('reject')}>
                    <XCircle className="h-4 w-4" />
                    Reject
                  </Button>
                </>
              )}
            </div>
          </div>
          {result && (
            <p className="mt-5 rounded-lg bg-emerald-500/20 p-4 text-panel-foreground">{result}</p>
          )}
        </section>

        <footer className="pt-2 text-center text-xs text-slate-500">
          <p>
            © {new Date().getFullYear()} {company.name}. All rights reserved.
          </p>
          <p className="mt-1">
            Quotation ID: {q.quotationNumber} · Generated {dateShort(new Date().toISOString())}
          </p>
        </footer>
      </div>

      {decision && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div role="dialog" aria-modal="true" className="w-full max-w-md rounded-xl bg-card p-6">
            <h2 className="text-lg font-semibold">
              {decision === 'accept' ? 'Accept quotation' : 'Reject quotation'}
            </h2>
            <div className="mt-4 space-y-3">
              {decision === 'accept' ? (
                <label className="block text-sm font-medium">
                  Your name
                  <input
                    className="mt-1 w-full rounded-lg border px-3 py-2"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                  />
                </label>
              ) : (
                <label className="block text-sm font-medium">
                  Reason
                  <textarea
                    className="mt-1 w-full rounded-lg border px-3 py-2"
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                  />
                </label>
              )}
              <label className="block text-sm font-medium">
                Optional note
                <textarea
                  className="mt-1 w-full rounded-lg border px-3 py-2"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                />
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setDecision(null)}>
                Cancel
              </Button>
              <Button
                variant={decision === 'reject' ? 'danger' : 'primary'}
                disabled={decision === 'accept' ? !name : !reason}
                isLoading={busy}
                onClick={decide}
              >
                Confirm {decision}
              </Button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
