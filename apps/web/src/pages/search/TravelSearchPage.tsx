import { useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  Building2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Clock,
  Flame,
  Hotel,
  MapPin,
  Moon,
  Plane,
  PlaneTakeoff,
  RefreshCw,
  Search,
  Star,
  Users,
  Wifi,
} from 'lucide-react';
import type {
  FlightSearchResponse,
  SearchApiFlightOption,
  SearchApiFlightSegment,
  SearchApiHotelProperty,
  SearchApiLayover,
  SearchApiPrice,
  SearchApiReviewBreakdown,
} from '@interscale/shared';
import { SEARCH_DEFAULT_CURRENCY } from '@interscale/shared';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/utils/cn';
import {
  useFlightSearch,
  useHotelAutocomplete,
  destinationFromParam,
  destinationToParam,
  type FlightSearchParams,
  type HotelDestination,
  type HotelSearchParams,
} from '@/features/search/search.api';
import { useHotelPagedSearch } from '@/features/search/hotel-pagination';

const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AUD', 'AED', 'SGD', 'THB'];
const TRAVEL_CLASSES = ['economy', 'premium_economy', 'business', 'first_class'];
const STOPS = [
  ['any', 'Any'],
  ['nonstop', 'Nonstop'],
  ['one_stop_or_fewer', '1 stop or fewer'],
  ['two_stops_or_fewer', '2 stops or fewer'],
] as const;

const inputClass =
  'h-9 w-full rounded-lg border border-input bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/60 disabled:cursor-not-allowed disabled:opacity-60';

const minutes = (total: number | undefined) =>
  total === undefined ? '—' : `${Math.floor(total / 60)}h ${total % 60}m`;

/** Format a price number using the current currency. */
function formatPrice(price: number | undefined, currency: string): string {
  if (price === undefined) return '—';
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(price);
  } catch {
    return `${currency} ${price.toLocaleString('en-IN')}`;
  }
}

/** Format a provider-supplied price string (already includes its symbol). */
function formatPriceString(price: string | undefined): string {
  return price ?? '—';
}

function Stars({ count }: { count: number | undefined }) {
  if (!count) return null;
  return (
    <span className="flex items-center gap-0.5" aria-label={`${count} star`}>
      {Array.from({ length: count }).map((_, index) => (
        <Star key={index} className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
      ))}
    </span>
  );
}

/** Small labelled value row used in detail grids. */
function Field({ label, value }: { label: string; value: string | number | undefined }) {
  if (value === undefined || value === null || value === '') return null;
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="text-sm text-foreground">{String(value)}</p>
    </div>
  );
}

function Chip({ children }: { children: string }) {
  return (
    <span className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
      {children}
    </span>
  );
}

/**
 * Development-only accordion showing the raw cached provider response.
 *
 * Rendered as a plain button + conditional block. Opening/closing is local
 * state only — it never triggers a SearchApi request.
 */
