import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  Bookmark,
  Building2,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  Flame,
  Hotel,
  MapPin,
  Moon,
  Plane,
  PlaneTakeoff,
  RefreshCw,
  Search,
  Star,
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
import {
  FLIGHT_SORT_OPTIONS,
  HOTEL_AMENITY_IDS,
  HOTEL_PROPERTY_TYPE_IDS,
  HOTEL_RATING_OPTIONS,
  HOTEL_SORT_OPTIONS,
  SEARCH_DEFAULT_CURRENCY,
  flightFingerprint,
  hotelFingerprint,
  hotelStayNights,
} from '@interscale/shared';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/utils/cn';
import { resolveHotelImageCandidates } from '@/features/search/hotel-images';
import { formatFlightDate, formatFlightTime } from './flight-format';
import { resolveHotelPrice } from './hotel-price';
import {
  useBookmarks,
  useCreateBookmark,
  useFlightSearch,
  useReturnFlightSearch,
  destinationFromParam,
  destinationToParam,
  type FlightSearchParams,
  type HotelDestination,
  type HotelSearchParams,
} from '@/features/search/search.api';
import { useHotelPagedSearch } from '@/features/search/hotel-pagination';
import { useCities, useDestinations, useHotels } from '@/features/masters/masters.api';

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
 * Bookmark a cached result. The snapshot is built from the already-rendered
 * option/property object — clicking Bookmark never triggers a SearchAPI call.
 */
function BookmarkButton({
  type,
  searchParams,
  snapshot,
  fingerprint,
}: {
  type: 'FLIGHT' | 'HOTEL';
  searchParams: Record<string, unknown>;
  snapshot: unknown;
  fingerprint: string;
}) {
  const create = useCreateBookmark();
  const { data: bookmarks } = useBookmarks();
  const [pendingSaved, setPendingSaved] = useState<Set<string>>(() => new Set());
  const [savedCode, setSavedCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bookmarkedFingerprints = useMemo(() => {
    const set = new Set<string>(pendingSaved);
    if (Array.isArray(bookmarks)) {
      for (const bookmark of bookmarks) set.add(bookmark.fingerprint);
    }
    return set;
  }, [bookmarks, pendingSaved]);

  const saved = bookmarkedFingerprints.has(fingerprint);

  const onSave = () => {
    if (saved) return;
    create.mutate(
      {
        type,
        searchParams,
        snapshot: { raw: snapshot },
      },
      {
        onSuccess: (result) => {
          setError(null);
          setPendingSaved((prev) => new Set(prev).add(fingerprint));
          setSavedCode(result.bookmark.bookmarkCode);
        },
        onError: (err) => {
          setError(err instanceof Error ? err.message : 'Could not save bookmark.');
        },
      },
    );
  };

  const copyCode = async () => {
    if (!savedCode) return;
    try {
      await navigator.clipboard.writeText(savedCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable; ignore.
    }
  };

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={onSave}
        disabled={create.isPending}
        aria-pressed={saved}
        aria-label={saved ? 'Bookmarked' : 'Bookmark'}
        title={saved ? 'Bookmarked' : 'Bookmark'}
        className={cn(
          'inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-medium transition-colors',
          saved
            ? 'border-primary bg-primary/10 text-primary'
            : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground',
        )}
      >
        <Bookmark className={cn('h-3.5 w-3.5', saved && 'fill-current')} aria-hidden="true" />
        {saved ? 'Bookmarked' : 'Bookmark'}
      </button>
      {savedCode ? (
        <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="font-medium text-foreground">{savedCode}</span>
          <button
            type="button"
            aria-label={`Copy bookmark ID ${savedCode}`}
            title="Copy bookmark ID"
            onClick={copyCode}
            className="inline-flex items-center gap-1 rounded border border-border px-1 py-0.5 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {copied ? (
              <Check className="h-3 w-3" aria-hidden="true" />
            ) : (
              <Copy className="h-3 w-3" aria-hidden="true" />
            )}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </span>
      ) : null}
      {error ? <span className="text-xs text-red-600">{error}</span> : null}
    </div>
  );
}

/** Development-only accordion showing the raw cached provider response. */
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
        <ChevronDown
          className={cn('h-4 w-4 transition-transform', open && 'rotate-180')}
          aria-hidden="true"
        />
      </button>
      {open ? (
        <pre className="max-h-96 overflow-auto border-t border-border bg-muted/40 p-4 text-xs leading-relaxed text-muted-foreground">
          {JSON.stringify(data, null, 2)}
        </pre>
      ) : null}
    </div>
  );
}

