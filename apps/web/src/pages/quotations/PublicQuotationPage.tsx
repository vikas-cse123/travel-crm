import { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Download,
  Mail,
  MessageCircle,
  Phone,
  Ship,
  Plane,
  XCircle,
} from 'lucide-react';
import { useParams } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import type { QuotationVersion } from '@/features/quotations/quotations.api';

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

function Info({ label, value, full }: { label: string; value: string; full?: boolean }) {
  return (
    <div className={full ? 'sm:col-span-2' : ''}>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-0.5 font-semibold text-slate-800">{value || '—'}</p>
    </div>
  );
}

function SectionTitle({ children }: { children: string }) {
  return <h2 className="mb-4 text-2xl font-bold text-slate-800">{children}</h2>;
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

  const hotelNights = v.hotels.reduce((sum, hotel) => sum + Number(hotel.nights ?? 0), 0);
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
  const flights = svcOf('FLIGHT');
  const cruises = svcOf('CRUISE');
  const experiences = v.services.filter(
    (service) =>
      !ADDON_SERVICE_TYPES.has(service.serviceType) &&
      service.serviceType !== 'FLIGHT' &&
      service.serviceType !== 'CRUISE',
  );
  const badges = [
    flights.length > 0 && 'Flights',
    v.hotels.length > 0 && 'Hotels',
    svcOf('SIGHTSEEING').length > 0 && 'Sightseeing',
    cruises.length > 0 && 'Cruise',
    svcOf('VEHICLE_TRANSFER').length > 0 && 'Transfers',
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
              <Info label="Rooms" value={q.rooms ? `${q.rooms} Room${q.rooms > 1 ? 's' : ''}` : '—'} />
              <Info label="Quotation ID" value={q.quotationNumber} />
              <Info label="Destinations" value={q.destinationSummary} full />
              {preparedBy && <Info label="Prepared By" value={`${preparedBy}${contactLine ? ` · ${contactLine}` : ''}`} full />}
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
                  <p className="mt-3 text-sm font-semibold text-slate-700">Activities &amp; Details</p>
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
        {v.hotels.length > 0 && (
          <section>
            <SectionTitle>Your Hotels</SectionTitle>
            <div className="grid gap-4 md:grid-cols-2">
              {v.hotels.map((hotel) => (
                <article key={hotel.id} className="rounded-2xl bg-card p-6 shadow-sm">
                  <h3 className="text-lg font-semibold text-slate-800">{hotel.hotelName}</h3>
                  <p className="text-sm text-slate-500">
                    {hotel.city}
                    {hotel.category ? ` · ${hotel.category}` : ''}
                  </p>
                  <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <dt className="text-xs uppercase text-slate-400">Room Type</dt>
                      <dd className="font-medium text-slate-700">{hotel.roomType || '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase text-slate-400">Meal Plan</dt>
                      <dd className="font-medium text-slate-700">{hotel.mealPlan || '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase text-slate-400">Nights</dt>
                      <dd className="font-medium text-slate-700">{hotel.nights}</dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase text-slate-400">Check-in / out</dt>
                      <dd className="font-medium text-slate-700">
                        {dateShort(hotel.checkInDate) ?? '—'} → {dateShort(hotel.checkOutDate) ?? '—'}
                      </dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>
          </section>
        )}

        {/* Flight & Cruise details */}
        {flights.length > 0 && (
          <section className="rounded-2xl bg-card p-6 shadow-sm">
            <h2 className="flex items-center gap-2 font-semibold text-slate-800">
              <Plane className="h-5 w-5" style={{ color }} /> Flight Details
            </h2>
            <div className="mt-3 space-y-3">
              {flights.map((flight) => (
                <div key={flight.id} className="border-b pb-2 last:border-0">
                  <strong className="text-slate-800">{flight.name}</strong>
                  {flight.description && (
                    <p className="text-sm text-slate-600">{flight.description}</p>
                  )}
                </div>
              ))}
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
                  <span className="text-slate-400">Consolidated total:</span> {fmt(visaConsolidated)}
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