function DevRawResponse({ label, data }: { label: string; data: unknown }) {
  const [open, setOpen] = useState(false);
  if (!import.meta.env.DEV) return null;
  return (
    <div className="overflow-hidden rounded-xl border border-dashed border-border bg-card shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full cursor-pointer select-none items-center justify-between px-4 py-3 text-sm font-medium text-muted-foreground hover:bg-muted/40"
      >
        <span>{label}</span>
        <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} aria-hidden="true" />
      </button>
      {open ? (
        <pre className="max-h-96 overflow-auto border-t border-border bg-muted/40 p-4 text-xs leading-relaxed text-muted-foreground">
          {JSON.stringify(data, null, 2)}
        </pre>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Flights
// ---------------------------------------------------------------------------

interface FlightForm {
  departure_id: string;
  arrival_id: string;
  outbound_date: string;
  return_date: string;
  round_trip: boolean;
  adults: number;
  travel_class: string;
  stops: string;
}

function FormGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h4>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </div>
  );
}

function FlightFormFields({
  form,
  currency,
  onCurrency,
  onChange,
  onSubmit,
  submitting,
}: {
  form: FlightForm;
  currency: string;
  onCurrency: (currency: string) => void;
  onChange: (patch: Partial<FlightForm>) => void;
  onSubmit: () => void;
  submitting: boolean;
}) {
  return (
    <Card>
      <form
        className="space-y-4 p-4"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <FormGroup title="Route">
          <label className="block space-y-1.5 text-sm font-medium text-foreground">
            From
            <input
              aria-label="Departure airport code"
              className={inputClass}
              placeholder="e.g. DEL"
              value={form.departure_id}
              onChange={(event) => onChange({ departure_id: event.target.value.toUpperCase() })}
            />
          </label>
          <label className="block space-y-1.5 text-sm font-medium text-foreground">
            To
            <input
              aria-label="Arrival airport code"
              className={inputClass}
              placeholder="e.g. SIN"
              value={form.arrival_id}
              onChange={(event) => onChange({ arrival_id: event.target.value.toUpperCase() })}
            />
          </label>
        </FormGroup>

        <FormGroup title="Dates">
          <label className="block space-y-1.5 text-sm font-medium text-foreground">
            Departure
            <input
              aria-label="Outbound date"
              type="date"
              className={inputClass}
              value={form.outbound_date}
              onChange={(event) => onChange({ outbound_date: event.target.value })}
            />
          </label>
          <div className="flex flex-col justify-end gap-2">
            <label className="flex items-center gap-2 text-sm font-medium text-foreground">
              <input
                type="checkbox"
                checked={form.round_trip}
                onChange={(event) => onChange({ round_trip: event.target.checked })}
                className="h-4 w-4 rounded border-input text-primary focus:ring-ring/60"
              />
              Round trip
            </label>
            <label className="block space-y-1.5 text-sm font-medium text-foreground">
              <span className="sr-only">Return date</span>
              <input
                aria-label="Return date"
                type="date"
                disabled={!form.round_trip}
                className={inputClass}
                value={form.return_date}
                onChange={(event) => onChange({ return_date: event.target.value })}
              />
            </label>
          </div>
        </FormGroup>

        <FormGroup title="Travellers">
          <label className="block space-y-1.5 text-sm font-medium text-foreground">
            Adults
            <input
              aria-label="Adults"
              type="number"
              min={1}
              max={9}
              className={inputClass}
              value={form.adults}
              onChange={(event) => onChange({ adults: Number(event.target.value) || 1 })}
            />
          </label>
          <label className="block space-y-1.5 text-sm font-medium text-foreground">
            Class
            <select
              aria-label="Travel class"
              className={inputClass}
              value={form.travel_class}
              onChange={(event) => onChange({ travel_class: event.target.value })}
            >
              {TRAVEL_CLASSES.map((value) => (
                <option key={value} value={value}>
                  {value.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </label>
        </FormGroup>

        <FormGroup title="Options">
          <label className="block space-y-1.5 text-sm font-medium text-foreground">
            Stops
            <select
              aria-label="Stops"
              className={inputClass}
              value={form.stops}
              onChange={(event) => onChange({ stops: event.target.value })}
            >
              {STOPS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1.5 text-sm font-medium text-foreground">
            Currency
            <select
              aria-label="Currency"
              className={inputClass}
              value={currency}
              onChange={(event) => onCurrency(event.target.value)}
            >
              {CURRENCIES.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
        </FormGroup>

        <div>
          <Button type="submit" isLoading={submitting}>
            {!submitting && <Search className="h-4 w-4" aria-hidden="true" />}
            Search flights
          </Button>
        </div>
      </form>
    </Card>
  );
}

function stopsLabel(option: SearchApiFlightOption): string {
  const stops = Math.max(0, option.flights.length - 1);
  if (stops === 0) return 'Non-stop';
  if (stops === 1) return '1 stop';
  return `${stops} stops`;
}

function splitItinerary(
  option: SearchApiFlightOption,
  arrivalId: string,
): { outbound: SearchApiFlightSegment[]; return: SearchApiFlightSegment[] } {
  const flights = option.flights ?? [];
  const returnStart = flights.findIndex((leg) => leg.departure_airport.id === arrivalId);
  if (returnStart === -1) return { outbound: flights, return: [] };
  return { outbound: flights.slice(0, returnStart), return: flights.slice(returnStart) };
}

/** Compact summary row for a flight option (shown when collapsed). */
function FlightSummary({ option, currency }: { option: SearchApiFlightOption; currency: string }) {
  const first = option.flights[0];
  const last = option.flights[option.flights.length - 1];
  const isRoundTrip = option.type?.toLowerCase().includes('round');
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
          {first?.airline_logo ? (
            <img src={first.airline_logo} alt="" className="h-4 w-4 rounded-sm object-contain" loading="lazy" />
          ) : (
            <Plane className="h-4 w-4 text-primary" aria-hidden="true" />
          )}
          {first?.airline ?? '—'} · {first?.flight_number ?? '—'}
        </span>
        {first && last ? (
          <p className="mt-1 text-sm text-foreground">
            <span className="font-medium">
              {first.departure_airport.id} {first.departure_airport.time}
            </span>
            <span className="mx-2 text-muted-foreground">→</span>
            <span className="text-xs text-muted-foreground">{minutes(option.total_duration)}</span>
            <span className="mx-2 text-muted-foreground">→</span>
            <span className="font-medium">
              {last.arrival_airport.id} {last.arrival_airport.time}
            </span>
          </p>
        ) : null}
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <Badge variant="secondary">{stopsLabel(option)}</Badge>
          <Badge variant="secondary">{option.flights[0]?.travel_class ?? '—'}</Badge>
          {isRoundTrip ? <Badge variant="outline">Round trip</Badge> : <Badge variant="outline">One way</Badge>}
        </div>
      </div>
      <div className="text-right">
        <p className="text-xl font-bold text-foreground">{formatPrice(option.price, currency)}</p>
        <p className="text-xs text-muted-foreground">total</p>
      </div>
    </div>
  );
}

/** One leg, rendered inside an expanded flight option. */
function FlightLeg({ leg }: { leg: SearchApiFlightSegment }) {
  const dep = leg.departure_airport;
  const arr = leg.arrival_airport;
  const amenities = leg.detected_extensions;
  return (
    <div className="rounded-lg border border-border bg-card-2 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
          {leg.airline_logo ? (
            <img src={leg.airline_logo} alt="" className="h-4 w-4 rounded-sm object-contain" loading="lazy" />
          ) : (
            <Plane className="h-4 w-4 text-primary" aria-hidden="true" />
          )}
          {leg.airline} · {leg.flight_number}
        </span>
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="rounded bg-muted px-2 py-0.5">{leg.travel_class ?? '—'}</span>
          {leg.is_overnight && (
            <span className="flex items-center gap-1 rounded bg-indigo-50 px-2 py-0.5 text-indigo-700">
              <Moon className="h-3 w-3" aria-hidden="true" /> Overnight
            </span>
          )}
        </span>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
        <div>
          <p className="text-lg font-semibold text-foreground">{dep.time}</p>
          <p className="text-xs text-muted-foreground">
            {dep.id} · {dep.date}
          </p>
          <p className="text-xs text-muted-foreground/80">{dep.name}</p>
        </div>
        <div className="flex flex-col items-center text-center">
          <span className="text-xs font-medium text-muted-foreground">{minutes(leg.duration)}</span>
          <span className="my-1 flex w-full items-center">
            <span className="h-px flex-1 bg-border" />
            <PlaneTakeoff className="mx-1 h-3.5 w-3.5 rotate-90 text-muted-foreground" aria-hidden="true" />
            <span className="h-px flex-1 bg-border" />
          </span>
          {leg.airplane && <span className="text-[11px] text-muted-foreground/80">{leg.airplane}</span>}
        </div>
        <div className="sm:text-right">
          <p className="text-lg font-semibold text-foreground">{arr.time}</p>
          <p className="text-xs text-muted-foreground">
            {arr.id} · {arr.date}
          </p>
          <p className="text-xs text-muted-foreground/80">{arr.name}</p>
        </div>
      </div>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        {leg.extensions?.length ? (
          <div className="flex flex-wrap gap-1.5">
            {leg.extensions.map((extension) => (
              <Chip key={extension}>{extension}</Chip>
            ))}
          </div>
        ) : null}
        {amenities ? (
          <div className="flex flex-wrap gap-1.5">
            {amenities.wifi ? <Chip>{`Wi-Fi ${String(amenities.wifi)}`}</Chip> : null}
            {amenities.seat_type ? <Chip>{String(amenities.seat_type)}</Chip> : null}
            {amenities.legroom_short ? <Chip>{`Legroom ${String(amenities.legroom_short)}`}</Chip> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function LayoverRow({ layover }: { layover: SearchApiLayover }) {
  return (
    <div className="flex items-center gap-2 px-3 text-xs text-amber-700">
      <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {minutes(layover.duration)} layover at {layover.name} ({layover.id})
      {layover.is_overnight ? ' · overnight' : ''}
    </div>
  );
}

/** Expanded details for a flight option, with Outbound / Return split. */
function FlightDetails({
  option,
  arrivalId,
  currency,
}: {
  option: SearchApiFlightOption;
  arrivalId: string;
  currency: string;
}) {
  const { outbound, return: returnLegs } = splitItinerary(option, arrivalId);
  const emissions = option.carbon_emissions;
  const isRoundTrip = option.type?.toLowerCase().includes('round');

  const renderLegs = (legs: SearchApiFlightSegment[], prefix: string) => (
    <div className="space-y-3">
      {legs.map((leg, index) => (
        <div key={`${prefix}-${leg.flight_number}-${index}`}>
          <FlightLeg leg={leg} />
          {option.layovers?.[index] ? <LayoverRow layover={option.layovers[index]} /> : null}
        </div>
      ))}
    </div>
  );

  return (
    <div className="space-y-4">
      <section>
        <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
          <Plane className="h-4 w-4 text-primary" aria-hidden="true" />
          {isRoundTrip ? 'Outbound' : 'Itinerary'}
        </h4>
        {renderLegs(outbound, 'out')}
      </section>

      {isRoundTrip ? (
        <section>
          <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
            <PlaneTakeoff className="h-4 w-4 rotate-180 text-primary" aria-hidden="true" />
            Return
          </h4>
          {returnLegs.length ? (
            renderLegs(returnLegs, 'return')
          ) : (
            <p className="rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
              Return flight included in this round-trip fare. Return schedule is provided by the
              booking partner after selecting this option.
            </p>
          )}
        </section>
      ) : null}

      {emissions ? (
        <div className="rounded-lg border border-border p-3">
          <p className="mb-2 flex items-center gap-1 text-xs font-medium text-muted-foreground">
            <CircleDollarSign className="h-3 w-3" aria-hidden="true" /> Emissions
          </p>
          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="This flight" value={`${Math.round((emissions.this_flight ?? 0) / 1000)} kg`} />
            <Field
              label="Typical route"
              value={`${Math.round((emissions.typical_for_this_route ?? 0) / 1000)} kg`}
            />
            <Field label="Lowest route" value={`${Math.round((emissions.lowest_route ?? 0) / 1000)} kg`} />
            <Field label="Difference" value={`${emissions.difference_percent ?? 0}%`} />
          </div>
        </div>
      ) : null}

      {option.extensions?.length ? (
        <div className="flex flex-wrap gap-1.5">
          {option.extensions.map((extension) => (
            <Chip key={extension}>{extension}</Chip>
          ))}
        </div>
      ) : null}

      <p className="text-xs text-muted-foreground">
        Fare shown is {formatPrice(option.price, currency)} total for the selected itinerary.
      </p>
    </div>
  );
}

/** One flight result card with independent, local expand/collapse state. */
function FlightOptionCard({
  option,
  currency,
  arrivalId,
}: {
  option: SearchApiFlightOption;
  currency: string;
  arrivalId: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <FlightSummary option={option} currency={currency} />
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className="flex items-center gap-1 rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
        >
          {open ? 'View less' : 'View details'}
          <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} aria-hidden="true" />
        </button>
      </div>
      {open ? (
        <div className="border-t border-border p-4">
          <FlightDetails option={option} arrivalId={arrivalId} currency={currency} />
        </div>
      ) : null}
    </Card>
  );
}

/** Compact price-insight strip. */
function PriceInsightsStrip({ insights, currency }: { insights: NonNullable<FlightSearchResponse['price_insights']>; currency: string }) {
  const lowest = insights.lowest_price !== undefined ? formatPrice(insights.lowest_price, currency) : null;
  const typical = insights.typical_price_range
    ? `${formatPrice(insights.typical_price_range.low_price, currency)}–${formatPrice(insights.typical_price_range.high_price, currency)}`
    : null;
  const level = insights.price_level ? insights.price_level.charAt(0).toUpperCase() + insights.price_level.slice(1) : null;
  if (!lowest && !typical && !level) return null;
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-sm">
        {level ? (
          <span className="flex items-center gap-1.5 text-foreground">
            <CircleDollarSign className="h-4 w-4 text-primary" aria-hidden="true" />
            Price insight: <span className="font-medium">{level}</span>
          </span>
        ) : null}
        {lowest ? (
          <span className="text-muted-foreground">
            <span className="font-medium text-foreground">{lowest}</span> lowest
          </span>
        ) : null}
        {typical ? (
          <span className="text-muted-foreground">
            Typical {typical}
          </span>
        ) : null}
      </div>
    </Card>
  );
}

function FlightResults({ data, currency }: { data: FlightSearchResponse; currency: string }) {
  const arrivalId = useMemo(() => {
    const sp = data.search_parameters;
    const id = (sp as Record<string, unknown> | undefined)?.arrival_id;
    return typeof id === 'string' ? id : '';
  }, [data]);
  const all = useMemo(
    () => [...(data.best_flights ?? []), ...(data.other_flights ?? [])],
    [data],
  );
  const insights = data.price_insights;

  return (
    <div className="space-y-4">
      {insights ? <PriceInsightsStrip insights={insights} currency={currency} /> : null}

      {all.length ? (
        <div className="space-y-3">
          {all.map((option, index) => (
            <FlightOptionCard
              key={option.departure_token ?? option.booking_token ?? index}
              option={option}
              currency={currency}
              arrivalId={arrivalId}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={Plane}
          title="No flights found for these dates"
          description="Try different airports or dates."
        />
      )}

      <DevRawResponse label="Full flight API response (dev)" data={data} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hotels
// ---------------------------------------------------------------------------

interface HotelForm {
  destination: HotelDestination | null;
  destinationText: string;
  check_in_date: string;
  check_out_date: string;
  adults: number;
  rooms: number;
}

/** Derive a canonical destination from an autocomplete location suggestion. */
function destinationFromSuggestion(
  title: string,
  subtitle: string | undefined,
  kgmid: string | undefined,
): HotelDestination {
  const displayName = title.trim();
  let country: string | undefined;
  let region: string | undefined;
  const lower = (subtitle ?? '').toLowerCase();

  if (lower.startsWith('country in ')) {
    // e.g. "Country in Asia" -> the place itself is a country (Singapore)
    country = displayName;
  } else {
    // e.g. "City in India", "Capital of India", "City in the United Arab Emirates"
    const match = /in (.+)$/.exec(subtitle ?? '');
    const remainder = match?.[1]?.trim();
    const continent = /^(asia|europe|africa|north america|south america|australia|oceania|antarctica)$/i;
    if (remainder && !continent.test(remainder)) {
      country = remainder;
    } else if (remainder && continent.test(remainder)) {
      // e.g. "Country in Asia" handled above; treat region-only subtitle as no country
      region = remainder;
    }
  }

  const searchQuery = country ? `Hotels in ${displayName}, ${country}` : `Hotels in ${displayName}`;
  const destination: HotelDestination = {
    displayName,
    searchQuery,
    city: displayName,
  };
  if (region) destination.region = region;
  if (country) destination.country = country;
  if (kgmid) destination.kgmid = kgmid;
  return destination;
}

/** Destination input with autocomplete suggestions. */
function HotelDestinationInput({
  value,
  onSelect,
  onText,
}: {
  value: HotelDestination | null;
  onSelect: (destination: HotelDestination) => void;
  onText: (text: string) => void;
}) {
  const [text, setText] = useState(value?.displayName ?? '');
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const auto = useHotelAutocomplete(text);

  const suggestions = useMemo(() => {
    const items = auto.data?.suggestions ?? [];
    // Location matches: the provider labels places as `airport` with a kgmid.
    return items
      .filter((s) => s.type === 'airport' && s.kgmid && s.title)
      .map((s) => ({
        title: s.title as string,
        subtitle: s.subtitle,
        kgmid: s.kgmid as string,
      }))
      .slice(0, 6);
  }, [auto.data]);

  const select = (destination: HotelDestination) => {
    setText(destination.displayName);
    setOpen(false);
    onSelect(destination);
  };

  return (
    <div className="relative" ref={boxRef}>
      <label className="block space-y-1.5 text-sm font-medium text-foreground">
        Where
        <input
          aria-label="Destination"
          className={inputClass}
          placeholder="e.g. Delhi, Mumbai, Singapore"
          value={text}
          autoComplete="off"
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onChange={(event) => {
            const next = event.target.value;
            setText(next);
            // Any edit invalidates the previously selected canonical destination.
            onText(next);
            setOpen(true);
          }}
        />
      </label>

      {open && text.trim().length >= 2 && (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-border bg-popover shadow-popover">
          {auto.isFetching ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">Searching destinations…</div>
          ) : suggestions.length ? (
            <ul role="listbox">
              {suggestions.map((s) => (
                <li key={s.kgmid}>
                  <button
                    type="button"
                    role="option"
                    onMouseDown={(event) => {
                      event.preventDefault();
                      select(destinationFromSuggestion(s.title, s.subtitle, s.kgmid));
                    }}
                    className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm hover:bg-muted"
                  >
                    <span className="font-medium text-foreground">{s.title}</span>
                    {s.subtitle ? (
                      <span className="text-xs text-muted-foreground">{s.subtitle}</span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : auto.isError ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">No suggestions.</div>
          ) : (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              Keep typing or press Search to use &quot;{text}&quot;.
            </div>
          )}
        </div>
      )}

      {value ? (
        <p className="mt-1 text-xs text-muted-foreground">{value.searchQuery}</p>
      ) : null}
    </div>
  );
}

function HotelFormFields({
  form,
  currency,
  onCurrency,
  onChange,
  onSubmit,
  submitting,
}: {
  form: HotelForm;
  currency: string;
  onCurrency: (currency: string) => void;
  onChange: (patch: Partial<HotelForm>) => void;
  onSubmit: () => void;
  submitting: boolean;
}) {
  return (
    <Card>
      <form
        className="space-y-4 p-4"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <FormGroup title="Destination">
          <div className="sm:col-span-2">
            <HotelDestinationInput
              value={form.destination}
              onSelect={(destination) => onChange({ destination, destinationText: destination.displayName })}
              onText={(text) => onChange({ destination: null, destinationText: text })}
            />
          </div>
        </FormGroup>

        <FormGroup title="Dates">
          <label className="block space-y-1.5 text-sm font-medium text-foreground">
            Check-in
            <input
              aria-label="Check-in date"
              type="date"
              className={inputClass}
              value={form.check_in_date}
              onChange={(event) => onChange({ check_in_date: event.target.value })}
            />
          </label>
          <label className="block space-y-1.5 text-sm font-medium text-foreground">
            Check-out
            <input
              aria-label="Check-out date"
              type="date"
              className={inputClass}
              value={form.check_out_date}
              onChange={(event) => onChange({ check_out_date: event.target.value })}
            />
          </label>
        </FormGroup>

        <FormGroup title="Guests">
          <label className="block space-y-1.5 text-sm font-medium text-foreground">
            Adults
            <input
              aria-label="Adults"
              type="number"
              min={1}
              max={9}
              className={inputClass}
              value={form.adults}
              onChange={(event) => onChange({ adults: Number(event.target.value) || 1 })}
            />
          </label>
          <label className="block space-y-1.5 text-sm font-medium text-foreground">
            Rooms
            <input
              aria-label="Rooms"
              type="number"
              min={1}
              max={9}
              className={inputClass}
              value={form.rooms}
              onChange={(event) => onChange({ rooms: Number(event.target.value) || 1 })}
            />
          </label>
        </FormGroup>

        <FormGroup title="Options">
          <label className="block space-y-1.5 text-sm font-medium text-foreground">
            Currency
            <select
              aria-label="Currency"
              className={inputClass}
              value={currency}
              onChange={(event) => onCurrency(event.target.value)}
            >
              {CURRENCIES.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
        </FormGroup>

        <div>
          <Button type="submit" isLoading={submitting}>
            {!submitting && <Search className="h-4 w-4" aria-hidden="true" />}
            Search hotels
          </Button>
        </div>
      </form>
    </Card>
  );
}

/** Human-readable accommodation type label. */
function propertyTypeLabel(type: string | undefined): string {
  if (!type) return 'Property';
  if (type === 'hotel') return 'Hotel';
  if (type === 'vacation_rental') return 'Vacation rental';
  const pretty = type.replace(/_/g, ' ');
  return pretty.charAt(0).toUpperCase() + pretty.slice(1);
}

/**
 * Image carousel.
 *
 * For each image, prefer `original`, fall back to `thumbnail`, then move to the
 * next image. Only shows "No images available" once every candidate has failed
 * or the property genuinely has no images. Navigation is local state only.
 */
function PropertyImages({ property }: { property: SearchApiHotelProperty }) {
  // Each image object -> ordered candidate URLs (original first, then thumbnail).
  const images = useMemo(() => {
    const list: string[][] = [];
    for (const image of property.images ?? []) {
      const candidates: string[] = [];
      if (image.original) candidates.push(image.original);
      if (image.thumbnail && image.thumbnail !== image.original) candidates.push(image.thumbnail);
      if (candidates.length) list.push(candidates);
    }
    return list;
  }, [property.images]);

  const [index, setIndex] = useState(0);
  const [failed, setFailed] = useState<Set<string>>(new Set());

  const [seenToken, setSeenToken] = useState<string>(property.property_token ?? '');
  if ((property.property_token ?? '') !== seenToken) {
    setSeenToken(property.property_token ?? '');
    setIndex(0);
    setFailed(new Set());
  }

  // Images that still have at least one non-failed candidate.
  const validImages = useMemo(
    () =>
      images
        .map((candidates, i) => ({ candidates, i }))
        .filter(({ candidates }) => candidates.some((url) => !failed.has(url))),
    [images, failed],
  );

  const shownIndex = validImages.length ? Math.min(index, validImages.length - 1) : -1;
  const shown = shownIndex >= 0 ? validImages[shownIndex] : undefined;
  const currentUrl = shown?.candidates.find((url) => !failed.has(url)) ?? shown?.candidates[0];

  const goTo = (next: number) => {
    if (!validImages.length) return;
    const target = ((next % validImages.length) + validImages.length) % validImages.length;
    setIndex(target);
  };

  const onError = () => {
    if (!currentUrl) return;
    const nextFailed = new Set(failed).add(currentUrl);
    setFailed(nextFailed);
    // If the current image still has another candidate, keep it; otherwise the
    // next valid image is shown automatically on the next render.
  };

  const single = validImages.length <= 1;

  return (
    <div className="relative h-44 w-full overflow-hidden bg-muted sm:h-40 md:h-full">
      {currentUrl ? (
        <img
          src={currentUrl}
          alt={property.name ?? 'Property'}
          className="h-full w-full object-cover"
          loading="lazy"
          onError={onError}
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted-foreground">
          <Hotel className="h-8 w-8" aria-hidden="true" />
          <span className="px-3 text-center text-xs">No images available</span>
        </div>
      )}

      {!single && currentUrl && (
        <>
          <button
            type="button"
            aria-label="Previous image"
            onClick={() => goTo(index - 1)}
            className="absolute left-1.5 top-1/2 -translate-y-1/2 rounded-full bg-black/45 p-1.5 text-white shadow transition-colors hover:bg-black/65 focus:outline-none focus:ring-2 focus:ring-white/60"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="Next image"
            onClick={() => goTo(index + 1)}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full bg-black/45 p-1.5 text-white shadow transition-colors hover:bg-black/65 focus:outline-none focus:ring-2 focus:ring-white/60"
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
          <span className="absolute right-2 top-2 rounded-full bg-black/55 px-2 py-0.5 text-xs font-medium text-white">
            {shownIndex + 1} / {validImages.length}
          </span>
          <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1 rounded-full bg-black/45 px-2 py-1">
            {validImages.map(({ i }, dotIndex) => (
              <button
                key={i}
                type="button"
                aria-label={`Image ${dotIndex + 1}`}
                onClick={() => goTo(dotIndex)}
                className={cn(
                  'h-1.5 rounded-full transition-all',
                  i === validImages[shownIndex]?.i ? 'w-4 bg-white' : 'w-1.5 bg-white/60',
                )}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function PriceBlock({
  label,
  price,
}: {
  label: string;
  price: SearchApiPrice | undefined;
}) {
  if (!price) return null;
  const hasDeal = price.price_before_taxes && price.price_before_taxes !== price.price;
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-base font-semibold text-foreground">
        {formatPriceString(price.price)}
        {hasDeal ? (
          <span className="ml-1.5 text-sm font-normal text-muted-foreground line-through">
            {formatPriceString(price.price_before_taxes)}
          </span>
        ) : null}
      </p>
    </div>
  );
}

function RatingBar({ value, label }: { value: number | undefined; label: string }) {
  if (value === undefined) return null;
  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium text-foreground">{value}</span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded bg-muted">
        <div
          className="h-full rounded bg-primary"
          style={{ width: `${Math.max(0, Math.min(100, (value / 5) * 100))}%` }}
        />
      </div>
    </div>
  );
}

function ReviewBreakdown({ items }: { items: SearchApiReviewBreakdown[] }) {
  if (!items.length) return null;
  return (
    <div className="mt-3 border-t border-border pt-3">
      <p className="mb-2 text-xs font-medium text-muted-foreground">Reviews breakdown</p>
      <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
        {items.map((item) => (
          <div key={item.name ?? item.description} className="text-xs">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{item.name}</span>
              <span className="text-muted-foreground/70">{item.total ?? 0} reviews</span>
            </div>
            <div className="mt-1 flex gap-3 text-[11px]">
              <span className="text-emerald-600">{item.positive ?? 0} positive</span>
              <span className="text-muted-foreground/70">{item.neutral ?? 0} neutral</span>
              <span className="text-red-500">{item.negative ?? 0} negative</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Expandable secondary details for a hotel property. */
function HotelDetails({ property }: { property: SearchApiHotelProperty }) {
  return (
    <div className="grid gap-4 border-t border-border p-4 md:grid-cols-2 lg:grid-cols-3">
      <div className="space-y-1.5">
        <Field label="Accommodation" value={propertyTypeLabel(property.type)} />
        <Field label="Check-in" value={property.check_in_time} />
        <Field label="Check-out" value={property.check_out_time} />
        <Field
          label="Coordinates"
          value={
            property.gps_coordinates
              ? `${property.gps_coordinates.latitude}, ${property.gps_coordinates.longitude}`
              : undefined
          }
        />
        {property.essential_info?.length ? (
          <>
            <p className="pt-1 text-xs font-medium text-muted-foreground">Room & property</p>
            <div className="flex flex-wrap gap-1.5">
              {property.essential_info.map((info) => (
                <Chip key={info}>{info}</Chip>
              ))}
            </div>
          </>
        ) : null}
      </div>

      <div>
        {property.amenities?.length ? (
          <>
            <p className="mb-1.5 flex items-center gap-1 text-xs font-medium text-muted-foreground">
              <Wifi className="h-3 w-3" aria-hidden="true" /> All amenities
            </p>
            <div className="flex flex-wrap gap-1.5">
              {property.amenities.map((amenity) => (
                <Chip key={amenity}>{amenity}</Chip>
              ))}
            </div>
          </>
        ) : null}
        {property.excluded_amenities?.length ? (
          <>
            <p className="mb-1.5 mt-3 text-xs font-medium text-muted-foreground">Not available</p>
            <div className="flex flex-wrap gap-1.5">
              {property.excluded_amenities.map((amenity) => (
                <span
                  key={amenity}
                  className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground/70 line-through"
                >
                  {amenity}
                </span>
              ))}
            </div>
          </>
        ) : null}
      </div>

      <div>
        {property.nearby_places?.length ? (
          <>
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">Nearby places</p>
            <div className="space-y-1">
              {property.nearby_places.map((place) => (
                <div key={place.name} className="flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="font-medium text-foreground">{place.name}</span>
                  {(place.transportations ?? []).map((transport, index) => (
                    <span key={`${place.name}-${index}`} className="text-muted-foreground/80">
                      {transport.type}: {transport.duration}
                    </span>
                  ))}
                </div>
              ))}
            </div>
          </>
        ) : null}
      </div>

      <div className="md:col-span-2 lg:col-span-3">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-lg border border-border p-3">
            <p className="mb-2 flex items-center gap-1 text-xs font-medium text-muted-foreground">
              <Users className="h-3 w-3" aria-hidden="true" /> Guest ratings
            </p>
            <div className="space-y-2">
              <RatingBar label="Location" value={property.location_rating} />
              <RatingBar label="Things to do" value={property.proximity_to_things_to_do_rating} />
              <RatingBar label="Transit" value={property.proximity_to_transit_rating} />
              <RatingBar label="Airport access" value={property.airport_access_rating} />
            </div>
            <ReviewBreakdown items={property.reviews_breakdown ?? []} />
          </div>
          {property.reviews_histogram && Object.keys(property.reviews_histogram).length ? (
            <div className="rounded-lg border border-border p-3">
              <p className="mb-2 text-xs font-medium text-muted-foreground">Review histogram</p>
              <div className="space-y-1.5">
                {[5, 4, 3, 2, 1].map((star) => {
                  const count = property.reviews_histogram?.[String(star)] ?? 0;
                  const total = property.reviews ?? 1;
                  return (
                    <div key={star} className="flex items-center gap-2 text-xs">
                      <span className="w-6 shrink-0 text-muted-foreground">{star}★</span>
                      <div className="h-1.5 flex-1 overflow-hidden rounded bg-muted">
                        <div
                          className="h-full rounded bg-amber-400"
                          style={{
                            width: `${Math.max(0, Math.min(100, (count / total) * 100))}%`,
                          }}
                        />
                      </div>
                      <span className="w-10 shrink-0 text-right text-muted-foreground">
                        {count.toLocaleString()}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** Compact hotel card: image left, key info centre, price right. */
function HotelPropertyCard({ property }: { property: SearchApiHotelProperty }) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const primaryAmenities = (property.amenities ?? []).slice(0, 6);

  return (
    <Card>
      <div className="grid md:grid-cols-[220px_1fr]">
        <PropertyImages property={property} />
        <div className="flex flex-col p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-semibold text-foreground">{property.name}</h3>
                <Stars count={property.extracted_hotel_class} />
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                {property.rating ? (
                  <span className="flex items-center gap-1">
                    <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" aria-hidden="true" />
                    <span className="font-medium text-foreground">{property.rating}</span>
                    {property.reviews ? (
                      <span className="text-muted-foreground/80">
                        ({property.reviews.toLocaleString()})
                      </span>
                    ) : null}
                  </span>
                ) : null}
                {property.city ? (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" aria-hidden="true" />
                    {property.city}
                    {property.country ? `, ${property.country}` : ''}
                  </span>
                ) : null}
                <Badge variant="secondary">{propertyTypeLabel(property.type)}</Badge>
              </div>
            </div>
            {property.deal ? (
              <Badge variant="success">
                <Flame className="h-3 w-3" aria-hidden="true" />
                {property.deal}
              </Badge>
            ) : null}
          </div>

          {property.description ? (
            <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{property.description}</p>
          ) : null}

          {primaryAmenities.length ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {primaryAmenities.map((amenity) => (
                <Chip key={amenity}>{amenity}</Chip>
              ))}
              {property.amenities && property.amenities.length > primaryAmenities.length ? (
                <Chip>{`+${property.amenities.length - primaryAmenities.length} more`}</Chip>
              ) : null}
            </div>
          ) : null}

          <div className="mt-3 flex flex-wrap items-end justify-between gap-3 border-t border-border pt-3">
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              <PriceBlock label="Per night" price={property.price_per_night} />
              <PriceBlock label="Total stay" price={property.total_price} />
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" aria-hidden="true" />
                {property.check_in_time ?? '—'} / {property.check_out_time ?? '—'}
              </span>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-4">
              {property.link ? (
                <a
                  href={property.link}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                >
                  View on provider <ArrowRight className="h-3 w-3" aria-hidden="true" />
                </a>
              ) : null}
              <button
                type="button"
                onClick={() => setDetailsOpen((value) => !value)}
                aria-expanded={detailsOpen}
                className="flex items-center gap-1 rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
              >
                {detailsOpen ? 'View less' : 'View details'}
                <ChevronDown className={cn('h-4 w-4 transition-transform', detailsOpen && 'rotate-180')} aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      </div>
      {detailsOpen ? <HotelDetails property={property} /> : null}
    </Card>
  );
}

/** Sequential pagination for token-based hotel results. */
function HotelPaginationFooter({
  currentPage,
  loadedPages,
  hasNext,
  isLoading,
  onPage,
}: {
  currentPage: number;
  loadedPages: number[];
  hasNext: boolean;
  isLoading: boolean;
  onPage: (page: number) => void;
}) {
  const pageButton =
    'inline-flex h-9 min-w-9 items-center justify-center rounded-lg border px-3 text-sm font-medium transition-colors';
  return (
    <nav aria-label="Hotel pagination" className="flex flex-wrap items-center justify-center gap-1.5 pt-2">
      <button
        type="button"
        disabled={currentPage <= 1}
        onClick={() => onPage(currentPage - 1)}
        className={cn(
          pageButton,
          'border-slate-300 text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50',
        )}
      >
        Previous
      </button>
      {loadedPages.map((page) => (
        <button
          key={page}
          type="button"
          aria-current={page === currentPage ? 'page' : undefined}
          onClick={() => onPage(page)}
          className={cn(
            pageButton,
            page === currentPage
              ? 'border-brand-600 bg-brand-600 text-white'
              : 'border-slate-300 text-slate-700 hover:bg-slate-50',
          )}
        >
          {page}
        </button>
      ))}
      {hasNext ? (
        <button
          type="button"
          disabled={isLoading}
          onClick={() => onPage(currentPage + 1)}
          className={cn(
            pageButton,
            'border-slate-300 text-brand-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50',
          )}
        >
          {isLoading ? 'Loading…' : 'Next'}
        </button>
      ) : null}
    </nav>
  );
}

function HotelResults({ baseParams }: { baseParams: HotelSearchParams }) {
  const paged = useHotelPagedSearch(baseParams);
  const page1 = paged.page1;
  const pageData = paged.pageData(paged.currentPage);

  const providerTotal = paged.totalResults;
  const loadedCount = paged.loadedCount;
  const pageSize = pageData?.properties?.length ?? 0;
  const from = paged.currentPage === 1 ? 1 : (paged.currentPage - 1) * 20 + 1;
  const to = from + pageSize - 1;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span className="flex items-center gap-1.5 text-foreground">
          <Building2 className="h-4 w-4 text-primary" aria-hidden="true" />
          <span className="font-medium">{loadedCount.toLocaleString('en-IN')}</span> properties loaded
        </span>
        {providerTotal !== undefined && providerTotal > loadedCount ? (
          <span className="text-muted-foreground">
            {providerTotal.toLocaleString('en-IN')} available from provider
          </span>
        ) : null}
      </div>

      {page1.isError ? (
        <Alert tone="error">We couldn&apos;t load hotels. Please try again.</Alert>
      ) : paged.pageError ? (
        <Alert tone="error">{paged.pageError}</Alert>
      ) : pageData && pageData.properties?.length ? (
        <>
          {loadedCount > 0 && pageSize > 0 && (
            <p className="text-sm text-muted-foreground">
              Showing {from}–{to} of {loadedCount.toLocaleString('en-IN')} loaded
            </p>
          )}
          <div className="space-y-3">
            {(pageData.properties ?? []).map((property) => (
              <HotelPropertyCard
                key={property.property_token ?? property.data_id ?? property.name}
                property={property}
              />
            ))}
          </div>
          <HotelPaginationFooter
            currentPage={paged.currentPage}
            loadedPages={paged.loadedPages}
            hasNext={paged.hasNext}
            isLoading={paged.isLoadingPage}
            onPage={(page) => void paged.goToPage(page)}
          />
        </>
      ) : page1.isFetching ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />
            Searching hotels…
          </div>
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : (
        <EmptyState
          icon={Hotel}
          title="No hotels found for this destination"
          description="Try a different destination or dates."
        />
      )}

      {pageData ? <DevRawResponse label="Full hotel API response (dev)" data={pageData} /> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

type SearchTab = 'flights' | 'hotels';

const initialFlightForm: FlightForm = {
  departure_id: '',
  arrival_id: '',
  outbound_date: '',
  return_date: '',
  round_trip: true,
  adults: 1,
  travel_class: 'economy',
  stops: 'any',
};

const initialHotelForm: HotelForm = {
  destination: null,
  destinationText: '',
  check_in_date: '',
  check_out_date: '',
  adults: 2,
  rooms: 1,
};

function formatDateRange(from: string, to: string | undefined): string {
  if (!from) return '—';
  const base = new Date(`${from}T00:00:00`);
  if (Number.isNaN(base.getTime())) return from;
  const toDate = to ? new Date(`${to}T00:00:00`) : null;
  if (!toDate || Number.isNaN(toDate.getTime())) return from;
  const fmt = (d: Date) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  return `${fmt(base)} – ${fmt(toDate)}`;
}

function SearchSummary({
  tab,
  flightQuery,
  hotelParams,
}: {
  tab: SearchTab;
  flightQuery: FlightSearchParams | null;
  hotelParams: HotelSearchParams | null;
}) {
  if (tab === 'flights' && flightQuery) {
    const classLabel = flightQuery.travel_class?.replace(/_/g, ' ') ?? 'Economy';
    return (
      <p className="text-sm text-muted-foreground">
        <span className="font-semibold text-foreground">
          {flightQuery.departure_id} → {flightQuery.arrival_id}
        </span>
        <span className="mx-2">·</span>
        {formatDateRange(flightQuery.outbound_date, flightQuery.return_date)}
        <span className="mx-2">·</span>
        {flightQuery.adults ?? 1} {flightQuery.adults === 1 ? 'adult' : 'adults'}
        <span className="mx-2">·</span>
        {classLabel.charAt(0).toUpperCase() + classLabel.slice(1)}
      </p>
    );
  }
  if (tab === 'hotels' && hotelParams) {
    const destination = destinationFromParam(hotelParams.destination);
    return (
      <p className="text-sm text-muted-foreground">
        <span className="font-semibold text-foreground">{destination.displayName}</span>
        <span className="mx-2">·</span>
        {formatDateRange(hotelParams.check_in_date, hotelParams.check_out_date)}
        <span className="mx-2">·</span>
        {hotelParams.adults ?? 2} {hotelParams.adults === 1 ? 'adult' : 'adults'}
        <span className="mx-2">·</span>
        {hotelParams.rooms ?? 1} {hotelParams.rooms === 1 ? 'room' : 'rooms'}
      </p>
    );
  }
  return null;
}

export function TravelSearchPage() {
  const [tab, setTab] = useState<SearchTab>('flights');
  const [currency, setCurrency] = useState<string>(SEARCH_DEFAULT_CURRENCY);
  const [flightForm, setFlightForm] = useState<FlightForm>(initialFlightForm);
  const [hotelForm, setHotelForm] = useState<HotelForm>(initialHotelForm);
  const [flightQuery, setFlightQuery] = useState<FlightSearchParams | null>(null);
  const [hotelQuery, setHotelQuery] = useState<HotelSearchParams | null>(null);
  const queryClient = useQueryClient();

  const flights = useFlightSearch(
    flightQuery ?? { departure_id: '', arrival_id: '', outbound_date: '' },
  );

  const submitFlights = () => {
    const query: FlightSearchParams = {
      departure_id: flightForm.departure_id.trim().toUpperCase(),
      arrival_id: flightForm.arrival_id.trim().toUpperCase(),
      outbound_date: flightForm.outbound_date,
      type: flightForm.round_trip ? 2 : 1,
      adults: flightForm.adults,
      travel_class: flightForm.travel_class,
      stops: flightForm.stops,
      currency,
    };
    if (flightForm.round_trip && flightForm.return_date) {
      query.return_date = flightForm.return_date;
    }
    setFlightQuery(query);
  };

  const submitHotels = () => {
    // Destination is the canonical selection; fall back to the typed text if no
    // autocomplete choice was made (backend still builds an explicit query).
    const typed = hotelForm.destinationText.trim();
    const destination =
      hotelForm.destination ?? {
        displayName: typed || 'Destination',
        searchQuery: `Hotels in ${typed || 'Destination'}`,
      };
    setHotelQuery({
      destination: destinationToParam(destination),
      check_in_date: hotelForm.check_in_date,
      check_out_date: hotelForm.check_out_date,
      adults: hotelForm.adults,
      rooms: hotelForm.rooms,
      currency,
    });
  };

  const searching = tab === 'flights' ? flights.isFetching : Boolean(hotelQuery && !hotelQuery.destination);
  const results = tab === 'flights' ? (flights.data ?? null) : null;
  const isError = tab === 'flights' ? flights.isError : false;
  const searchLabel = tab === 'flights' ? 'flights' : 'hotels';

  const refresh = () => {
    if (tab === 'flights') {
      if (flightQuery) void queryClient.refetchQueries({ queryKey: ['search', 'flights', flightQuery] });
    }
  };

  const canRefresh = tab === 'flights' ? Boolean(flightQuery) : Boolean(hotelQuery);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Live travel search"
        description="Search live flights and hotels and see every field the provider returns."
        actions={
          <Button size="sm" variant="secondary" onClick={refresh} disabled={!canRefresh}>
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Refresh
          </Button>
        }
      />

      <div role="tablist" className="flex w-fit rounded-lg border border-border bg-card p-1 shadow-sm">
        {(
          [
            ['flights', 'Flights', Plane],
            ['hotels', 'Hotels', Hotel],
          ] as const
        ).map(([key, label, Icon]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cn(
              'flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors',
              tab === key
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>

      {tab === 'flights' ? (
        <FlightFormFields
          form={flightForm}
          currency={currency}
          onCurrency={setCurrency}
          onChange={(patch) => setFlightForm((current) => ({ ...current, ...patch }))}
          onSubmit={submitFlights}
          submitting={searching}
        />
      ) : (
        <HotelFormFields
          form={hotelForm}
          currency={currency}
          onCurrency={setCurrency}
          onChange={(patch) => setHotelForm((current) => ({ ...current, ...patch }))}
          onSubmit={submitHotels}
          submitting={false}
        />
      )}

      <SearchSummary tab={tab} flightQuery={flightQuery} hotelParams={hotelQuery} />

      {tab === 'flights' ? (
        searching && !results ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />
              Searching {searchLabel}…
            </div>
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : isError ? (
          <Alert tone="error">We couldn&apos;t load {searchLabel}. Please try again.</Alert>
        ) : results ? (
          <FlightResults data={results as FlightSearchResponse} currency={currency} />
        ) : (
          <EmptyState
            icon={Search}
            title="Search for flights"
            description="Enter airports, dates and travellers to see live flight options."
          />
        )
      ) : hotelQuery ? (
        <HotelResults baseParams={hotelQuery} />
      ) : (
        <EmptyState
          icon={Search}
          title="Search for hotels"
          description="Enter a destination and stay dates to see live hotel options."
        />
      )}
    </div>
  );
}