/** A collapsible "Advanced filters" section used by both forms. */
function AdvancedFilters({
  open,
  onToggle,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted/40"
      >
        <span>Advanced filters</span>
        <ChevronDown
          className={cn('h-4 w-4 transition-transform', open && 'rotate-180')}
          aria-hidden="true"
        />
      </button>
      {open ? (
        <div className="grid gap-3 border-t border-border p-3 sm:grid-cols-2 lg:grid-cols-3">
          {children}
        </div>
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
  children: number;
  infants_in_seat: number;
  infants_on_lap: number;
  travel_class: string;
  stops: string;
  sort_by: string;
  included_airlines: string;
  excluded_airlines: string;
  max_price: string;
  carry_on_bags: string;
  checked_bags: string;
  outbound_dep_start: string;
  outbound_dep_end: string;
  outbound_arr_start: string;
  outbound_arr_end: string;
  return_dep_start: string;
  return_dep_end: string;
  return_arr_start: string;
  return_arr_end: string;
  max_duration: string;
  layover_min: string;
  layover_max: string;
  included_connecting: string;
  excluded_connecting: string;
  low_emissions: boolean;
}

function FormGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h4>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </div>
  );
}

/** Build "start,end,start,end" hour range string or undefined. */
function timeRange(
  depStart: string,
  depEnd: string,
  arrStart: string,
  arrEnd: string,
): string | undefined {
  const parts = [depStart, depEnd, arrStart, arrEnd];
  if (parts.every((p) => p.trim() !== '')) return parts.map((p) => p.trim()).join(',');
  return undefined;
}

function FlightFormFields({
  form,
  currency,
  onCurrency,
  onChange,
  onSubmit,
  submitting,
  error,
  returnDateError,
}: {
  form: FlightForm;
  currency: string;
  onCurrency: (currency: string) => void;
  onChange: (patch: Partial<FlightForm>) => void;
  onSubmit: () => void;
  submitting: boolean;
  error?: string | null;
  returnDateError?: string | null;
}) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  return (
    <Card>
      <form
        className="space-y-3 p-4"
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

        <FormGroup title="Trip">
          <label className="block space-y-1.5 text-sm font-medium text-foreground">
            Trip type
            <select
              aria-label="Trip type"
              className={inputClass}
              value={form.round_trip ? 'round' : 'one'}
              onChange={(event) => {
                const round = event.target.value === 'round';
                // Switching to one-way drops any stale return date so it never
                // leaks into the submitted search or the cache key.
                onChange(round ? { round_trip: true } : { round_trip: false, return_date: '' });
              }}
            >
              <option value="one">One way</option>
              <option value="round">Round trip</option>
            </select>
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
          <label className="block space-y-1.5 text-sm font-medium text-foreground">
            Return
            <input
              aria-label="Return date"
              type="date"
              disabled={!form.round_trip}
              className={inputClass}
              value={form.return_date}
              onChange={(event) => onChange({ return_date: event.target.value })}
            />
            {returnDateError ? (
              <span role="alert" className="block text-xs text-red-600">
                {returnDateError}
              </span>
            ) : null}
          </label>
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
            Children
            <input
              aria-label="Children"
              type="number"
              min={0}
              max={9}
              className={inputClass}
              value={form.children}
              onChange={(event) => onChange({ children: Number(event.target.value) || 0 })}
            />
          </label>
          <label className="block space-y-1.5 text-sm font-medium text-foreground">
            Infants (in seat)
            <input
              aria-label="Infants in seat"
              type="number"
              min={0}
              max={9}
              className={inputClass}
              value={form.infants_in_seat}
              onChange={(event) => onChange({ infants_in_seat: Number(event.target.value) || 0 })}
            />
          </label>
          <label className="block space-y-1.5 text-sm font-medium text-foreground">
            Infants (on lap)
            <input
              aria-label="Infants on lap"
              type="number"
              min={0}
              max={9}
              className={inputClass}
              value={form.infants_on_lap}
              onChange={(event) => onChange({ infants_on_lap: Number(event.target.value) || 0 })}
            />
          </label>
        </FormGroup>

        <FormGroup title="Cabin & currency">
          <label className="block space-y-1.5 text-sm font-medium text-foreground">
            Cabin class
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

        <AdvancedFilters open={advancedOpen} onToggle={() => setAdvancedOpen((v) => !v)}>
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
            Sort by
            <select
              aria-label="Sort by"
              className={inputClass}
              value={form.sort_by}
              onChange={(event) => onChange({ sort_by: event.target.value })}
            >
              {FLIGHT_SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1.5 text-sm font-medium text-foreground">
            Included airlines (codes, comma-separated)
            <input
              aria-label="Included airlines"
              className={inputClass}
              placeholder="e.g. AI,6E"
              value={form.included_airlines}
              onChange={(event) =>
                onChange({ included_airlines: event.target.value.toUpperCase() })
              }
            />
          </label>
          <label className="block space-y-1.5 text-sm font-medium text-foreground">
            Excluded airlines (codes, comma-separated)
            <input
              aria-label="Excluded airlines"
              className={inputClass}
              placeholder="e.g. EK"
              value={form.excluded_airlines}
              onChange={(event) =>
                onChange({ excluded_airlines: event.target.value.toUpperCase() })
              }
            />
          </label>
          <label className="block space-y-1.5 text-sm font-medium text-foreground">
            Max price
            <input
              aria-label="Max price"
              type="number"
              min={1}
              className={inputClass}
              placeholder="e.g. 50000"
              value={form.max_price}
              onChange={(event) => onChange({ max_price: event.target.value })}
            />
          </label>
          <label className="block space-y-1.5 text-sm font-medium text-foreground">
            Carry-on bags
            <input
              aria-label="Carry-on bags"
              type="number"
              min={0}
              max={9}
              className={inputClass}
              value={form.carry_on_bags}
              onChange={(event) => onChange({ carry_on_bags: event.target.value })}
            />
          </label>
          <label className="block space-y-1.5 text-sm font-medium text-foreground">
            Checked bags
            <input
              aria-label="Checked bags"
              type="number"
              min={0}
              max={9}
              className={inputClass}
              value={form.checked_bags}
              onChange={(event) => onChange({ checked_bags: event.target.value })}
            />
          </label>
          <label className="block space-y-1.5 text-sm font-medium text-foreground">
            Max total duration (min)
            <input
              aria-label="Max duration"
              type="number"
              min={60}
              max={2880}
              className={inputClass}
              placeholder="e.g. 720"
              value={form.max_duration}
              onChange={(event) => onChange({ max_duration: event.target.value })}
            />
          </label>
          <label className="block space-y-1.5 text-sm font-medium text-foreground">
            Min layover (min)
            <input
              aria-label="Min layover"
              type="number"
              min={30}
              max={1800}
              className={inputClass}
              value={form.layover_min}
              onChange={(event) => onChange({ layover_min: event.target.value })}
            />
          </label>
          <label className="block space-y-1.5 text-sm font-medium text-foreground">
            Max layover (min)
            <input
              aria-label="Max layover"
              type="number"
              min={30}
              max={1800}
              className={inputClass}
              value={form.layover_max}
              onChange={(event) => onChange({ layover_max: event.target.value })}
            />
          </label>
          <label className="block space-y-1.5 text-sm font-medium text-foreground">
            Include connecting airports (codes)
            <input
              aria-label="Included connecting airports"
              className={inputClass}
              placeholder="e.g. BOM"
              value={form.included_connecting}
              onChange={(event) =>
                onChange({ included_connecting: event.target.value.toUpperCase() })
              }
            />
          </label>
          <label className="block space-y-1.5 text-sm font-medium text-foreground">
            Exclude connecting airports (codes)
            <input
              aria-label="Excluded connecting airports"
              className={inputClass}
              placeholder="e.g. DXB"
              value={form.excluded_connecting}
              onChange={(event) =>
                onChange({ excluded_connecting: event.target.value.toUpperCase() })
              }
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block space-y-1.5 text-sm font-medium text-foreground">
              Outbound dep. hour from
              <input
                aria-label="Outbound departure hour from"
                type="number"
                min={0}
                max={23}
                className={inputClass}
                value={form.outbound_dep_start}
                onChange={(event) => onChange({ outbound_dep_start: event.target.value })}
              />
            </label>
            <label className="block space-y-1.5 text-sm font-medium text-foreground">
              to
              <input
                aria-label="Outbound departure hour to"
                type="number"
                min={0}
                max={23}
                className={inputClass}
                value={form.outbound_dep_end}
                onChange={(event) => onChange({ outbound_dep_end: event.target.value })}
              />
            </label>
            <label className="block space-y-1.5 text-sm font-medium text-foreground">
              Outbound arr. hour from
              <input
                aria-label="Outbound arrival hour from"
                type="number"
                min={0}
                max={23}
                className={inputClass}
                value={form.outbound_arr_start}
                onChange={(event) => onChange({ outbound_arr_start: event.target.value })}
              />
            </label>
            <label className="block space-y-1.5 text-sm font-medium text-foreground">
              to
              <input
                aria-label="Outbound arrival hour to"
                type="number"
                min={0}
                max={23}
                className={inputClass}
                value={form.outbound_arr_end}
                onChange={(event) => onChange({ outbound_arr_end: event.target.value })}
              />
            </label>
          </div>
          {form.round_trip ? (
            <div className="grid grid-cols-2 gap-2">
              <label className="block space-y-1.5 text-sm font-medium text-foreground">
                Return dep. hour from
                <input
                  aria-label="Return departure hour from"
                  type="number"
                  min={0}
                  max={23}
                  className={inputClass}
                  value={form.return_dep_start}
                  onChange={(event) => onChange({ return_dep_start: event.target.value })}
                />
              </label>
              <label className="block space-y-1.5 text-sm font-medium text-foreground">
                to
                <input
                  aria-label="Return departure hour to"
                  type="number"
                  min={0}
                  max={23}
                  className={inputClass}
                  value={form.return_dep_end}
                  onChange={(event) => onChange({ return_dep_end: event.target.value })}
                />
              </label>
              <label className="block space-y-1.5 text-sm font-medium text-foreground">
                Return arr. hour from
                <input
                  aria-label="Return arrival hour from"
                  type="number"
                  min={0}
                  max={23}
                  className={inputClass}
                  value={form.return_arr_start}
                  onChange={(event) => onChange({ return_arr_start: event.target.value })}
                />
              </label>
              <label className="block space-y-1.5 text-sm font-medium text-foreground">
                to
                <input
                  aria-label="Return arrival hour to"
                  type="number"
                  min={0}
                  max={23}
                  className={inputClass}
                  value={form.return_arr_end}
                  onChange={(event) => onChange({ return_arr_end: event.target.value })}
                />
              </label>
            </div>
          ) : null}
          <label className="flex items-center gap-2 text-sm font-medium text-foreground sm:col-span-2">
            <input
              type="checkbox"
              checked={form.low_emissions}
              onChange={(event) => onChange({ low_emissions: event.target.checked })}
              className="h-4 w-4 rounded border-input text-primary focus:ring-ring/60"
            />
            Only lower-emission flights
          </label>
        </AdvancedFilters>

        {error ? <Alert tone="error">{error}</Alert> : null}

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

type FlightCardMode = 'one-way' | 'outbound' | 'return';

function modeBadge(mode: FlightCardMode, optionType?: string): string {
  if (mode === 'outbound') return 'Outbound';
  if (mode === 'return') return 'Return';
  return optionType?.toLowerCase().includes('round') ? 'Round trip' : 'One way';
}

function modePriceLabel(mode: FlightCardMode, optionType?: string): string {
  if (mode === 'outbound') return 'Round-trip fare from';
  if (mode === 'return') return 'Round-trip total';
  return optionType?.toLowerCase().includes('round') ? 'Round-trip fare from' : 'One-way fare';
}

/** Compact summary row for a flight option (shown when collapsed). */
function FlightSummary({
  option,
  currency,
  mode = 'one-way',
}: {
  option: SearchApiFlightOption;
  currency: string;
  mode?: FlightCardMode;
}) {
  const first = option.flights[0];
  const last = option.flights[option.flights.length - 1];
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
          {first?.airline_logo ? (
            <img
              src={first.airline_logo}
              alt=""
              className="h-4 w-4 rounded-sm object-contain"
              loading="lazy"
            />
          ) : (
            <Plane className="h-4 w-4 text-primary" aria-hidden="true" />
          )}
          {first?.airline ?? '—'} · {first?.flight_number ?? '—'}
        </span>
        {first && last ? (
          <div className="mt-1">
            <p className="text-sm font-medium text-foreground">
              {first.departure_airport.id} → {last.arrival_airport.id}
            </p>
            <p className="text-sm text-foreground">
              <span className="font-medium">{formatFlightTime(first.departure_airport.time)}</span>
              <span className="mx-2 text-muted-foreground">→</span>
              <span className="text-xs text-muted-foreground">
                {minutes(option.total_duration)}
              </span>
              <span className="mx-2 text-muted-foreground">→</span>
              <span className="font-medium">{formatFlightTime(last.arrival_airport.time)}</span>
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground/80">
              {first.departure_airport.name} → {last.arrival_airport.name}
            </p>
          </div>
        ) : null}
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <Badge variant="secondary">{stopsLabel(option)}</Badge>
          <Badge variant="secondary">{option.flights[0]?.travel_class ?? '—'}</Badge>
          <Badge variant="outline">{modeBadge(mode, option.type)}</Badge>
        </div>
      </div>
      <div className="text-right">
        <p className="text-xl font-bold text-foreground">{formatPrice(option.price, currency)}</p>
        <p className="text-xs text-muted-foreground">{modePriceLabel(mode, option.type)}</p>
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
            <img
              src={leg.airline_logo}
              alt=""
              className="h-4 w-4 rounded-sm object-contain"
              loading="lazy"
            />
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
          <p className="text-lg font-semibold text-foreground">{formatFlightTime(dep.time)}</p>
          <p className="text-xs text-muted-foreground">
            {dep.id} · {formatFlightDate(dep.date)}
          </p>
          <p className="text-xs text-muted-foreground/80">{dep.name}</p>
        </div>
        <div className="flex flex-col items-center text-center">
          <span className="text-xs font-medium text-muted-foreground">{minutes(leg.duration)}</span>
          <span className="my-1 flex w-full items-center">
            <span className="h-px flex-1 bg-border" />
            <Plane
              className="mx-1 h-3.5 w-3.5 rotate-90 text-muted-foreground"
              aria-hidden="true"
            />
            <span className="h-px flex-1 bg-border" />
          </span>
          {leg.airplane && (
            <span className="text-[11px] text-muted-foreground/80">{leg.airplane}</span>
          )}
        </div>
        <div className="sm:text-right">
          <p className="text-lg font-semibold text-foreground">{formatFlightTime(arr.time)}</p>
          <p className="text-xs text-muted-foreground">
            {arr.id} · {formatFlightDate(arr.date)}
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
            {amenities.wifi ? <Chip>Wi-Fi</Chip> : null}
            {amenities.usb_power ? <Chip>USB power</Chip> : null}
            {amenities.video_on_demand ? <Chip>On-demand video</Chip> : null}
            {amenities.seat_type ? <Chip>{String(amenities.seat_type)}</Chip> : null}
            {amenities.legroom_short ? <Chip>{String(amenities.legroom_short)}</Chip> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function LayoverRow({ layover }: { layover: SearchApiLayover }) {
  const overnight = layover.is_overnight;
  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs',
        overnight
          ? 'border-orange-200 bg-orange-50 text-orange-800'
          : 'border-amber-200 bg-amber-50 text-amber-800',
      )}
    >
      <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className="font-medium">{minutes(layover.duration)} layover</span>
      <span>
        at {layover.name} ({layover.id})
      </span>
      {overnight ? (
        <span className="ml-auto inline-flex items-center gap-1 rounded bg-orange-200/60 px-1.5 py-0.5 font-medium">
          <Moon className="h-3 w-3" aria-hidden="true" /> Overnight
        </span>
      ) : null}
    </div>
  );
}

/** Expanded details for a flight option, with Outbound / Return split. */
function FlightDetails({
  option,
  arrivalId,
  currency,
  mode = 'one-way',
}: {
  option: SearchApiFlightOption;
  arrivalId: string;
  currency: string;
  mode?: FlightCardMode;
}) {
  const { outbound, return: returnLegs } = splitItinerary(option, arrivalId);
  const emissions = option.carbon_emissions;
  const isRoundTrip = mode === 'return' || option.type?.toLowerCase().includes('round') || false;
  const showReturn = mode === 'one-way' && isRoundTrip && returnLegs.length > 0;

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
          {mode === 'return' ? 'Return' : isRoundTrip ? 'Outbound' : 'Flight details'}
        </h4>
        {renderLegs(
          mode === 'return' ? (returnLegs.length ? returnLegs : outbound) : outbound,
          'out',
        )}
      </section>

      {showReturn ? (
        <section>
          <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
            <PlaneTakeoff className="h-4 w-4 rotate-180 text-primary" aria-hidden="true" />
            Return
          </h4>
          {renderLegs(returnLegs, 'return')}
        </section>
      ) : null}

      {emissions ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">
            CO₂: {Math.round((emissions.this_flight ?? 0) / 1000)} kg
          </span>
          {emissions.difference_percent !== undefined ? (
            <span>
              {Math.abs(emissions.difference_percent)}%{' '}
              {emissions.difference_percent < 0 ? 'below' : 'above'} typical
            </span>
          ) : null}
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
        {mode === 'outbound'
          ? `Round-trip fare from: ${formatPrice(option.price, currency)}.`
          : mode === 'return'
            ? `Round-trip total: ${formatPrice(option.price, currency)}.`
            : isRoundTrip
              ? `Round-trip fare from: ${formatPrice(option.price, currency)}.`
              : `One-way fare: ${formatPrice(option.price, currency)}.`}
      </p>
    </div>
  );
}

/** One flight result card with independent, local expand/collapse state. */
function FlightOptionCard({
  option,
  currency,
  arrivalId,
  mode = 'one-way',
  onSelect,
  searchParams,
}: {
  option: SearchApiFlightOption;
  currency: string;
  arrivalId: string;
  mode?: FlightCardMode;
  onSelect?: () => void;
  searchParams?: Record<string, unknown> | undefined;
}) {
  const [open, setOpen] = useState(false);
  const selectable = mode === 'outbound' || mode === 'return';
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <FlightSummary option={option} currency={currency} mode={mode} />
        <div className="flex flex-wrap items-center gap-2">
          {mode === 'one-way' && searchParams ? (
            <BookmarkButton
              type="FLIGHT"
              searchParams={searchParams}
              snapshot={option}
              fingerprint={flightFingerprint(searchParams, option.flights)}
            />
          ) : null}
          {selectable && onSelect ? (
            <Button size="sm" onClick={onSelect}>
              {mode === 'outbound' ? 'Select outbound' : 'Select return'}
            </Button>
          ) : null}
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            className="flex items-center gap-1 rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            {open ? 'View less' : 'Flight details'}
            <ChevronDown
              className={cn('h-4 w-4 transition-transform', open && 'rotate-180')}
              aria-hidden="true"
            />
          </button>
        </div>
      </div>
      {open ? (
        <div className="border-t border-border p-4">
          <FlightDetails option={option} arrivalId={arrivalId} currency={currency} mode={mode} />
        </div>
      ) : null}
    </Card>
  );
}

/** Compact price-insight strip. */
function PriceInsightsStrip({
  insights,
  currency,
}: {
  insights: NonNullable<FlightSearchResponse['price_insights']>;
  currency: string;
}) {
  const lowest =
    insights.lowest_price !== undefined ? formatPrice(insights.lowest_price, currency) : null;
  const typical = insights.typical_price_range
    ? `${formatPrice(insights.typical_price_range.low_price, currency)}–${formatPrice(insights.typical_price_range.high_price, currency)}`
    : null;
  const level = insights.price_level
    ? insights.price_level.charAt(0).toUpperCase() + insights.price_level.slice(1)
    : null;
  if (!lowest && !typical && !level) return null;
  return (
    <Card>
      <div className="grid gap-x-6 gap-y-1 px-4 py-2.5 sm:grid-cols-3">
        {lowest ? (
          <div>
            <p className="text-xs text-muted-foreground">Lowest fare</p>
            <p className="text-sm font-semibold text-foreground">{lowest}</p>
          </div>
        ) : null}
        {typical ? (
          <div>
            <p className="text-xs text-muted-foreground">Typical range</p>
            <p className="text-sm font-semibold text-foreground">{typical}</p>
          </div>
        ) : null}
        {level ? (
          <div>
            <p className="text-xs text-muted-foreground">Price level</p>
            <p className="text-sm font-semibold text-foreground">{level}</p>
          </div>
        ) : null}
      </div>
    </Card>
  );
}

function combineExtensions(a?: string[], b?: string[]): string[] | undefined {
  const set = new Set([...(a ?? []), ...(b ?? [])]);
  return set.size > 0 ? [...set] : undefined;
}

/**
 * Merge a selected outbound option and a selected return option into one
 * complete round trip.
 *
 * Price semantics: for SearchAPI/Google Flights the return option's price is
 * the provider-returned total for the whole outbound + return combination, so
 * the final total uses the return option's price — never outbound + return.
 */
function buildRoundTripOption(
  outbound: SearchApiFlightOption,
  returnFlight: SearchApiFlightOption,
): SearchApiFlightOption {
  const extensions = combineExtensions(outbound.extensions, returnFlight.extensions);
  const result: SearchApiFlightOption = {
    flights: [...outbound.flights, ...returnFlight.flights],
    layovers: [...(outbound.layovers ?? []), ...(returnFlight.layovers ?? [])],
    total_duration: (outbound.total_duration ?? 0) + (returnFlight.total_duration ?? 0),
    price: returnFlight.price ?? outbound.price,
    type: 'Round trip',
  };
  const airlineLogo = outbound.airline_logo ?? returnFlight.airline_logo;
  if (airlineLogo) result.airline_logo = airlineLogo;
  if (outbound.departure_token) result.departure_token = outbound.departure_token;
  const bookingToken = returnFlight.booking_token ?? outbound.booking_token;
  if (bookingToken) result.booking_token = bookingToken;
  if (extensions) result.extensions = extensions;
  const carbonEmissions = outbound.carbon_emissions ?? returnFlight.carbon_emissions;
  if (carbonEmissions) result.carbon_emissions = carbonEmissions;
  return result;
}

/** Render one side of a completed round-trip itinerary (outbound or return). */
function JourneyDetails({ option, title }: { option: SearchApiFlightOption; title: string }) {
  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold text-foreground">{title}</h4>
      {option.flights.map((leg, index) => (
        <div key={`journey-${leg.flight_number}-${index}`}>
          <FlightLeg leg={leg} />
          {option.layovers?.[index] ? <LayoverRow layover={option.layovers[index]} /> : null}
        </div>
      ))}
    </div>
  );
}

