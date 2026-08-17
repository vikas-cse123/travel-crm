import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Ban,
  Building2,
  CalendarDays,
  Car,
  CarFront,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Compass,
  CreditCard,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Info as InfoIcon,
  Lock,
  MapPin,
  Phone,
  Ship,
  Plane,
  Star,
  Utensils,
  XCircle,
} from 'lucide-react';
import { useParams } from 'react-router-dom';
import {
  cabinLuggageLabel,
  formatItineraryDayTitle,
  hotelStayNights,
  isPublicTaxNote,
  resolveItineraryDayImage,
  stripItineraryDayPrefixes,
} from '@interscale/shared';
import { useFavicon } from '@/hooks/useFavicon';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { formatTime12Hour } from '@/utils/dateTime';
import type {
  FlightJourney,
  FlightSegment,
  QuotationVersion,
  SightseeingDay,
} from '@/features/quotations/quotations.api';
import { PublicQuotationContact } from './PublicQuotationContact';
import { PublicQuotationFooter } from './PublicQuotationFooter';
import { serviceCardIcon, type ServiceCard } from './serviceCards';
import { formatPublicQuotationNumber } from './quotationContact';

interface PublicQuotation {
  company: {
    name: string;
    email: string;
    phone: string | null;
    website: string | null;
    address: string | null;
    primaryColor: string;
    operatingSince?: number | null;
    tripsSold?: number | null;
    tan?: string | null;
    taxRegistrationNumber?: string | null;
    logoUrl?: string | null;
  };
  quotation: {
    quotationNumber: string;
    customerName: string;
    destinationSummary: string;
    /** Destination/Master-country names (e.g. "Malaysia"), joined with " → ". */
    destinations?: string;
    /** Sum of nights from every destination row on the source lead. */
    durationNights?: number | null;
    travelStartDate: string | null;
    travelEndDate: string | null;
    adults: number;
    childrenWithBed: number;
    childrenWithoutBed: number;
    infants: number;
    rooms: number;
    createdAt?: string | null;
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
  flightImageUrl?: string | null;
  flightImages?: Array<{ description?: string | null; url: string }>;
  sightseeingPresentations?: Record<string, { imageUrl: string | null }> | undefined;
  sightseeingDocumentPresentations?: Record<string, { imageUrl: string | null }> | undefined;
  cruisePresentations?: Record<
    string,
    { imageUrl: string | null; name: string | null; roomTypeName: string | null }
  >;
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
  if (!response.ok) throw new Error('Quotation unavailable. Please try again later.');
  // Protect against non-JSON responses (e.g. an HTML fallback served instead of
  // the API) so customers never see a raw parser error.
  const contentType = response.headers?.get?.('Content-Type') ?? '';
  if (contentType && !contentType.includes('json'))
    throw new Error('Quotation unavailable. Please try again later.');
  let payload: Envelope<T>;
  try {
    payload = (await response.json()) as Envelope<T>;
  } catch {
    throw new Error('Quotation unavailable. Please try again later.');
  }
  if (!payload.success || !payload.data)
    throw new Error(payload.error?.message || 'Quotation unavailable.');
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

/** True when rich-text HTML contains visible content (editor-empty markup excluded). */
const hasPolicyHtml = (html?: string | null): boolean =>
  Boolean(html && html.replace(/<[^>]*>/g, '').trim());

interface PolicySection {
  key: string;
  label: string;
  Icon: typeof CheckCircle2;
  iconClass: string;
  html?: string | null;
  rows: Array<{ id: string; content: string }>;
  visible: boolean;
}

const buildPolicySections = (version: QuotationVersion): PolicySection[] => {
  const sections: PolicySection[] = [
    {
      key: 'inclusions',
      label: 'Inclusions',
      Icon: CheckCircle2,
      iconClass: 'text-emerald-600',
      html: version.inclusionsHtml,
      rows: version.inclusions ?? [],
      visible: false,
    },
    {
      key: 'exclusions',
      label: 'Exclusions',
      Icon: XCircle,
      iconClass: 'text-red-600',
      html: version.exclusionsHtml,
      rows: version.exclusions ?? [],
      visible: false,
    },
    {
      key: 'payment',
      label: 'Payment Policies',
      Icon: CreditCard,
      iconClass: 'text-amber-500',
      html: version.paymentPolicies,
      rows: [],
      visible: false,
    },
    {
      key: 'cancellation',
      label: 'Cancellation Policies',
      Icon: Ban,
      iconClass: 'text-red-600',
      html: version.cancellationPolicies,
      rows: [],
      visible: false,
    },
    {
      key: 'booking',
      label: 'Booking Terms',
      Icon: FileText,
      iconClass: 'text-slate-500',
      html: version.bookingTerms,
      rows: version.terms ?? [],
      visible: false,
    },
  ];
  for (const section of sections)
    section.visible = hasPolicyHtml(section.html) || section.rows.length > 0;
  return sections;
};
const publicHotelSectionTitle = (value: string | null | undefined) => {
  const title = value?.trim();
  return !title || title === 'Accommodation Details' ? 'Your Hotels' : title;
};

const publicHeroIntroduction = (value: string | null | undefined) =>
  (value ?? '').replace(/A travel proposal prepared for [^.]*\./g, '').trim();

function Info({ label, value, full }: { label: string; value: string; full?: boolean }) {
  return (
    <div className={full ? 'sm:col-span-2' : ''}>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-0.5 font-semibold text-slate-800">{value || '—'}</p>
    </div>
  );
}

/** Stable anchor id derived from a section's title. */
const sectionAnchorId = (title: string) =>
  `section-${title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')}`;

function SectionTitle({ children }: { children: string }) {
  return (
    <h2
      id={sectionAnchorId(children)}
      data-section-title={children}
      className="mb-4 scroll-mt-24 border-l-4 pl-3 text-2xl font-bold text-slate-800"
      style={{ borderColor: '#16a34a' }}
    >
      {children}
    </h2>
  );
}

/**
 * "Quick Navigation" index shown near the top of the public quotation. It reads
 * the rendered section headings from the DOM (every SectionTitle carries a
 * data-section-title), so it always reflects exactly the sections that are
 * present for this quotation, and smooth-scrolls to one on click.
 */
function SectionNav({ sticky }: { sticky: boolean }) {
  const [sections, setSections] = useState<Array<{ id: string; label: string }>>([]);
  const [activeId, setActiveId] = useState<string>('');

  useEffect(() => {
    const collect = () => {
      const nodes = Array.from(document.querySelectorAll<HTMLElement>('[data-section-title]'));
      setSections(
        nodes
          .filter((node) => node.id)
          .map((node) => ({
            id: node.id,
            label: node.dataset.sectionTitle ?? node.textContent ?? '',
          })),
      );
    };
    collect();
    // Re-read once more after paint in case a section renders asynchronously
    // (e.g. once its images resolve).
    const timer = window.setTimeout(collect, 400);
    return () => window.clearTimeout(timer);
  }, []);

  // Scroll-spy: mark the chip for whichever section heading is currently near
  // the top of the viewport (just below the sticky bar). The active id only
  // changes when a heading enters the trigger band, so it persists smoothly
  // between headings instead of flickering to empty.
  useEffect(() => {
    const nodes = sections
      .map((section) => document.getElementById(section.id))
      .filter((node): node is HTMLElement => Boolean(node));
    if (!nodes.length) return;
    if (typeof IntersectionObserver === 'undefined') {
      setActiveId((current) => current || (nodes[0]?.id ?? ''));
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        const entered = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (entered[0]) setActiveId(entered[0].target.id);
      },
      // A thin band ~90px below the top (clearing the sticky nav).
      { rootMargin: '-90px 0px -75% 0px', threshold: 0 },
    );
    nodes.forEach((node) => observer.observe(node));
    // Default to the first section before any scroll happens.
    setActiveId((current) => current || (nodes[0]?.id ?? ''));
    return () => observer.disconnect();
  }, [sections]);

  // Keep the active chip centred within the horizontally scrollable bar (only
  // the bar scrolls, never the page), so it stays visible when chips overflow.
  const barRef = useRef<HTMLDivElement | null>(null);
  const chipRefs = useRef(new Map<string, HTMLButtonElement>());
  useEffect(() => {
    const bar = barRef.current;
    const chip = activeId ? chipRefs.current.get(activeId) : null;
    if (!bar || !chip) return;
    const target = chip.offsetLeft - bar.clientWidth / 2 + chip.clientWidth / 2;
    if (typeof bar.scrollTo === 'function') {
      bar.scrollTo({ left: Math.max(0, target), behavior: 'smooth' });
    }
  }, [activeId]);

  if (sections.length < 2) return null;

  const goTo = (id: string) => {
    setActiveId(id);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <nav
      aria-label="Quotation sections"
      className={`${
        sticky ? 'sticky top-3 z-30' : ''
      } rounded-full border border-slate-200 bg-card/90 p-1.5 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-card/70`}
    >
      <div className="flex items-center gap-1">
        <span className="ml-2 mr-1 flex shrink-0 items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
          <Compass className="h-4 w-4 text-emerald-600" aria-hidden="true" />
          <span className="hidden sm:inline">Jump to</span>
        </span>
        <div
          ref={barRef}
          className="flex flex-1 gap-1 overflow-x-auto scroll-smooth [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {sections.map((section) => {
            const active = section.id === activeId;
            return (
              <button
                key={section.id}
                ref={(el) => {
                  if (el) chipRefs.current.set(section.id, el);
                  else chipRefs.current.delete(section.id);
                }}
                type="button"
                onClick={() => goTo(section.id)}
                aria-current={active ? 'true' : undefined}
                className={`shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium transition-all ${
                  active
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {section.label}
              </button>
            );
          })}
        </div>
      </div>
    </nav>
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
                    {formatTime12Hour(s.departureTime, '--:--')}
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
                    {formatTime12Hour(s.arrivalTime, '--:--')}
                  </div>
                  <div className="font-medium text-slate-700">{s.to || '—'}</div>
                  <div className="text-xs text-slate-400">{dateShort(s.arrivalDate) ?? ''}</div>
                </div>
              </div>
              {(s.cabinLuggage || s.checkInLuggage) && (
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3 text-xs text-slate-600">
                  <span className="font-semibold">🧳 Baggage:</span>
                  {s.cabinLuggage && (
                    <span className="rounded border px-2 py-0.5">
                      Cabin: {cabinLuggageLabel(s.cabinLuggage)}
                    </span>
                  )}
                  {s.checkInLuggage && (
                    <span className="rounded border px-2 py-0.5">Check-in: {s.checkInLuggage}</span>
                  )}
                </div>
              )}
              {s.notes && s.notes.replace(/<[^>]*>/g, '').trim() && (
                <div className="flight-notes mt-3 border-t pt-3">
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

function FlightImageViewer({
  images,
}: {
  images: Array<{ description?: string | null; url: string }>;
}) {
  if (!images.length) return null;

  return (
    <div className="mx-auto grid max-w-4xl items-start gap-5">
      {images.map((image, index) => {
        const description = image.description?.trim() || '';
        const accessibleTitle = description || 'flight document';
        return (
          <figure
            key={`${image.url}-${index}`}
            className="group w-full self-start overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg ring-1 ring-slate-900/5"
          >
            <a
              href={image.url}
              target="_blank"
              rel="noreferrer"
              aria-label={`View ${accessibleTitle}`}
              className="block w-full bg-slate-50"
            >
              <img
                src={image.url}
                alt={description}
                loading="lazy"
                className="block h-auto w-full"
              />
            </a>
            <figcaption
              className={`flex min-h-16 items-center gap-3 border-t border-slate-200 bg-white px-3.5 py-3 ${description ? 'justify-between' : 'justify-end'}`}
            >
              {description && (
                <p className="min-w-0 text-sm leading-relaxed text-slate-700">{description}</p>
              )}
              <a
                href={image.url}
                target="_blank"
                rel="noreferrer"
                aria-label={`Preview ${accessibleTitle}`}
                className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900"
              >
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
                Preview
              </a>
            </figcaption>
          </figure>
        );
      })}
    </div>
  );
}

const SIGHTSEEING_TRANSFER_LABELS: Record<string, string> = {
  PRIVATE: 'Private Transfer',
  SHARED: 'Shared Transfer',
  NO_TRANSFER: 'No Transfer',
};

type AnyRecord = Record<string, unknown>;

const TRANSFER_CANONICAL: Record<string, string> = {
  PRIVATE: 'PRIVATE',
  PRIVATE_TRANSFER: 'PRIVATE',
  SHARED: 'SHARED',
  SHARED_TRANSFER: 'SHARED',
  NO_TRANSFER: 'NO_TRANSFER',
  NONE: 'NO_TRANSFER',
};

/** Normalize the many historical sightseeing snapshot shapes into one view model. */
/** Normalize legacy meal-mode variants ("NO TRANSFER", "no_transfer", "hotel", …). */
function normalizeSightseeingMealMode(value: unknown): string | null {
  const raw = String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[\s_./-]+/g, '');
  if (raw === 'NOTRANSFER' || raw === 'NONE') return 'NO_TRANSFER';
  if (raw === 'INCLUDEATHOTEL' || raw === 'HOTEL' || raw === 'INHOTEL') return 'INCLUDE_AT_HOTEL';
  if (raw === 'WITHTRANSFER') return 'WITH_TRANSFER';
  return null;
}

/**
 * Keep only pricing rows that are safe to show a customer: a real label and a
 * real, finite, non-negative number. Anything else — a legacy activity with no
 * `pricingOptions`, a half-filled row, a stray `0`-priced blank — collapses to
 * an empty list, which renders nothing at all.
 */
function normalizeActivityPricing(raw: unknown): Array<{ label: string; price: number }> {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    const row = (entry ?? {}) as AnyRecord;
    const label = String(row.label ?? '').trim();
    if (!label || row.price == null || row.price === '') return [];
    const price = Number(row.price);
    if (!Number.isFinite(price) || price < 0) return [];
    return [{ label, price }];
  });
}

/**
 * Per-activity price list. Renders nothing — no heading, no spacing — when the
 * activity carries no usable prices, so an unpriced activity looks exactly as
 * it did before this feature existed.
 */
function ActivityPricing({
  rows,
  fmt,
}: {
  rows: Array<{ label: string; price: number }>;
  fmt: (value: number) => string;
}) {
  if (!rows.length) return null;
  return (
    <div className="mt-4 border-t border-slate-100 pt-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Pricing</p>
      <dl className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map((row, index) => (
          <div
            key={`${row.label}-${index}`}
            className="min-w-0 rounded-md border border-slate-200 bg-slate-50 px-3 py-2"
          >
            <dt className="break-words text-xs font-medium leading-4 text-slate-500">
              {row.label}
            </dt>
            <dd className="mt-0.5 break-words text-sm font-semibold leading-5 text-slate-900">
              {fmt(row.price)}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function normalizeItineraryDay(raw: unknown, fallbackNumber: number) {
  const day = (raw ?? {}) as AnyRecord;
  const activitiesRaw = Array.isArray(day.activities)
    ? (day.activities as AnyRecord[])
    : Array.isArray(day.activity)
      ? (day.activity as AnyRecord[])
      : [];
  const activities = activitiesRaw.map((entry) => ({
    sightseeingId: (entry.sightseeingId ?? null) as string | null,
    imageDocumentId: (entry.imageDocumentId ?? null) as string | null,
    name: (entry.name ?? entry.title ?? null) as string | null,
    startTime: (entry.startTime ?? null) as string | null,
    // Legacy snapshots had no visibility flag; their configured time remains visible.
    showTime: entry.showTime !== false,
    duration: (entry.duration ?? null) as string | null,
    city: (entry.city ?? null) as string | null,
    description: (entry.description ?? null) as string | null,
    imageUrl: (entry.imageUrl ?? entry.image ?? null) as string | null,
    // Per-activity transfer; legacy rows fall back to the day-level value.
    dailyTransfer:
      TRANSFER_CANONICAL[String((entry as AnyRecord).dailyTransfer ?? '').toUpperCase()] ?? null,
    // Absent on activities saved before per-activity pricing existed.
    pricingOptions: normalizeActivityPricing(entry.pricingOptions),
    sequence: (entry.sequence ?? null) as number | null,
  }));
  const mealsRaw = day.meals;
  const meals = Array.isArray(mealsRaw)
    ? (mealsRaw as string[]).reduce(
        (acc, meal) => {
          const key = meal.trim().toLowerCase();
          if (key === 'breakfast') acc.breakfast = true;
          if (key === 'lunch') acc.lunch = true;
          if (key === 'dinner') acc.dinner = true;
          return acc;
        },
        { breakfast: false, lunch: false, dinner: false },
      )
    : {
        breakfast: Boolean((mealsRaw as AnyRecord | undefined)?.breakfast),
        lunch: Boolean((mealsRaw as AnyRecord | undefined)?.lunch),
        dinner: Boolean((mealsRaw as AnyRecord | undefined)?.dinner),
      };
  const itineraryTransferKey = String(day.dailyTransfer ?? '').toUpperCase();
  const prefsRaw = (day.mealPreferences as AnyRecord | undefined) ?? {};
  const mealPreferences = Object.fromEntries(
    (['breakfast', 'lunch', 'dinner'] as const).map((key) => {
      const entry = prefsRaw[key];
      if (!entry || typeof entry !== 'object') return [key, null] as const;
      return [
        key,
        {
          mode: normalizeSightseeingMealMode((entry as AnyRecord).mode),
          transferDetails: ((entry as AnyRecord).transferDetails ?? null) as string | null,
        },
      ] as const;
    }),
  ) as Record<
    'breakfast' | 'lunch' | 'dinner',
    { mode: string | null; transferDetails: string | null } | null
  >;
  return {
    dayNumber: Number(day.dayNumber) || fallbackNumber,
    title: (day.dayTitle ?? day.title ?? null) as string | null,
    city: (day.city ?? null) as string | null,
    date: (day.date ?? null) as string | null,
    meals,
    // Shared legacy mode, normalized without forcing a default: a missing or
    // unknown legacy mode must never silently become INCLUDE_AT_HOTEL.
    mealMode: normalizeSightseeingMealMode(day.mealMode),
    mealPreferences,
    dailyTransfer: TRANSFER_CANONICAL[itineraryTransferKey] ?? 'NO_TRANSFER',
    activities,
  };
}

function itineraryDayLabel(day: ReturnType<typeof normalizeItineraryDay>): string {
  const base = stripItineraryDayPrefixes(day.title);
  if (base) return formatItineraryDayTitle(day.dayNumber, base);
  const primaryTitle = day.activities.find((activity) => activity.name?.trim())?.name?.trim();
  if (primaryTitle) return formatItineraryDayTitle(day.dayNumber, primaryTitle);
  if (day.city?.trim()) return formatItineraryDayTitle(day.dayNumber, day.city);
  return formatItineraryDayTitle(day.dayNumber, null);
}

function itineraryDateLabel(date: string | null | undefined): string | null {
  const raw = String(date ?? '').trim();
  if (!raw) return null;
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T00:00:00`) : new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(parsed);
}

function itineraryMealLabel(
  pref: { mode: string | null; transferDetails: string | null } | null,
  legacyMode: string | null,
): string | null {
  // Each meal reads its own saved preference. The shared legacy mode is used
  // only when the meal has no per-meal preference at all — never as a fallback
  // for a present-but-unknown mode, so a bad value cannot become "(Hotel)".
  const mode = pref ? pref.mode : legacyMode;
  if (mode === 'WITH_TRANSFER') {
    const details = (pref?.transferDetails ?? '').trim();
    return details ? `With Transfer: ${details}` : 'With Transfer';
  }
  if (mode === 'INCLUDE_AT_HOTEL') return 'Hotel';
  if (mode === 'NO_TRANSFER') return 'No Transfer';
  return null;
}

function itineraryMealsLabel(day: ReturnType<typeof normalizeItineraryDay>): string | null {
  const keys = ['breakfast', 'lunch', 'dinner'] as const;
  const selected = keys.filter((key) => day.meals[key]);
  if (!selected.length) return null;
  return selected
    .map((key) => {
      const name = key.charAt(0).toUpperCase() + key.slice(1);
      const label = itineraryMealLabel(day.mealPreferences[key], day.mealMode);
      return label ? `${name} (${label})` : name;
    })
    .join(', ');
}

function itineraryDayHasMeaning(day: ReturnType<typeof normalizeItineraryDay>): boolean {
  return Boolean(
    day.title?.trim() ||
    day.city?.trim() ||
    day.activities.some((activity) => activity.name?.trim() || activity.description?.trim()) ||
    day.meals.breakfast ||
    day.meals.lunch ||
    day.meals.dinner ||
    day.dailyTransfer !== 'NO_TRANSFER',
  );
}

/** Render a rich-text (HTML) or plain-text description without leaking markup. */
function ItineraryRichText({ html }: { html: string | null }) {
  const text = (html ?? '').trim();
  if (!text) return null;
  if (!/<[a-z][\s\S]*>/i.test(text))
    return <p className="whitespace-pre-line text-sm leading-relaxed text-slate-600">{text}</p>;
  return <RichHtml html={text} />;
}

/** Fixed-size itinerary image with a safe fallback on load failure. */
function ItineraryImage({ src, alt }: { src: string | null; alt: string }) {
  const [failed, setFailed] = useState(false);
  if (failed || !src)
    return (
      <div className="flex h-full w-full items-center justify-center bg-slate-100 text-slate-400">
        <ImageIcon className="h-10 w-10" />
      </div>
    );
  return (
    <img
      src={src}
      alt={alt}
      onError={() => setFailed(true)}
      className="h-full w-full object-cover object-center"
    />
  );
}

/** Small per-activity thumbnail with a safe neutral fallback. */
function ItineraryThumb({ src, alt }: { src: string | null; alt: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed)
    return (
      <div className="flex h-full w-full items-center justify-center bg-slate-100 text-slate-300">
        <ImageIcon className="h-4 w-4" />
      </div>
    );
  return (
    <img
      src={src}
      alt={alt}
      onError={() => setFailed(true)}
      className="h-full w-full object-cover object-center"
    />
  );
}

/** Reference "Your Itinerary" — compact timeline of day cards. */
function SightseeingItineraryView({
  days,
  color,
  images,
  documentImages,
  description,
  destinationImage,
  fmt,
}: {
  days: SightseeingDay[];
  color: string;
  images: Record<string, { imageUrl: string | null }>;
  documentImages: Record<string, { imageUrl: string | null }>;
  description?: string | null;
  destinationImage?: string | null;
  /** The quotation's own currency formatter, reused for activity pricing. */
  fmt: (value: number) => string;
}) {
  const normalized = useMemo(
    () => days.map((day, index) => normalizeItineraryDay(day, index + 1)),
    [days],
  );
  const shown = normalized.filter(itineraryDayHasMeaning);
  if (!shown.length) return null;
  const sectionIntro = (description ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return (
    <section>
      <SectionTitle>Your Itinerary</SectionTitle>
      {sectionIntro && (
        <div className="mb-5 rounded-md border border-sky-200 border-l-4 border-l-cyan-500 bg-sky-50 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-cyan-900">
            <InfoIcon className="h-4 w-4 shrink-0 text-cyan-600" aria-hidden="true" />
            Instructions
          </p>
          <div className="mt-2 text-sm leading-relaxed text-slate-700">
            <ItineraryRichText html={description ?? ''} />
          </div>
        </div>
      )}
      <div className="relative">
        <div
          aria-hidden="true"
          className="absolute bottom-4 left-4 top-4 w-0.5"
          style={{ backgroundColor: color }}
        />
        <div className="space-y-5">
          {shown.map((day) => {
            const title = itineraryDayLabel(day);
            const dateLabel = itineraryDateLabel(day.date);
            const mealsLabel = itineraryMealsLabel(day);
            const validActivities = day.activities.filter(
              (activity) => activity.name?.trim() || activity.description?.trim(),
            );
            const image = resolveItineraryDayImage(day.activities, {
              document: (documentId) => documentImages[documentId]?.imageUrl ?? null,
              snapshot: (imageUrl) => imageUrl,
              sightseeing: (sightseeingId) => images[sightseeingId]?.imageUrl ?? null,
              destination: destinationImage ?? null,
            });
            return (
              <div key={`${day.dayNumber}`} className="relative pl-10 md:pl-12">
                <span
                  aria-hidden="true"
                  className="absolute left-[10px] top-6 h-3.5 w-3.5 rounded-full border-2 bg-white"
                  style={{ borderColor: color }}
                />
                <article className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-card p-4 shadow-sm md:flex-row md:items-start md:gap-5 md:p-5">
                  <div className="aspect-[16/9] w-full shrink-0 overflow-hidden rounded-lg md:aspect-auto md:h-[180px] md:w-[285px]">
                    <ItineraryImage src={image} alt={title} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-lg font-bold text-slate-800">{title}</h3>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-500">
                      {day.city?.trim() && (
                        <>
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="h-4 w-4" /> {day.city}
                          </span>
                          {dateLabel && <span aria-hidden="true">|</span>}
                        </>
                      )}
                      {dateLabel && (
                        <span className="inline-flex items-center gap-1">
                          <CalendarDays className="h-4 w-4" /> {dateLabel}
                        </span>
                      )}
                    </div>
                    {validActivities.length === 1 ? (
                      (() => {
                        const activity = validActivities[0];
                        if (!activity) return null;
                        return (
                          <>
                            <div className="mt-3 overflow-hidden rounded-lg border border-slate-200">
                              <p className="border-b border-slate-200 bg-slate-100/80 px-3 py-1.5 text-sm font-semibold text-slate-700">
                                Activities &amp; Details
                              </p>
                              <div className="bg-white p-3">
                                <p className="flex items-center gap-2 font-semibold text-slate-800">
                                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                                  {activity.name}
                                </p>
                                {activity.showTime !== false && activity.startTime && (
                                  <p className="mt-1 flex items-center gap-1 pl-6 text-xs font-medium text-slate-500">
                                    <Clock className="h-3.5 w-3.5" />
                                    {formatTime12Hour(activity.startTime)}
                                    {activity.duration ? ` · ${activity.duration}` : ''}
                                  </p>
                                )}
                                {activity.description && (
                                  <div className="mt-1 pl-6">
                                    <ItineraryRichText html={activity.description} />
                                  </div>
                                )}
                                {(() => {
                                  const label =
                                    SIGHTSEEING_TRANSFER_LABELS[
                                      activity.dailyTransfer ?? day.dailyTransfer
                                    ];
                                  if (!label) return null;
                                  return (
                                    <div className="mt-3 flex flex-wrap items-center gap-2">
                                      <span
                                        className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold text-white"
                                        style={{ backgroundColor: color }}
                                      >
                                        <Car className="h-3.5 w-3.5" />
                                        {label}
                                      </span>
                                    </div>
                                  );
                                })()}
                                <ActivityPricing rows={activity.pricingOptions} fmt={fmt} />
                              </div>
                            </div>
                            {mealsLabel && (
                              <p className="mt-2 flex items-center gap-1 text-sm text-slate-600">
                                <Utensils className="h-4 w-4 text-slate-400" />
                                <span className="font-semibold">Meals:</span> {mealsLabel}
                              </p>
                            )}
                          </>
                        );
                      })()
                    ) : validActivities.length >= 2 ? (
                      <>
                        <div className="mt-3 overflow-hidden rounded-lg border border-slate-200">
                          <p className="border-b border-slate-200 bg-slate-100/80 px-3 py-1.5 text-sm font-semibold text-slate-700">
                            Activities &amp; Details
                          </p>
                          <div className="bg-white p-3">
                            {validActivities.map((activity, activityIndex) => {
                              const thumb =
                                (activity.imageDocumentId
                                  ? documentImages[activity.imageDocumentId]?.imageUrl
                                  : null) ??
                                activity.imageUrl ??
                                (activity.sightseeingId
                                  ? images[activity.sightseeingId]?.imageUrl
                                  : null) ??
                                null;
                              const isLast = activityIndex === validActivities.length - 1;
                              return (
                                <Fragment key={`${activity.sightseeingId ?? activityIndex}`}>
                                  <div className="flex gap-3">
                                    <div className="h-14 w-20 shrink-0 overflow-hidden rounded-md">
                                      <ItineraryThumb
                                        src={thumb}
                                        alt={activity.name ?? 'Activity'}
                                      />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <p className="flex items-center gap-2 font-semibold text-slate-800">
                                        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                                        {activity.name}
                                      </p>
                                      {activity.showTime !== false && activity.startTime && (
                                        <p className="mt-1 flex items-center gap-1 pl-6 text-xs font-medium text-slate-500">
                                          <Clock className="h-3.5 w-3.5" />
                                          {formatTime12Hour(activity.startTime)}
                                          {activity.duration ? ` · ${activity.duration}` : ''}
                                        </p>
                                      )}
                                      {activity.description && (
                                        <div className="mt-1 pl-6">
                                          <ItineraryRichText html={activity.description} />
                                        </div>
                                      )}
                                      {(() => {
                                        const label =
                                          SIGHTSEEING_TRANSFER_LABELS[
                                            activity.dailyTransfer ?? day.dailyTransfer
                                          ];
                                        if (!label) return null;
                                        return (
                                          <div className="mt-2 flex flex-wrap items-center gap-2">
                                            <span
                                              className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold text-white"
                                              style={{ backgroundColor: color }}
                                            >
                                              <Car className="h-3.5 w-3.5" />
                                              {label}
                                            </span>
                                          </div>
                                        );
                                      })()}
                                      <ActivityPricing rows={activity.pricingOptions} fmt={fmt} />
                                    </div>
                                  </div>
                                  {!isLast && <hr className="my-3 border-slate-200" />}
                                </Fragment>
                              );
                            })}
                          </div>
                        </div>
                        {mealsLabel && (
                          <p className="mt-2 flex items-center gap-1 text-sm text-slate-600">
                            <Utensils className="h-4 w-4 text-slate-400" />
                            <span className="font-semibold">Meals:</span> {mealsLabel}
                          </p>
                        )}
                      </>
                    ) : (
                      <>
                        {(() => {
                          const label = SIGHTSEEING_TRANSFER_LABELS[day.dailyTransfer];
                          if (!label) return null;
                          return (
                            <div className="mt-3 flex flex-wrap items-center gap-2">
                              <span
                                className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold text-white"
                                style={{ backgroundColor: color }}
                              >
                                <Car className="h-3.5 w-3.5" />
                                {label}
                              </span>
                            </div>
                          );
                        })()}
                        {mealsLabel && (
                          <p className="mt-2 flex items-center gap-1 text-sm text-slate-600">
                            <Utensils className="h-4 w-4 text-slate-400" />
                            <span className="font-semibold">Meals:</span> {mealsLabel}
                          </p>
                        )}
                      </>
                    )}
                  </div>
                </article>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/**
 * Hotel snapshot images carousel (from a hotel bookmark), rendered inside the
 * hotel's own card. Shows one image at a time in saved order with Previous/Next
 * navigation and a "1 / N" counter; a single image is shown plainly. Never
 * reloads the page. This is the ONLY place hotel images render on the weblink.
 */
function HotelImageCarousel({
  images,
}: {
  images: Array<{ url: string; thumbnailUrl?: string | null; alt?: string | null }>;
}) {
  const [active, setActive] = useState(0);
  const [failed, setFailed] = useState<Set<string>>(new Set());
  const count = images.length;
  if (count === 0) return null;
  const current = images[Math.min(active, count - 1)]!;
  const previous = () => setActive((index) => (index - 1 + count) % count);
  const next = () => setActive((index) => (index + 1) % count);
  const alt = current.alt?.trim() || 'Hotel image';
  // Fall back to the same image's thumbnail candidate when the primary URL
  // fails, mirroring how the bookmark carousel resolves provider images.
  const currentUrl =
    failed.has(current.url) && current.thumbnailUrl ? current.thumbnailUrl : current.url;
  const onError = () => {
    if (!failed.has(current.url)) setFailed((prev) => new Set(prev).add(current.url));
  };

  if (count === 1) {
    return (
      <div className="h-full w-full bg-slate-100">
        <img
          src={currentUrl}
          alt={alt}
          loading="lazy"
          onError={onError}
          className="h-full w-full object-cover"
        />
      </div>
    );
  }

  return (
    <div className="relative h-full w-full overflow-hidden bg-slate-100">
      <img
        src={currentUrl}
        alt={alt}
        loading="lazy"
        onError={onError}
        className="h-full w-full object-cover"
      />
      <div className="absolute inset-y-0 left-0 flex items-center">
        <button
          type="button"
          aria-label="Previous hotel image"
          onClick={previous}
          className="mx-2 rounded-full bg-white/80 p-2 text-slate-700 shadow transition hover:bg-white"
        >
          <ChevronLeft className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
      <div className="absolute inset-y-0 right-0 flex items-center">
        <button
          type="button"
          aria-label="Next hotel image"
          onClick={next}
          className="mx-2 rounded-full bg-white/80 p-2 text-slate-700 shadow transition hover:bg-white"
        >
          <ChevronRight className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
      <p className="absolute bottom-2 right-3 rounded-full bg-black/60 px-2.5 py-0.5 text-xs font-medium text-white">
        {active + 1} / {count}
      </p>
    </div>
  );
}

export function PublicQuotationPage() {
  const { token = '' } = useParams();
  const [data, setData] = useState<PublicQuotation | null>(null);
  const [error, setError] = useState('');
  // Public Policies accordion: only one section is open at a time; Inclusions
  // (or the first non-empty section) starts open.
  const [openPolicy, setOpenPolicy] = useState<string | null>(null);
  const policyDefaultSetRef = useRef(false);
  useEffect(() => {
    if (policyDefaultSetRef.current || !data) return;
    const first = buildPolicySections(data.version).find((section) => section.visible);
    if (first) {
      policyDefaultSetRef.current = true;
      setOpenPolicy(first.key);
    }
  }, [data]);
  // Company logo becomes the browser-tab favicon once the quotation loads;
  // restored to the default when the data has no logo or the page unmounts.
  useFavicon(data?.company.logoUrl);
  // Tab title mirrors the quotation title once loaded (fallback: "Quotation").
  useDocumentTitle(data?.version.title);
  useEffect(() => {
    void publicRequest<PublicQuotation>(`/api/public/quotations/${encodeURIComponent(token)}`)
      .then((value) => {
        setData(value);
      })
      .catch((value: unknown) =>
        setError(value instanceof Error ? value.message : 'Quotation unavailable.'),
      );
  }, [token]);

  // Best-effort visitor telemetry: an initial snapshot on load plus a final
  // scroll/time beacon on leave. Fully client-derived (device, screen, locale,
  // referrer, UTM); the server adds IP, User-Agent parsing and geolocation.
  useEffect(() => {
    if (!token) return;
    const trackUrl = `/api/public/quotations/${encodeURIComponent(token)}/track`;
    let maxScroll = 0;
    let wasScrollable = false;
    let ctaClicks = 0;
    // Active (engaged) time: accrues only while the tab is visible, so a
    // backgrounded tab never inflates "time on page".
    let activeMs = 0;
    let lastResume = Date.now();
    const activeSeconds = () => {
      const live = document.visibilityState === 'visible' ? Date.now() - lastResume : 0;
      return Math.round((activeMs + live) / 1000);
    };

    // Stable first-party visitor id so returning visits are recognised.
    let visitorId: string | undefined;
    try {
      const key = 'iq_visitor_id';
      visitorId = window.localStorage.getItem(key) ?? undefined;
      if (!visitorId) {
        visitorId = `v_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
        window.localStorage.setItem(key, visitorId);
      }
    } catch {
      visitorId = undefined;
    }

    // Scroll depth only counts when the page actually overflows the viewport;
    // a page that fits reports no scroll rather than a misleading 100%.
    const onScroll = () => {
      const doc = document.documentElement;
      const scrollable = doc.scrollHeight - doc.clientHeight;
      if (scrollable <= 0) return;
      wasScrollable = true;
      const pct = Math.round((doc.scrollTop / scrollable) * 100);
      if (pct > maxScroll) maxScroll = Math.min(100, Math.max(0, pct));
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    // Count meaningful interactions (clicks on links/buttons).
    const onClick = (event: MouseEvent) => {
      const el = event.target as HTMLElement | null;
      if (el?.closest('a,button,[role="button"]')) ctaClicks += 1;
    };
    document.addEventListener('click', onClick, true);

    const collect = () => {
      const nav = navigator as Navigator & {
        deviceMemory?: number;
        connection?: { effectiveType?: string; downlink?: number; rtt?: number };
        userAgentData?: { platform?: string };
      };
      const params = new URLSearchParams(window.location.search);
      const utm = (key: string) => params.get(key) ?? undefined;
      return {
        platform: nav.userAgentData?.platform || navigator.platform || undefined,
        language: navigator.language,
        languages: navigator.languages?.join(', '),
        clientTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        screenWidth: window.screen?.width,
        screenHeight: window.screen?.height,
        screenAvailWidth: window.screen?.availWidth,
        screenAvailHeight: window.screen?.availHeight,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        pixelRatio: window.devicePixelRatio,
        colorDepth: window.screen?.colorDepth,
        orientation: window.screen?.orientation?.type,
        cpuCores: navigator.hardwareConcurrency,
        deviceMemory: nav.deviceMemory,
        connectionType: nav.connection?.effectiveType,
        connectionDownlink: nav.connection?.downlink,
        connectionRtt: nav.connection?.rtt,
        online: navigator.onLine,
        referrer: document.referrer || undefined,
        landingUrl: window.location.href,
        utmSource: utm('utm_source'),
        utmMedium: utm('utm_medium'),
        utmCampaign: utm('utm_campaign'),
        visitorId,
        // Omit scroll entirely when the page never needed scrolling.
        maxScrollDepth: wasScrollable ? maxScroll : undefined,
        timeOnPageSeconds: activeSeconds(),
        ctaClicks,
      };
    };

    const send = (final: boolean) => {
      const body = JSON.stringify(collect());
      if (final && typeof navigator.sendBeacon === 'function') {
        navigator.sendBeacon(trackUrl, new Blob([body], { type: 'application/json' }));
      } else {
        void fetch(trackUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
          keepalive: final,
        }).catch(() => {});
      }
    };

    const initial = window.setTimeout(() => send(false), 900);
    // On hide: bank the active time so far and flush; on show: restart the clock.
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        activeMs += Date.now() - lastResume;
        send(true);
      } else {
        lastResume = Date.now();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    const onPageHide = () => {
      if (document.visibilityState === 'visible') activeMs += Date.now() - lastResume;
      send(true);
    };
    window.addEventListener('pagehide', onPageHide);

    return () => {
      window.clearTimeout(initial);
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
      if (document.visibilityState === 'visible') activeMs += Date.now() - lastResume;
      send(true);
    };
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
  const policySections = buildPolicySections(v);
  const color = /^#[0-9a-f]{6}$/i.test(company.primaryColor) ? company.primaryColor : '#2563eb';

  const fmt = (value: number) =>
    new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: v.currency,
      maximumFractionDigits: 0,
    }).format(value);
  // Exact (2-decimal) money for the initial-payment sentence, e.g. ₹2,000.00.
  const fmtExact = (value: number) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: v.currency }).format(value);

  // Draft Hotel Stays added but never named have no valid hotel name — a stay
  // without a name must never render as a hotel card on the weblink.
  const namedHotels = v.hotels.filter((hotel) => (hotel.hotelName ?? '').trim().length > 0);
  const selectedHotels = namedHotels.filter((hotel) => hotel.selected);
  const visibleHotels = selectedHotels.length > 0 ? selectedHotels : namedHotels;
  // Hotels only appear when included in the quotation (hotelDetails.include).
  const hotelIncluded = v.hotelDetails?.include !== false && visibleHotels.length > 0;
  const nights =
    q.durationNights && q.durationNights > 0
      ? q.durationNights
      : q.travelStartDate && q.travelEndDate
        ? Math.max(
            0,
            Math.round(
              (new Date(q.travelEndDate).getTime() - new Date(q.travelStartDate).getTime()) /
                86_400_000,
            ),
          )
        : 0;
  const duration = nights > 0 ? `${nights} Nights / ${nights + 1} Days` : null;

  const travelers = [
    q.adults && `${q.adults} Adult${q.adults > 1 ? 's' : ''}`,
    q.childrenWithBed && `${q.childrenWithBed} CWB`,
    q.childrenWithoutBed && `${q.childrenWithoutBed} CWOB`,
    q.infants && `${q.infants} Infant${q.infants > 1 ? 's' : ''}`,
  ]
    .filter(Boolean)
    .join(', ');

  // Traveller-mix breakdown lines. CWB/CWOB keep their exact labels; Adult and
  // Infant switch to singular for a count of one. Zero-count / zero-price rows
  // are dropped so the card never shows noise.
  const perPaxLines = (
    [
      [q.adults, 'Adult', 'Adults', v.perAdultPrice],
      [q.childrenWithBed, 'CWB', 'CWB', v.perChildWithBedPrice],
      [q.childrenWithoutBed, 'CWOB', 'CWOB', v.perChildWithoutBedPrice],
      [q.infants, 'Infant', 'Infants', v.perInfantPrice],
    ] as const
  ).filter(([count, , , price]) => Number(count) > 0 && Number(price ?? 0) > 0);

  const packageTotal =
    Number(v.perAdultPrice ?? 0) * q.adults +
    Number(v.perChildWithBedPrice ?? 0) * q.childrenWithBed +
    Number(v.perChildWithoutBedPrice ?? 0) * q.childrenWithoutBed +
    Number(v.perInfantPrice ?? 0) * q.infants;
  const finalTotal = packageTotal > 0 ? packageTotal : Number(v.finalAmount);
  // Public tax note: never the control values ("Do not show" / the sentinel).
  const taxNoteText = isPublicTaxNote(v.taxNote) ? v.taxNote.trim() : null;
  // "Secure Your Booking Now" shows only with a real amount AND a valid link.
  const initialAmount = Number(v.initialPaymentAmount ?? 0);
  const rawPaymentLink = v.paymentLink?.trim() ?? '';
  const validPaymentLink = /^https?:\/\//i.test(rawPaymentLink) ? rawPaymentLink : null;
  const showSecureBooking = initialAmount > 0 && Boolean(validPaymentLink);
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
  // Add-ons only appear when the top-level Add-on Services include flag is on
  // AND the individual Add-on row is actually selected (linked to an Add-on
  // master). Rows present without an addOnServiceId are not included.
  const addOnIncluded = v.addOnDetails?.include !== false;
  const addonServices = addOnIncluded
    ? v.services.filter(
        (service) => ADDON_SERVICE_TYPES.has(service.serviceType) && service.addOnServiceId != null,
      )
    : [];
  // Reference "Flight Details" — structured journeys from flightDetails.
  const fd = v.flightDetails;
  const flightJourneys =
    fd && fd.include && fd.entryMode !== 'IMAGE'
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
  const hasFlights =
    (fd?.include &&
      fd.entryMode === 'IMAGE' &&
      Boolean(data.flightImages?.length || data.flightImageUrl)) ||
    flightJourneys.some((leg) => (leg.journey?.segments ?? []).some(segmentHasData));
  const sightseeingDays =
    v.sightseeingDetails?.include !== false ? (v.sightseeingDetails?.days ?? []) : [];
  // Sightseeing is included when at least one valid day exists (a title or a
  // named/described activity), matching the itinerary-section validity rule.
  // A legacy SIGHTSEEING service row is kept as a backward-compatible fallback.
  const validSightseeingDays = sightseeingDays.filter(
    (day) =>
      day.title || (day.activities ?? []).some((activity) => activity.name || activity.description),
  );
  const hasSightseeing = validSightseeingDays.length > 0 || svcOf('SIGHTSEEING').length > 0;
  // Services actually included in this quotation, as separate cards. Each key
  // maps to a labelled card with a dedicated icon (fallback icon for unknowns).
  const includedServices: ServiceCard[] = [];
  const addService = (key: string, label: string) => includedServices.push({ key, label });
  if (hasFlights) addService('flights', 'Flights');
  if (hotelIncluded) addService('hotels', 'Hotels');
  if (hasSightseeing) addService('sightseeing', 'Sightseeing');
  if (cruises.length > 0) addService('cruise', 'Cruise');
  if (vehicles.length > 0) addService('transportation', 'Transportation');
  if (showVisa) addService('visa', 'Visa');
  if (addonServices.length > 0) addService('add-ons', 'Add-ons');

  const preparedBy = v.createdBy?.fullName ?? '';
  // Secondary contact row under "Prepared By": only present values, separated
  // by a single "|" between items (never leading/trailing).
  const preparedContacts: ReactNode[] = [];
  if (company.phone)
    preparedContacts.push(
      <a
        key="phone"
        href={`tel:${company.phone}`}
        className="text-slate-500 hover:text-slate-700 hover:underline"
      >
        {company.phone}
      </a>,
    );
  if (company.email)
    preparedContacts.push(
      <a
        key="email"
        href={`mailto:${company.email}`}
        className="break-all text-slate-500 hover:text-slate-700 hover:underline"
      >
        {company.email}
      </a>,
    );
  const heroIntroduction = publicHeroIntroduction(v.introduction);

  return (
    <main className="flex min-h-screen flex-col bg-slate-100">
      <div className="flex-1 pb-16">
        {/* Hero */}
        <header
          className="relative flex min-h-[300px] items-center overflow-hidden bg-slate-900 py-12 text-white sm:min-h-[330px] md:min-h-[380px]"
          style={
            data.heroImageUrl
              ? undefined
              : { background: `linear-gradient(135deg, ${color} 0%, ${color}cc 60%, #0f172a 140%)` }
          }
        >
          {data.heroImageUrl && (
            <>
              <img
                data-testid="public-hero-image"
                src={data.heroImageUrl}
                alt=""
                className="pointer-events-none absolute inset-0 h-full w-full object-cover object-center"
              />
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#08162db8] via-[#08162d7a] to-[#08162d38]"
              />
            </>
          )}
          <div className="relative z-10 mx-auto w-full max-w-5xl px-5 text-left md:px-4">
            <h1 className="text-[32px] font-extrabold leading-[1.1] text-white sm:text-[40px] lg:text-[48px] [text-shadow:0_2px_8px_rgba(0,0,0,0.35)]">
              {v.weblinkHeading?.trim() ||
                q.destinationSummary.split(/[•→>,/]/)[0]?.trim() ||
                q.destinationSummary}
            </h1>
            {duration && (
              <p className="mt-2 text-[15px] font-medium text-white/85 sm:text-[17px] lg:text-[19px] [text-shadow:0_2px_8px_rgba(0,0,0,0.35)]">
                {duration}
              </p>
            )}
            <p className="mt-5 max-w-2xl text-[20px] font-bold leading-snug text-white sm:text-[24px] lg:text-[28px] [text-shadow:0_2px_8px_rgba(0,0,0,0.35)]">
              {v.title}
            </p>
            {heroIntroduction && (
              <p className="mt-3 max-w-2xl text-[14px] text-white/80 sm:text-[15px] [text-shadow:0_1px_4px_rgba(0,0,0,0.4)]">
                {heroIntroduction}
              </p>
            )}
          </div>
        </header>

        {/* Summary + price cards sit in normal flow below the complete hero. */}
        <div className="mx-auto mt-8 max-w-5xl space-y-6 px-4">
          {/* Summary + price */}
          <section className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-2xl bg-card p-6 shadow-lg lg:col-span-2">
              <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2 md:grid-cols-4">
                <Info label="Traveler Name" value={q.customerName} />
                <Info label="Travel Date" value={dateShort(q.travelStartDate) ?? 'Flexible'} />
                <Info label="Duration" value={duration ?? 'As advised'} />
                <Info label="Travelers" value={travelers} />
                <Info label="Quotation ID" value={formatPublicQuotationNumber(q.quotationNumber)} />
                <Info
                  label="Destinations"
                  value={q.destinations || q.destinationSummary.replace(/•/g, '→')}
                  full
                />
                {preparedBy && (
                  <div className="sm:col-span-2">
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                      Prepared By
                    </p>
                    <p className="mt-0.5 font-semibold text-slate-800">{preparedBy}</p>
                    {preparedContacts.length > 0 && (
                      <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs text-slate-500">
                        {preparedContacts.map((contact, index) => (
                          <span key={index} className="inline-flex items-center gap-x-1.5">
                            {index > 0 && <span aria-hidden="true">|</span>}
                            {contact}
                          </span>
                        ))}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="flex flex-col justify-center rounded-2xl bg-emerald-600 p-6 text-white shadow-lg">
              <p className="text-center text-sm font-medium uppercase tracking-wide text-white/85">
                Total Package Price
              </p>
              <p className="mt-1 text-center text-4xl font-bold">{fmt(finalTotal)}</p>
              {taxNoteText && (
                <p className="mt-1 text-center text-xs italic text-white/80">{taxNoteText}</p>
              )}
              {perPaxLines.length > 0 && (
                <div className="mt-3 space-y-1 text-center text-sm text-white/90">
                  {perPaxLines.map(([count, singular, plural, price]) => (
                    <p key={plural}>
                      {count} {Number(count) === 1 ? singular : plural} × {fmt(Number(price ?? 0))}
                    </p>
                  ))}
                </div>
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

          {/* Secure Your Booking Now — only with a real initial amount and link. */}
          {showSecureBooking && validPaymentLink && (
            <section className="flex flex-col items-start gap-5 rounded-md border border-slate-200 bg-white p-7 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-8">
              <div className="min-w-0">
                <h2 className="text-2xl font-bold text-slate-800">Secure Your Booking Now</h2>
                <p className="mt-2 text-base text-slate-700">
                  Make an initial payment of{' '}
                  <span className="font-semibold text-slate-800">{fmtExact(initialAmount)}</span> to
                  confirm your booking.
                </p>
                <p className="mt-1 text-[15px] text-slate-500">
                  The remaining balance can be paid as per the payment policy.
                </p>
              </div>
              <a
                href={validPaymentLink}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Pay Now — opens the secure payment page in a new tab"
                className="inline-flex shrink-0 items-center gap-2 rounded-md bg-emerald-600 px-6 py-[14px] font-semibold text-white shadow-sm hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 sm:self-center"
              >
                <Lock className="h-5 w-5" aria-hidden="true" /> Pay Now
              </a>
            </section>
          )}

          {/* Quick navigation to the sections present in this quotation. */}
          {v.showQuickNav !== false && <SectionNav sticky={v.quickNavSticky ?? false} />}

          {/* Services Include */}
          {includedServices.length > 0 && (
            <section>
              <SectionTitle>Services Include</SectionTitle>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {includedServices.map((service) => {
                  const Icon = serviceCardIcon(service.key);
                  return (
                    <article
                      key={service.key}
                      className="flex flex-col items-center justify-center gap-3 rounded-lg border border-slate-200 bg-white p-5 text-center shadow-sm"
                    >
                      <Icon className="h-8 w-8 text-emerald-600" aria-hidden="true" />
                      <span className="font-medium text-slate-800">{service.label}</span>
                      <CheckCircle2 className="h-5 w-5 text-emerald-600" aria-hidden="true" />
                    </article>
                  );
                })}
              </div>
            </section>
          )}

          {/* Your Itinerary — day-wise sightseeing activities. */}
          {sightseeingDays.length > 0 && (
            <SightseeingItineraryView
              days={sightseeingDays}
              color="#16a34a"
              images={data.sightseeingPresentations ?? {}}
              documentImages={data.sightseeingDocumentPresentations ?? {}}
              description={v.sightseeingDetails?.description ?? null}
              destinationImage={data.heroImageUrl ?? null}
              fmt={fmt}
            />
          )}

          {/* Hotels */}
          {hotelIncluded && (
            <section>
              <SectionTitle>{publicHotelSectionTitle(v.hotelDetails?.sectionTitle)}</SectionTitle>
              <div className="grid gap-5">
                {visibleHotels.map((hotel, hotelIndex) => {
                  const presentation = data.hotelPresentations?.[hotel.id];
                  // One image source: the stored quotation hotel gallery
                  // (bookmark snapshots), rendered inside each hotel card — no
                  // separate large gallery above the cards.
                  const snapshotImages = hotel.images ?? [];
                  const snapshotImageUrl = snapshotImages[0]?.url ?? null;
                  const cardImageUrl = presentation?.imageUrl ?? snapshotImageUrl;
                  // Star rating comes from Hotel Master only (0–5). Never fall back
                  // to the free-text category snapshot, which can say "5 Star" even
                  // when the true rating is 0 or missing.
                  const category = presentation?.starCategory ?? 0;
                  // Review score is a separate Hotel Master decimal (e.g. 3.7).
                  const reviewScore = Number(presentation?.starRating);
                  const showScore = Number.isFinite(reviewScore) && reviewScore > 0;
                  // Only a valid http(s) review URL renders a link.
                  const rawReviewLink = presentation?.reviewLink?.trim() ?? '';
                  const reviewUrl = /^https?:\/\//i.test(rawReviewLink) ? rawReviewLink : null;
                  return (
                    <article
                      key={hotel.id}
                      className="overflow-hidden rounded-xl border bg-card shadow-sm sm:grid sm:grid-cols-[42%_1fr]"
                    >
                      <div className="flex aspect-[4/3] items-center justify-center bg-slate-100 sm:self-start">
                        {snapshotImages.length > 0 ? (
                          <HotelImageCarousel images={snapshotImages} />
                        ) : cardImageUrl ? (
                          <img
                            src={cardImageUrl}
                            alt={hotel.hotelName}
                            className="h-full w-full object-cover object-center"
                          />
                        ) : (
                          <div className="text-center text-slate-400">
                            <Building2 className="mx-auto h-12 w-12" />
                            <p className="mt-2 text-xs">Hotel image unavailable</p>
                          </div>
                        )}
                      </div>
                      <div className="p-5">
                        <div className="flex items-start justify-between gap-3">
                          <h3 className="text-lg font-bold leading-tight text-slate-800">
                            {hotel.hotelName}
                          </h3>
                          {(reviewUrl || showScore) && (
                            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                              {reviewUrl && (
                                <a
                                  href={reviewUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs font-medium text-blue-600 hover:underline"
                                >
                                  Hotel Review <ExternalLink className="inline h-3 w-3" />
                                </a>
                              )}
                              {showScore && (
                                <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-800">
                                  {presentation?.starRating}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                        {category > 0 && (
                          <div className="mt-2 flex gap-0.5" aria-label={`${category} star hotel`}>
                            {Array.from({ length: Math.min(5, category) }, (_, index) => (
                              <Star key={index} className="h-4 w-4 fill-amber-400 text-amber-400" />
                            ))}
                          </div>
                        )}
                        <p className="mt-3 flex items-start gap-1.5 text-sm text-slate-500">
                          <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
                          {hotel.city}
                          {presentation?.country ? `, ${presentation.country}` : ''}
                        </p>
                        {presentation?.address?.trim() && (
                          <p className="mt-1.5 text-sm text-slate-500">
                            {presentation.address.trim()}
                          </p>
                        )}
                        <div className="mt-5 space-y-1.5 text-sm text-slate-700">
                          {hotel.roomType?.trim() ? (
                            <p>
                              <strong>Room Type:</strong> {hotel.roomType}
                            </p>
                          ) : null}
                          {hotel.mealPlan?.trim() ? (
                            <p>
                              <strong>Meal Plan:</strong> {hotel.mealPlan}
                            </p>
                          ) : null}
                          {hotel.rooms != null && (
                            <p>
                              <strong>Rooms:</strong> {hotel.rooms}
                            </p>
                          )}
                          <p>
                            <strong>Nights:</strong>{' '}
                            <span className="rounded bg-emerald-600 px-2 py-0.5 font-semibold text-white">
                              {hotelStayNights(hotel.checkInDate, hotel.checkOutDate) ??
                                hotel.nights}
                            </span>
                          </p>
                        </div>
                        <div className="mt-4 space-y-1 text-xs text-slate-500">
                          <p>
                            Check-in: {dateShort(hotel.checkInDate) ?? '—'}
                            {hotel.checkInTime && hotel.showCheckInTime !== false
                              ? ` | ${formatTime12Hour(hotel.checkInTime)}`
                              : ''}
                          </p>
                          <p>
                            Check-out: {dateShort(hotel.checkOutDate) ?? '—'}
                            {hotel.checkOutTime && hotel.showCheckOutTime !== false
                              ? ` | ${formatTime12Hour(hotel.checkOutTime)}`
                              : ''}
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
              <SectionTitle>{fd?.sectionTitle || 'Flight Details'}</SectionTitle>
              {fd?.entryMode === 'IMAGE' && (data.flightImages?.length || data.flightImageUrl) ? (
                <FlightImageViewer
                  images={
                    data.flightImages?.length
                      ? data.flightImages
                      : [{ description: null, url: data.flightImageUrl! }]
                  }
                />
              ) : (
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
              )}
            </section>
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
            <section>
              <SectionTitle>{cruises[0]?.taxCategory?.trim() || 'Cruise Details'}</SectionTitle>
              <div className="grid gap-5 md:grid-cols-2">
                {cruises.map((cruise) => {
                  const presentation = data.cruisePresentations?.[cruise.id];
                  const duration = cruise.notes?.trim();
                  const roomType = presentation?.roomTypeName?.trim();
                  // The old generic form could store a bare public/localhost URL
                  // in the description; never surface that as cruise content.
                  const rawDescription = cruise.description?.trim() ?? '';
                  const descriptionHasText = Boolean(rawDescription.replace(/<[^>]*>/g, '').trim());
                  const showDescription =
                    Boolean(rawDescription) &&
                    descriptionHasText &&
                    !/^https?:\/\/\S+$/i.test(rawDescription);
                  return (
                    <article
                      key={cruise.id}
                      className="overflow-hidden rounded-xl border bg-card shadow-sm"
                    >
                      <div className="aspect-[16/9] bg-slate-100">
                        {presentation?.imageUrl ? (
                          <img
                            src={presentation.imageUrl}
                            alt={cruise.name}
                            className="h-full w-full object-cover object-center"
                          />
                        ) : (
                          <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-slate-400">
                            <Ship className="h-10 w-10" />
                            <p className="text-xs">Cruise image unavailable</p>
                          </div>
                        )}
                      </div>
                      <div className="space-y-2 p-5">
                        <h3 className="text-lg font-bold text-slate-800">{cruise.name}</h3>
                        {duration && (
                          <p className="text-sm text-slate-600">
                            <strong>Duration:</strong> {duration}
                          </p>
                        )}
                        {roomType && (
                          <p className="text-sm text-slate-600">
                            <strong>Room Type:</strong> {roomType}
                          </p>
                        )}
                        {showDescription && (
                          <div className="border-t pt-3">
                            <RichHtml html={rawDescription} />
                          </div>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          )}
          {/* Additional Services — included add-on services rendered as cards. */}
          {addonServices.length > 0 && (
            <section>
              <SectionTitle>Additional Services</SectionTitle>
              <div className="grid gap-4 md:grid-cols-2">
                {addonServices.map((service) => {
                  const plainText = (service.description ?? '')
                    .replace(/<[^>]*>/g, ' ')
                    .replace(/\s+/g, ' ')
                    .trim();
                  return (
                    <article key={service.id} className="rounded-2xl bg-card p-6 shadow-sm">
                      <h3 className="text-lg font-bold text-slate-800">{service.name}</h3>
                      {plainText && (
                        <div className="mt-2">
                          <RichHtml html={service.description ?? ''} />
                        </div>
                      )}
                    </article>
                  );
                })}
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

          {/* Policies — compact accordion, one section open at a time. */}
          {(() => {
            const visibleSections = policySections.filter((section) => section.visible);
            if (!visibleSections.length) return null;
            return (
              <section>
                <SectionTitle>Policies</SectionTitle>
                <div className="space-y-2">
                  {visibleSections.map((section) => {
                    const open = openPolicy === section.key;
                    return (
                      <div
                        key={section.key}
                        className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm"
                      >
                        <button
                          type="button"
                          aria-expanded={open}
                          aria-controls={`policy-panel-${section.key}`}
                          onClick={() => setOpenPolicy(open ? null : section.key)}
                          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                        >
                          <span className="flex items-center gap-2 text-sm font-semibold text-blue-600">
                            <section.Icon
                              className={`h-4 w-4 shrink-0 ${section.iconClass}`}
                              aria-hidden="true"
                            />
                            {section.label}
                          </span>
                          <ChevronDown
                            className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${
                              open ? 'rotate-180' : ''
                            }`}
                            aria-hidden="true"
                          />
                        </button>
                        {open && (
                          <div
                            id={`policy-panel-${section.key}`}
                            className="border-t py-4 pl-8 pr-4 text-sm text-slate-700"
                          >
                            {hasPolicyHtml(section.html) ? (
                              <RichHtml html={section.html!} />
                            ) : (
                              <ul className="space-y-1.5">
                                {section.rows.map((row) => (
                                  <li key={row.id} className="list-inside list-disc">
                                    {row.content}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })()}

          {/* Contact Us */}
          <PublicQuotationContact
            companyName={company.name}
            contactPerson={preparedBy}
            phone={company.phone}
            email={company.email}
            address={company.address}
            logoUrl={company.logoUrl}
            quotationId={q.quotationNumber}
            quotationTitle={v.title}
            leadName={q.customerName}
          />
        </div>
      </div>

      <PublicQuotationFooter
        companyName={company.name}
        operatingSince={company.operatingSince}
        tripsSold={company.tripsSold}
        tan={company.tan}
        gstin={company.taxRegistrationNumber}
        quotationNumber={q.quotationNumber}
        generatedAt={q.createdAt}
      />
    </main>
  );
}