/** Completed round trip: both journeys, one final total, and the bookmark action. */
function CompleteItinerary({
  outbound,
  returnFlight,
  currency,
  searchParams,
}: {
  outbound: SearchApiFlightOption;
  returnFlight: SearchApiFlightOption;
  currency: string;
  searchParams: Record<string, unknown>;
}) {
  const combined = useMemo(
    () => buildRoundTripOption(outbound, returnFlight),
    [outbound, returnFlight],
  );

  return (
    <Card className="space-y-4 p-4">
      <h3 className="text-base font-semibold text-foreground">Complete round trip</h3>
      <div className="grid gap-4 md:grid-cols-2">
        <JourneyDetails option={outbound} title="Outbound journey" />
        <JourneyDetails option={returnFlight} title="Return journey" />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
        <div>
          <p className="text-xs text-muted-foreground">Total round-trip fare</p>
          <p className="text-xl font-bold text-foreground">
            {formatPrice(combined.price, currency)}
          </p>
        </div>
        <BookmarkButton
          type="FLIGHT"
          searchParams={searchParams}
          snapshot={combined}
          fingerprint={flightFingerprint(searchParams, combined.flights)}
        />
      </div>
    </Card>
  );
}

function FlightResults({
  data,
  currency,
  baseParams,
}: {
  data: FlightSearchResponse;
  currency: string;
  baseParams: FlightSearchParams | null;
}) {
  const arrivalId = useMemo(() => {
    const sp = data.search_parameters;
    const id = (sp as Record<string, unknown> | undefined)?.arrival_id;
    return typeof id === 'string' ? id : '';
  }, [data]);
  const all = useMemo(() => [...(data.best_flights ?? []), ...(data.other_flights ?? [])], [data]);
  const insights = data.price_insights;
  // Trip type comes from the actual submitted search, not the provider label,
  // so a one-way search never shows a "Round trip" badge.
  const isRoundTrip = baseParams?.type === 2;
  const searchParams = useMemo(() => (baseParams ?? {}) as Record<string, unknown>, [baseParams]);

  const [selectedOutbound, setSelectedOutbound] = useState<SearchApiFlightOption | null>(null);
  const [selectedReturn, setSelectedReturn] = useState<SearchApiFlightOption | null>(null);

  useEffect(() => {
    setSelectedOutbound(null);
    setSelectedReturn(null);
  }, [data]);

  const returnSearch = useReturnFlightSearch(
    (baseParams ?? {}) as FlightSearchParams,
    selectedOutbound?.departure_token,
  );

  useEffect(() => {
    setSelectedReturn(null);
  }, [selectedOutbound]);

  const returnOptions = useMemo(() => {
    if (!returnSearch.data) return [];
    return [...(returnSearch.data.best_flights ?? []), ...(returnSearch.data.other_flights ?? [])];
  }, [returnSearch.data]);

  const changeButtonClass = 'text-xs font-medium text-primary hover:underline';

  const flightList = (
    options: SearchApiFlightOption[],
    mode: FlightCardMode,
    onSelect: (option: SearchApiFlightOption) => void,
    cardSearchParams?: Record<string, unknown>,
  ) => (
    <div className="space-y-3">
      {options.map((option, index) => (
        <FlightOptionCard
          key={option.departure_token ?? option.booking_token ?? index}
          option={option}
          currency={currency}
          arrivalId={arrivalId}
          mode={mode}
          searchParams={cardSearchParams}
          onSelect={() => onSelect(option)}
        />
      ))}
    </div>
  );

  // One-way searches keep the original card + bookmark behavior.
  if (!isRoundTrip) {
    return (
      <div className="space-y-4">
        {insights ? <PriceInsightsStrip insights={insights} currency={currency} /> : null}

        {all.length ? (
          flightList(all, 'one-way', () => undefined, searchParams)
        ) : (
          <EmptyState
            icon={Plane}
            title="No flights found for these dates"
            description="Try different airports or dates."
          />
        )}

        <DevRawResponse label="Developer data — flight" data={data} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {insights ? <PriceInsightsStrip insights={insights} currency={currency} /> : null}

      {!selectedOutbound ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Plane className="h-4 w-4 text-primary" aria-hidden="true" />
            <h3 className="text-sm font-semibold text-foreground">Outbound flights</h3>
          </div>
          {all.length ? (
            flightList(all, 'outbound', setSelectedOutbound)
          ) : (
            <EmptyState
              icon={Plane}
              title="No flights found for these dates"
              description="Try different airports or dates."
            />
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Plane className="h-4 w-4 text-primary" aria-hidden="true" />
                <h3 className="text-sm font-semibold text-foreground">Selected outbound</h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedOutbound(null);
                  setSelectedReturn(null);
                }}
                className={changeButtonClass}
              >
                Change outbound
              </button>
            </div>
            <FlightOptionCard
              option={selectedOutbound}
              currency={currency}
              arrivalId={arrivalId}
              mode="outbound"
            />
          </div>

          {!selectedReturn ? (
            <div className="space-y-3">
              {returnSearch.isFetching && !returnSearch.data ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Loading return flights…
                </p>
              ) : null}
              {returnSearch.isError ? (
                <Alert tone="error">We couldn&apos;t load return flights. Please try again.</Alert>
              ) : null}
              {returnOptions.length > 0 ? (
                <>
                  <div className="flex items-center gap-2">
                    <PlaneTakeoff className="h-4 w-4 rotate-180 text-primary" aria-hidden="true" />
                    <h3 className="text-sm font-semibold text-foreground">
                      Return flights{' '}
                      <span className="font-normal text-muted-foreground">
                        ({arrivalId} → {baseParams?.departure_id ?? ''})
                      </span>
                    </h3>
                  </div>
                  {flightList(returnOptions, 'return', setSelectedReturn)}
                </>
              ) : !returnSearch.isFetching && returnSearch.data ? (
                <EmptyState
                  icon={Plane}
                  title="No return flights found"
                  description="Try a different outbound flight or dates."
                />
              ) : null}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <PlaneTakeoff className="h-4 w-4 rotate-180 text-primary" aria-hidden="true" />
                  <h3 className="text-sm font-semibold text-foreground">Selected return</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedReturn(null)}
                  className={changeButtonClass}
                >
                  Change return
                </button>
              </div>
              <FlightOptionCard
                option={selectedReturn}
                currency={currency}
                arrivalId={arrivalId}
                mode="return"
              />
              <CompleteItinerary
                outbound={selectedOutbound}
                returnFlight={selectedReturn}
                currency={currency}
                searchParams={searchParams}
              />
            </div>
          )}
        </div>
      )}

      <DevRawResponse label="Developer data — flight" data={data} />
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
  sort_by: string;
  property_types: string[];
  amenities: string[];
  rating: string;
  min_price: string;
  max_price: string;
  free_cancellation: boolean;
  special_offers: boolean;
  eco_certified: boolean;
  bedrooms: string;
  bathrooms: string;
}

interface HotelSuggestion {
  id: string;
  label: string;
  kind: 'Destination' | 'City' | 'Hotel';
  destination: HotelDestination;
}

function buildHotelSuggestion(
  id: string,
  label: string,
  searchQuery: string,
  kind: HotelSuggestion['kind'],
  extra: Partial<HotelDestination> = {},
): HotelSuggestion {
  return { id, label, kind, destination: { displayName: label, searchQuery, ...extra } };
}

/**
 * Local Masters autocomplete for the hotel destination/search field.
 *
 * Suggestions come ONLY from Destination / City / Hotel Master (fetched once and
 * filtered client-side). Selecting a suggestion only fills the input — no
 * SearchAPI call happens until the user clicks "Search hotels".
 */
function HotelDestinationInput({
  value,
  onText,
  onSelectDestination,
}: {
  value: HotelDestination | null;
  onText: (text: string) => void;
  onSelectDestination: (destination: HotelDestination) => void;
}) {
  const [text, setText] = useState(value?.displayName ?? '');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const destinations = useDestinations(new URLSearchParams({ status: 'ACTIVE', pageSize: '100' }));
  const cities = useCities(new URLSearchParams({ status: 'ACTIVE', pageSize: '100' }));
  const hotels = useHotels(new URLSearchParams({ status: 'ACTIVE', pageSize: '100' }));

  const suggestions = useMemo<HotelSuggestion[]>(() => {
    const q = text.trim().toLowerCase();
    if (!q) return [];
    const out: HotelSuggestion[] = [];
    for (const destination of destinations.data?.data ?? []) {
      if (destination.name.toLowerCase().includes(q)) {
        out.push(
          buildHotelSuggestion(
            destination.id,
            destination.name,
            `Hotels in ${destination.name}`,
            'Destination',
            {
              ...(destination.countryName
                ? {
                    country: destination.countryName,
                    countryCode: destination.countryCode ?? undefined,
                  }
                : {}),
            },
          ),
        );
      }
    }
    for (const city of cities.data?.data ?? []) {
      if (city.name.toLowerCase().includes(q)) {
        out.push(
          buildHotelSuggestion(city.id, city.name, `Hotels in ${city.name}`, 'City', {
            countryCode: city.countryCode ?? undefined,
          }),
        );
      }
    }
    for (const hotel of hotels.data?.data ?? []) {
      if (hotel.name.toLowerCase().includes(q)) {
        out.push(
          buildHotelSuggestion(hotel.id, hotel.name, hotel.name, 'Hotel', {
            city: hotel.city?.name,
            region: hotel.destination?.name,
          }),
        );
      }
    }
    return out.slice(0, 8);
  }, [text, destinations.data, cities.data, hotels.data]);

  const commit = (suggestion: HotelSuggestion) => {
    setText(suggestion.label);
    setOpen(false);
    setHighlight(0);
    onText(suggestion.label);
    onSelectDestination(suggestion.destination);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || suggestions.length === 0) {
      if (event.key === 'Escape') setOpen(false);
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlight((current) => (current + 1) % suggestions.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlight((current) => (current - 1 + suggestions.length) % suggestions.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      commit(suggestions[highlight]!);
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div className="relative">
      <label className="block space-y-1.5 text-sm font-medium text-foreground">
        Destination
        <input
          aria-label="Destination"
          className={inputClass}
          placeholder="e.g. Delhi, Mumbai, Singapore"
          value={text}
          autoComplete="off"
          onFocus={() => setOpen(text.trim().length > 0)}
          onBlur={() => setOpen(false)}
          onChange={(event) => {
            const next = event.target.value;
            setText(next);
            setOpen(next.trim().length > 0);
            setHighlight(0);
            onText(next);
          }}
          onKeyDown={onKeyDown}
        />
      </label>
      {value ? <p className="mt-1 text-xs text-muted-foreground">{value.searchQuery}</p> : null}
      {open && suggestions.length ? (
        <ul
          role="listbox"
          aria-label="Hotel destination suggestions"
          className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-border bg-card shadow-lg"
        >
          {suggestions.map((suggestion, index) => (
            <li key={`${suggestion.kind}-${suggestion.id}`}>
              <button
                type="button"
                role="option"
                aria-selected={index === highlight}
                onMouseDown={(event) => {
                  event.preventDefault();
                  commit(suggestion);
                }}
                onMouseEnter={() => setHighlight(index)}
                className={cn(
                  'flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm',
                  index === highlight ? 'bg-muted' : '',
                )}
              >
                <span className="truncate font-medium text-foreground">{suggestion.label}</span>
                <Badge variant="outline">{suggestion.kind}</Badge>
              </button>
            </li>
          ))}
        </ul>
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
  error,
}: {
  form: HotelForm;
  currency: string;
  onCurrency: (currency: string) => void;
  onChange: (patch: Partial<HotelForm>) => void;
  onSubmit: () => void;
  error?: string | null;
}) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const toggleList = (key: 'property_types' | 'amenities', id: string) => {
    const current = form[key];
    onChange({
      [key]: current.includes(id) ? current.filter((v) => v !== id) : [...current, id],
    } as Partial<HotelForm>);
  };

  return (
    <Card>
      <form
        className="space-y-3 p-4"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <FormGroup title="Destination">
          <div className="sm:col-span-2">
            <HotelDestinationInput
              value={form.destination}
              onText={(text) => onChange({ destination: null, destinationText: text })}
              onSelectDestination={(destination) =>
                onChange({ destination, destinationText: destination.displayName })
              }
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
          <label className="block space-y-1.5 text-sm font-medium text-foreground">
            Sort by
            <select
              aria-label="Hotel sort by"
              className={inputClass}
              value={form.sort_by}
              onChange={(event) => onChange({ sort_by: event.target.value })}
            >
              <option value="">Recommended</option>
              {HOTEL_SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        </FormGroup>

        <AdvancedFilters open={advancedOpen} onToggle={() => setAdvancedOpen((v) => !v)}>
          <label className="block space-y-1.5 text-sm font-medium text-foreground">
            Price min
            <input
              aria-label="Hotel price min"
              type="number"
              min={0}
              className={inputClass}
              value={form.min_price}
              onChange={(event) => onChange({ min_price: event.target.value })}
            />
          </label>
          <label className="block space-y-1.5 text-sm font-medium text-foreground">
            Price max
            <input
              aria-label="Hotel price max"
              type="number"
              min={1}
              className={inputClass}
              value={form.max_price}
              onChange={(event) => onChange({ max_price: event.target.value })}
            />
          </label>
          <label className="block space-y-1.5 text-sm font-medium text-foreground">
            Hotel class
            <select
              aria-label="Hotel class"
              className={inputClass}
              value={form.rating}
              onChange={(event) => onChange({ rating: event.target.value })}
            >
              <option value="">Any</option>
              <option value="5">5 star</option>
              <option value="4">4 star</option>
              <option value="3">3 star</option>
              <option value="2">2 star</option>
            </select>
          </label>
          <label className="block space-y-1.5 text-sm font-medium text-foreground">
            Guest rating
            <select
              aria-label="Guest rating"
              className={inputClass}
              value={form.rating}
              onChange={(event) => onChange({ rating: event.target.value })}
            >
              <option value="">Any</option>
              {HOTEL_RATING_OPTIONS.map((opt) => (
                <option key={opt.value} value={String(opt.value)}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>

          <div className="sm:col-span-2">
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">Property type</p>
            <div className="flex flex-wrap gap-1.5">
              {HOTEL_PROPERTY_TYPE_IDS.hotels.map((pt) => (
                <button
                  key={pt.id}
                  type="button"
                  aria-pressed={form.property_types.includes(String(pt.id))}
                  onClick={() => toggleList('property_types', String(pt.id))}
                  className={cn(
                    'rounded-full border px-2.5 py-1 text-xs transition-colors',
                    form.property_types.includes(String(pt.id))
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:bg-muted',
                  )}
                >
                  {pt.label}
                </button>
              ))}
              {HOTEL_PROPERTY_TYPE_IDS.vacationRentals.map((pt) => (
                <button
                  key={pt.id}
                  type="button"
                  aria-pressed={form.property_types.includes(String(pt.id))}
                  onClick={() => toggleList('property_types', String(pt.id))}
                  className={cn(
                    'rounded-full border px-2.5 py-1 text-xs transition-colors',
                    form.property_types.includes(String(pt.id))
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:bg-muted',
                  )}
                >
                  {pt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="sm:col-span-2">
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">Amenities</p>
            <div className="flex flex-wrap gap-1.5">
              {HOTEL_AMENITY_IDS.map((amenity) => (
                <button
                  key={amenity.id}
                  type="button"
                  aria-pressed={form.amenities.includes(String(amenity.id))}
                  onClick={() => toggleList('amenities', String(amenity.id))}
                  className={cn(
                    'rounded-full border px-2.5 py-1 text-xs transition-colors',
                    form.amenities.includes(String(amenity.id))
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:bg-muted',
                  )}
                >
                  {amenity.label}
                </button>
              ))}
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm font-medium text-foreground">
            <input
              type="checkbox"
              checked={form.free_cancellation}
              onChange={(event) => onChange({ free_cancellation: event.target.checked })}
              className="h-4 w-4 rounded border-input text-primary focus:ring-ring/60"
            />
            Free cancellation
          </label>
          <label className="flex items-center gap-2 text-sm font-medium text-foreground">
            <input
              type="checkbox"
              checked={form.special_offers}
              onChange={(event) => onChange({ special_offers: event.target.checked })}
              className="h-4 w-4 rounded border-input text-primary focus:ring-ring/60"
            />
            Special offers
          </label>
          <label className="flex items-center gap-2 text-sm font-medium text-foreground">
            <input
              type="checkbox"
              checked={form.eco_certified}
              onChange={(event) => onChange({ eco_certified: event.target.checked })}
              className="h-4 w-4 rounded border-input text-primary focus:ring-ring/60"
            />
            Eco certified
          </label>
          <label className="block space-y-1.5 text-sm font-medium text-foreground">
            Min bedrooms
            <input
              aria-label="Min bedrooms"
              type="number"
              min={0}
              max={20}
              className={inputClass}
              value={form.bedrooms}
              onChange={(event) => onChange({ bedrooms: event.target.value })}
            />
          </label>
          <label className="block space-y-1.5 text-sm font-medium text-foreground">
            Min bathrooms
            <input
              aria-label="Min bathrooms"
              type="number"
              min={0}
              max={20}
              className={inputClass}
              value={form.bathrooms}
              onChange={(event) => onChange({ bathrooms: event.target.value })}
            />
          </label>
        </AdvancedFilters>

        {error ? <Alert tone="error">{error}</Alert> : null}

        <div>
          <Button type="submit">
            <Search className="h-4 w-4" aria-hidden="true" />
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
 * Image carousel. For each image, prefer `original`, fall back to `thumbnail`,
 * then move to the next image. Local state only — never triggers a request.
 * Each hotel card owns its own index/failed set so navigation never leaks.
 */
function PropertyImages({ property }: { property: SearchApiHotelProperty }) {
  const normalizedImages = useMemo(() => {
    const seen = new Set<string>();
    const out: string[][] = [];
    for (const image of property.images ?? []) {
      const candidates = resolveHotelImageCandidates(image)
        .map((url) => url?.trim())
        .filter((url): url is string => Boolean(url));
      if (!candidates.length) continue;
      const primary = candidates[0]!;
      if (seen.has(primary)) continue;
      seen.add(primary);
      out.push(candidates);
    }
    return out;
  }, [property.images]);

  const imageSignature = useMemo(
    () => normalizedImages.map((c) => c[0]).join('|'),
    [normalizedImages],
  );

  const [index, setIndex] = useState(0);
  const [failed, setFailed] = useState<Set<string>>(new Set());

  // Reset only when *this* hotel's image collection changes (new search, same token with new images, etc.)
  const prevSignatureRef = useRef(imageSignature);
  useEffect(() => {
    if (prevSignatureRef.current !== imageSignature) {
      prevSignatureRef.current = imageSignature;
      setIndex(0);
      setFailed(new Set());
    }
  }, [imageSignature]);

  // Only image entries with at least one URL that has not failed are usable.
  const validImages = useMemo(
    () =>
      normalizedImages
        .map((candidates, i) => ({ candidates, i }))
        .filter(({ candidates }) => candidates.some((url) => !failed.has(url))),
    [normalizedImages, failed],
  );

  // Keep the active index inside the usable range whenever images are removed,
  // so the counter, dots and previous/next navigation never point at a gap.
  useEffect(() => {
    if (!validImages.length) {
      setIndex(0);
      return;
    }
    setIndex((current) => Math.min(current, validImages.length - 1));
  }, [validImages.length]);

  const shownIndex = validImages.length ? Math.min(index, validImages.length - 1) : -1;
  const shown = shownIndex >= 0 ? validImages[shownIndex] : undefined;
  // Prefer original, then thumbnail, always skipping URLs that already failed.
  const currentUrl = shown?.candidates.find((url) => !failed.has(url)) ?? null;

  const goTo = useMemo(
    () => (next: number) => {
      if (!validImages.length) return;
      const len = validImages.length;
      const target = ((next % len) + len) % len;
      setIndex(target);
    },
    [validImages.length],
  );
  const goNext = () => {
    if (!validImages.length) return;
    setIndex((prev) => (prev + 1) % validImages.length);
  };
  const goPrev = () => {
    if (!validImages.length) return;
    setIndex((prev) => (prev - 1 + validImages.length) % validImages.length);
  };

  const onError = () => {
    if (!currentUrl) return;
    setFailed((prev) => {
      if (prev.has(currentUrl)) return prev;
      const next = new Set(prev);
      next.add(currentUrl);
      return next;
    });
  };

  // Preload immediate neighbours only — avoids blank flash on next/prev.
  useEffect(() => {
    if (!validImages.length || shownIndex < 0) return;
    const preload = (url: string | undefined) => {
      if (!url || failed.has(url)) return;
      const img = new window.Image();
      img.src = url;
    };
    const nextEntry = validImages[(shownIndex + 1) % validImages.length];
    const prevEntry = validImages[(shownIndex - 1 + validImages.length) % validImages.length];
    preload(nextEntry?.candidates.find((u) => !failed.has(u)));
    preload(prevEntry?.candidates.find((u) => !failed.has(u)));
  }, [shownIndex, validImages, failed]);

  const single = validImages.length <= 1;

  return (
    <div className="relative h-44 w-full overflow-hidden bg-muted sm:h-48">
      {currentUrl ? (
        <img
          key={currentUrl}
          src={currentUrl}
          alt={property.name ?? 'Property'}
          className="h-full w-full object-cover"
          loading="lazy"
          onError={onError}
          decoding="async"
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
            onClick={goPrev}
            className="absolute left-1.5 top-1/2 -translate-y-1/2 rounded-full bg-black/45 p-1.5 text-white shadow transition-colors hover:bg-black/65 focus:outline-none focus:ring-2 focus:ring-white/60"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="Next image"
            onClick={goNext}
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

function PriceBlock({ label, price }: { label: string; price: SearchApiPrice | undefined }) {
  if (!price) return null;
  const resolved = resolveHotelPrice(price);
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      {resolved.main ? (
        <p className="text-base font-semibold text-foreground">
          {formatPriceString(resolved.main)}
          {resolved.beforeTaxes ? (
            <span className="ml-1.5 text-xs font-normal text-muted-foreground">Before taxes</span>
          ) : null}
        </p>
      ) : (
        <p className="text-base font-semibold text-foreground">Price unavailable</p>
      )}
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

/** Complete, one-click expanded details for a hotel search card. */
function HotelDetails({
  property,
  searchParams,
}: {
  property: SearchApiHotelProperty;
  searchParams?: Record<string, unknown> | undefined;
}) {
  const amenities = property.amenities ?? [];
  const essential = property.essential_info ?? [];
  const checkIn =
    typeof searchParams?.check_in_date === 'string' ? searchParams.check_in_date : null;
  const checkOut =
    typeof searchParams?.check_out_date === 'string' ? searchParams.check_out_date : null;
  const nights = hotelStayNights(checkIn, checkOut);
  const hasRatings =
    property.location_rating !== undefined ||
    property.proximity_to_things_to_do_rating !== undefined ||
    property.proximity_to_transit_rating !== undefined ||
    property.airport_access_rating !== undefined;
  const hasHistogram = Boolean(
    property.reviews_histogram && Object.keys(property.reviews_histogram).length,
  );

  return (
    <div className="grid gap-5 border-t border-border p-4 md:grid-cols-2">
      <div className="space-y-1.5 md:col-span-2">
        <h4 className="text-sm font-semibold text-foreground">Hotel Overview</h4>
        <p className="text-sm font-semibold text-foreground">{property.name}</p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {property.type ? (
            <Badge variant="outline">{propertyTypeLabel(property.type)}</Badge>
          ) : null}
          {property.extracted_hotel_class ? <Stars count={property.extracted_hotel_class} /> : null}
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
        </div>
        {property.description ? (
          <p className="text-xs text-muted-foreground">{property.description}</p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <h4 className="text-sm font-semibold text-foreground">Stay Details</h4>
        <Field label="Check-in" value={checkIn ? formatFlightDate(checkIn) : undefined} />
        <Field label="Check-out" value={checkOut ? formatFlightDate(checkOut) : undefined} />
        <Field label="Nights" value={nights ?? undefined} />
        <Field label="Check-in time" value={property.check_in_time} />
        <Field label="Check-out time" value={property.check_out_time} />
      </div>

      <div className="space-y-1.5">
        <h4 className="text-sm font-semibold text-foreground">Room & Property</h4>
        {essential.length ? (
          <div className="flex flex-wrap gap-1.5">
            {essential.map((info) => (
              <Chip key={info}>{info}</Chip>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No room details returned.</p>
        )}
        {property.gps_coordinates ? (
          <Field
            label="Coordinates"
            value={`${property.gps_coordinates.latitude}, ${property.gps_coordinates.longitude}`}
          />
        ) : null}
      </div>

      <div className="md:col-span-2">
        <h4 className="mb-2 text-sm font-semibold text-foreground">Amenities</h4>
        {amenities.length ? (
          <div className="flex flex-wrap gap-1.5">
            {amenities.map((amenity) => (
              <Chip key={amenity}>{amenity}</Chip>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No amenities returned.</p>
        )}
        {property.excluded_amenities?.length ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {property.excluded_amenities.map((amenity) => (
              <span
                key={amenity}
                className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground/70 line-through"
              >
                {amenity}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      {hasRatings ? (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-foreground">Guest Ratings</h4>
          <RatingBar label="Location" value={property.location_rating} />
          <RatingBar label="Things to do" value={property.proximity_to_things_to_do_rating} />
          <RatingBar label="Transit" value={property.proximity_to_transit_rating} />
          <RatingBar label="Airport access" value={property.airport_access_rating} />
        </div>
      ) : null}

      <div className="space-y-2">
        {property.reviews_breakdown?.length ? (
          <ReviewBreakdown items={property.reviews_breakdown} />
        ) : null}
        {hasHistogram ? (
          <div>
            <h4 className="mb-2 text-sm font-semibold text-foreground">Review Histogram</h4>
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
                        style={{ width: `${Math.max(0, Math.min(100, (count / total) * 100))}%` }}
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

      {property.nearby_places?.length ? (
        <div className="md:col-span-2">
          <h4 className="mb-2 text-sm font-semibold text-foreground">Nearby Places</h4>
          <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
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
        </div>
      ) : null}
    </div>
  );
}

/** Compact hotel search-result card: image left, key facts + price right. */
function HotelPropertyCard({
  property,
  searchParams,
}: {
  property: SearchApiHotelProperty;
  searchParams?: Record<string, unknown>;
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const amenities = property.amenities ?? [];
  const primaryAmenities = amenities.slice(0, 6);
  const extraCount = Math.max(0, amenities.length - primaryAmenities.length);

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col sm:flex-row">
        <div className="shrink-0 sm:w-48">
          <PropertyImages property={property} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="truncate text-sm font-semibold text-foreground">{property.name}</h3>
                <Stars count={property.extracted_hotel_class} />
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                {property.type ? (
                  <Badge variant="outline">{propertyTypeLabel(property.type)}</Badge>
                ) : null}
                {property.rating ? (
                  <span className="flex items-center gap-1">
                    <Star
                      className="h-3.5 w-3.5 fill-amber-400 text-amber-400"
                      aria-hidden="true"
                    />
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
              </div>
            </div>
            {property.deal ? (
              <Badge variant="success">
                <Flame className="h-3 w-3" aria-hidden="true" />
                {property.deal}
              </Badge>
            ) : null}
          </div>

          {primaryAmenities.length ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {primaryAmenities.map((amenity) => (
                <Chip key={amenity}>{amenity}</Chip>
              ))}
              {extraCount > 0 ? <Chip>{`+${extraCount} more`}</Chip> : null}
            </div>
          ) : null}

          <div className="mt-auto flex flex-wrap items-end justify-between gap-3 border-t border-border pt-2">
            <div className="flex flex-wrap items-end gap-4">
              <PriceBlock label="Per night" price={property.price_per_night} />
              <PriceBlock label="Total stay" price={property.total_price} />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {searchParams ? (
                <BookmarkButton
                  type="HOTEL"
                  searchParams={searchParams}
                  snapshot={property}
                  fingerprint={hotelFingerprint(
                    searchParams,
                    property.property_token ?? property.data_id ?? property.name ?? '',
                  )}
                />
              ) : null}
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
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                {detailsOpen ? 'View less' : 'View details'}
              </button>
            </div>
          </div>
        </div>
      </div>
      {detailsOpen ? <HotelDetails property={property} searchParams={searchParams} /> : null}
    </Card>
  );
}

/** Local pagination window: first, last, current±1 with ellipses for large sets. */
function paginationWindow(current: number, total: number): (number | 'ellipsis')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const set = new Set<number>([1, total, current - 1, current, current + 1]);
  const list = [...set].filter((page) => page >= 1 && page <= total).sort((a, b) => a - b);
  const out: (number | 'ellipsis')[] = [];
  let previous = 0;
  for (const page of list) {
    if (previous && page - previous > 1) out.push('ellipsis');
    out.push(page);
    previous = page;
  }
  return out;
}

/**
 * Pagination for the local hotel result list. Page numbers navigate within the
 * already-loaded properties (zero provider requests). Next on the last loaded
 * page triggers one more provider batch when a next_page_token exists.
 */
function HotelPaginationFooter({
  currentPage,
  totalPages,
  hasNext,
  isLoading,
  onPage,
}: {
  currentPage: number;
  totalPages: number;
  hasNext: boolean;
  isLoading: boolean;
  onPage: (page: number) => void;
}) {
  const pageButton =
    'inline-flex h-8 min-w-8 items-center justify-center rounded-md border px-2 text-sm font-medium transition-colors';
  const canGoNext = currentPage < totalPages || hasNext;

  return (
    <nav
      aria-label="Hotel pagination"
      className="flex flex-wrap items-center justify-center gap-1.5 pt-2"
    >
      <button
        type="button"
        disabled={currentPage <= 1 || isLoading}
        onClick={() => onPage(currentPage - 1)}
        className={cn(
          pageButton,
          'border-slate-300 text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50',
        )}
      >
        Previous
      </button>
      {paginationWindow(currentPage, totalPages).map((entry, index) =>
        entry === 'ellipsis' ? (
          <span key={`ellipsis-${index}`} className="px-1 text-slate-400">
            …
          </span>
        ) : (
          <button
            key={entry}
            type="button"
            aria-current={entry === currentPage ? 'page' : undefined}
            onClick={() => onPage(entry)}
            className={cn(
              pageButton,
              entry === currentPage
                ? 'border-brand-600 bg-brand-600 text-white'
                : 'border-slate-300 text-slate-700 hover:bg-slate-50',
            )}
          >
            {entry}
          </button>
        ),
      )}
      {canGoNext ? (
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

  const loadedCount = paged.loadedCount;
  const providerTotal = paged.totalResults;
  const currentPage = paged.currentPage;
  const pageProperties = paged.pageProperties;

  const rangeStart = loadedCount ? (currentPage - 1) * 20 + 1 : 0;
  const rangeEnd = Math.min(currentPage * 20, loadedCount);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span className="flex items-center gap-1.5 text-foreground">
          <Building2 className="h-4 w-4 text-primary" aria-hidden="true" />
          <span className="font-medium">{loadedCount.toLocaleString('en-IN')}</span> loaded
        </span>
        {providerTotal !== undefined ? (
          <span className="text-muted-foreground">
            · {providerTotal.toLocaleString('en-IN')} provider results
          </span>
        ) : null}
      </div>

      {page1.isError ? (
        <Alert tone="error">We couldn&apos;t load hotels. Please try again.</Alert>
      ) : paged.pageError ? (
        <Alert tone="error">{paged.pageError}</Alert>
      ) : loadedCount > 0 ? (
        <>
          <p className="text-sm text-muted-foreground">
            Showing {rangeStart}–{rangeEnd} of {loadedCount.toLocaleString('en-IN')} loaded
          </p>
          <div className="space-y-3">
            {pageProperties.map((property, idx) => (
              <HotelPropertyCard
                key={
                  property.property_token ??
                  property.data_id ??
                  `${property.name ?? 'hotel'}-${idx}`
                }
                property={property}
                searchParams={baseParams as unknown as Record<string, unknown>}
              />
            ))}
          </div>
          {paged.isLoadingPage ? (
            <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />
              Loading more hotels…
            </p>
          ) : null}
          <HotelPaginationFooter
            currentPage={paged.currentPage}
            totalPages={paged.maxPage}
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

      {paged.page1.data ? (
        <DevRawResponse label="Developer data — hotel" data={paged.page1.data} />
      ) : null}
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
  children: 0,
  infants_in_seat: 0,
  infants_on_lap: 0,
  travel_class: 'economy',
  stops: 'any',
  sort_by: 'price',
  included_airlines: '',
  excluded_airlines: '',
  max_price: '',
  carry_on_bags: '',
  checked_bags: '',
  outbound_dep_start: '',
  outbound_dep_end: '',
  outbound_arr_start: '',
  outbound_arr_end: '',
  return_dep_start: '',
  return_dep_end: '',
  return_arr_start: '',
  return_arr_end: '',
  max_duration: '',
  layover_min: '',
  layover_max: '',
  included_connecting: '',
  excluded_connecting: '',
  low_emissions: false,
};

const initialHotelForm: HotelForm = {
  destination: null,
  destinationText: '',
  check_in_date: '',
  check_out_date: '',
  adults: 2,
  rooms: 1,
  sort_by: '',
  property_types: [],
  amenities: [],
  rating: '',
  min_price: '',
  max_price: '',
  free_cancellation: false,
  special_offers: false,
  eco_certified: false,
  bedrooms: '',
  bathrooms: '',
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

/**
 * Passenger-count phrases for the flight summary, shown only where count > 0
 * and with correct singular/plural wording.
 */
function flightPassengerParts(query: FlightSearchParams): string[] {
  const parts: string[] = [];
  const adults = query.adults ?? 1;
  parts.push(`${adults} ${adults === 1 ? 'adult' : 'adults'}`);
  const children = query.children ?? 0;
  if (children > 0) parts.push(`${children} ${children === 1 ? 'child' : 'children'}`);
  const infantsInSeat = query.infants_in_seat ?? 0;
  if (infantsInSeat > 0)
    parts.push(`${infantsInSeat} ${infantsInSeat === 1 ? 'infant' : 'infants'} (seat)`);
  const infantsOnLap = query.infants_on_lap ?? 0;
  if (infantsOnLap > 0)
    parts.push(`${infantsOnLap} ${infantsOnLap === 1 ? 'infant' : 'infants'} (lap)`);
  return parts;
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
        {formatFlightDate(flightQuery.outbound_date)}
        {flightQuery.return_date ? ` → ${formatFlightDate(flightQuery.return_date)}` : ''}
        {flightPassengerParts(flightQuery).map((part) => (
          <Fragment key={part}>
            <span className="mx-2">·</span>
            {part}
          </Fragment>
        ))}
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
  const [flightError, setFlightError] = useState<string | null>(null);
  const [returnDateError, setReturnDateError] = useState<string | null>(null);
  const [hotelError, setHotelError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const flights = useFlightSearch(
    flightQuery ?? { departure_id: '', arrival_id: '', outbound_date: '' },
  );

  const submitFlights = () => {
    setFlightError(null);
    setReturnDateError(null);
    // Local validation BEFORE any provider request.
    if (!flightForm.departure_id.trim() || !flightForm.arrival_id.trim()) {
      setFlightError('Enter both the departure and arrival airport codes.');
      return;
    }
    if (!flightForm.outbound_date) {
      setFlightError('Choose a departure date.');
      return;
    }
    // A round trip must have a return date — never call SearchAPI without one.
    if (flightForm.round_trip && !flightForm.return_date) {
      setReturnDateError('Return date is required for a round trip.');
      return;
    }
    if (
      flightForm.round_trip &&
      flightForm.return_date &&
      flightForm.return_date < flightForm.outbound_date
    ) {
      setReturnDateError('Return date must be after the departure date.');
      return;
    }

    const query: FlightSearchParams = {
      departure_id: flightForm.departure_id.trim().toUpperCase(),
      arrival_id: flightForm.arrival_id.trim().toUpperCase(),
      outbound_date: flightForm.outbound_date,
      type: flightForm.round_trip ? 2 : 1,
      adults: flightForm.adults,
      children: flightForm.children,
      infants_in_seat: flightForm.infants_in_seat,
      infants_on_lap: flightForm.infants_on_lap,
      travel_class: flightForm.travel_class,
      stops: flightForm.stops,
      currency,
    };
    if (flightForm.sort_by) query.sort_by = flightForm.sort_by;
    if (flightForm.included_airlines) query.included_airlines = flightForm.included_airlines;
    if (flightForm.excluded_airlines) query.excluded_airlines = flightForm.excluded_airlines;
    if (flightForm.max_price) query.max_price = Number(flightForm.max_price);
    if (flightForm.carry_on_bags !== '') query.carry_on_bags = Number(flightForm.carry_on_bags);
    if (flightForm.checked_bags !== '') query.checked_bags = Number(flightForm.checked_bags);
    const outboundTimes = timeRange(
      flightForm.outbound_dep_start,
      flightForm.outbound_dep_end,
      flightForm.outbound_arr_start,
      flightForm.outbound_arr_end,
    );
    if (outboundTimes) query.outbound_times = outboundTimes;
    if (flightForm.round_trip) {
      const returnTimes = timeRange(
        flightForm.return_dep_start,
        flightForm.return_dep_end,
        flightForm.return_arr_start,
        flightForm.return_arr_end,
      );
      if (returnTimes) query.return_times = returnTimes;
    }
    if (flightForm.max_duration) query.max_flight_duration = Number(flightForm.max_duration);
    if (flightForm.layover_min) query.layover_duration_min = Number(flightForm.layover_min);
    if (flightForm.layover_max) query.layover_duration_max = Number(flightForm.layover_max);
    if (flightForm.included_connecting)
      query.included_connecting_airports = flightForm.included_connecting;
    if (flightForm.excluded_connecting)
      query.excluded_connecting_airports = flightForm.excluded_connecting;
    if (flightForm.low_emissions) query.emissions = 1;
    if (flightForm.round_trip && flightForm.return_date) {
      query.return_date = flightForm.return_date;
    }
    setFlightQuery(query);
  };

  const submitHotels = () => {
    setHotelError(null);
    const typed = hotelForm.destinationText.trim();
    if (!typed) {
      setHotelError('Enter a destination.');
      return;
    }
    if (!hotelForm.check_in_date || !hotelForm.check_out_date) {
      setHotelError('Choose check-in and check-out dates.');
      return;
    }
    if (hotelForm.check_out_date <= hotelForm.check_in_date) {
      setHotelError('Check-out date must be after the check-in date.');
      return;
    }
    const destination = hotelForm.destination ?? {
      displayName: typed || 'Destination',
      searchQuery: `Hotels in ${typed || 'Destination'}`,
    };
    const query: HotelSearchParams = {
      destination: destinationToParam(destination),
      check_in_date: hotelForm.check_in_date,
      check_out_date: hotelForm.check_out_date,
      adults: hotelForm.adults,
      rooms: hotelForm.rooms,
      currency,
    };
    if (hotelForm.sort_by) query.sort_by = hotelForm.sort_by;
    if (hotelForm.property_types.length) query.property_types = hotelForm.property_types.join(',');
    if (hotelForm.amenities.length) query.amenities = hotelForm.amenities.join(',');
    if (hotelForm.rating) query.rating = Number(hotelForm.rating);
    if (hotelForm.free_cancellation) query.free_cancellation = 'true';
    if (hotelForm.special_offers) query.special_offers = 'true';
    if (hotelForm.eco_certified) query.eco_certified = 'true';
    if (hotelForm.bedrooms !== '') query.bedrooms = Number(hotelForm.bedrooms);
    if (hotelForm.bathrooms !== '') query.bathrooms = Number(hotelForm.bathrooms);
    if (hotelForm.min_price !== '') query.min_price = Number(hotelForm.min_price);
    if (hotelForm.max_price !== '') query.max_price = Number(hotelForm.max_price);
    setHotelQuery(query);
  };

  const searching =
    tab === 'flights' ? flights.isFetching : Boolean(hotelQuery && !hotelQuery.destination);
  const results = tab === 'flights' ? (flights.data ?? null) : null;
  const isError = tab === 'flights' ? flights.isError : false;
  const errorMessage = tab === 'flights' ? flightError : hotelError;

  const refresh = () => {
    if (tab === 'flights') {
      if (flightQuery)
        void queryClient.refetchQueries({ queryKey: ['search', 'flights', flightQuery] });
    }
  };

  const canRefresh = tab === 'flights' ? Boolean(flightQuery) : Boolean(hotelQuery);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Live Search"
        description="Search live flights and hotels."
        actions={
          <Button size="sm" variant="secondary" onClick={refresh} disabled={!canRefresh}>
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Refresh
          </Button>
        }
      />

      <div
        role="tablist"
        className="flex w-fit rounded-lg border border-border bg-card p-1 shadow-sm"
      >
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
          onChange={(patch) => {
            setFlightForm((current) => ({ ...current, ...patch }));
            // Editing the return date or trip type clears a stale inline error.
            if (patch.return_date !== undefined || patch.round_trip !== undefined) {
              setReturnDateError(null);
            }
          }}
          onSubmit={submitFlights}
          submitting={searching}
          error={errorMessage}
          returnDateError={returnDateError}
        />
      ) : (
        <HotelFormFields
          form={hotelForm}
          currency={currency}
          onCurrency={setCurrency}
          onChange={(patch) => setHotelForm((current) => ({ ...current, ...patch }))}
          onSubmit={submitHotels}
          error={errorMessage}
        />
      )}

      <SearchSummary tab={tab} flightQuery={flightQuery} hotelParams={hotelQuery} />

      {tab === 'flights' ? (
        searching && !results ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />
              Searching {tab === 'flights' ? 'flights' : 'hotels'}…
            </div>
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : isError ? (
          <Alert tone="error">We couldn&apos;t load flights. Please try again.</Alert>
        ) : results ? (
          <FlightResults
            data={results as FlightSearchResponse}
            currency={currency}
            baseParams={flightQuery}
          />
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
