import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Bookmark,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  Flame,
  Hotel,
  MapPin,
  Plane,
  Star,
  Users,
  Wifi,
} from 'lucide-react';
import type {
  FlightBookmarkSnapshot,
  HotelBookmarkSnapshot,
  LiveSearchBookmark,
  LiveSearchBookmarkType,
} from '@interscale/shared';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/utils/cn';
import { useBookmarks, useDeleteBookmark } from '@/features/search/search.api';
import { resolveHotelImageCandidates } from '@/features/search/hotel-images';
import { formatFlightDate, formatFlightTime } from './flight-format';
import { resolveHotelPrice } from './hotel-price';

const minutes = (total: number | undefined) =>
  total === undefined ? '—' : `${Math.floor(total / 60)}h ${total % 60}m`;

function formatSavedDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Readable "17 Aug 2026 • 8:42 PM" timestamp in the app's local timezone. */
function formatSavedDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const date = formatSavedDate(iso);
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  return `${date} • ${time}`;
}

/** Subtle metadata row showing exactly when a bookmark was saved. */
function SavedTimestamp({ createdAt, className }: { createdAt: string; className?: string }) {
  return (
    <p className={cn('flex items-center gap-1.5 text-xs text-muted-foreground', className)}>
      <Bookmark className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>Saved {formatSavedDateTime(createdAt)}</span>
    </p>
  );
}

/** Public bookmark code with a copy button. Copying is local-only. */
function BookmarkCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  if (!code) return null;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable (e.g. tests/older browsers); ignore.
    }
  };
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className="font-medium text-foreground">{code}</span>
      <button
        type="button"
        aria-label={`Copy bookmark ID ${code}`}
        title="Copy bookmark ID"
        onClick={copy}
        className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        {copied ? (
          <Check className="h-3 w-3" aria-hidden="true" />
        ) : (
          <Copy className="h-3 w-3" aria-hidden="true" />
        )}
        {copied ? 'Copied' : 'Copy'}
      </button>
    </span>
  );
}

/** Image carousel driven entirely by the saved snapshot (no SearchAPI). */
function BookmarkImages({
  images,
}: {
  images: { thumbnail?: string; original?: string }[] | undefined;
}) {
  const normalized = useMemo(() => {
    const seen = new Set<string>();
    const out: string[][] = [];
    for (const image of images ?? []) {
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
  }, [images]);

  const imageSignature = useMemo(() => normalized.map((c) => c[0]).join('|'), [normalized]);

  const [index, setIndex] = useState(0);
  const [failed, setFailed] = useState<Set<string>>(new Set());

  const prevSignatureRef = useRef(imageSignature);
  useEffect(() => {
    if (prevSignatureRef.current !== imageSignature) {
      prevSignatureRef.current = imageSignature;
      setIndex(0);
      setFailed(new Set());
    }
  }, [imageSignature]);

  const validImages = useMemo(
    () =>
      normalized
        .map((candidates, i) => ({ candidates, i }))
        .filter(({ candidates }) => candidates.some((url) => !failed.has(url))),
    [normalized, failed],
  );

  useEffect(() => {
    if (!validImages.length) setIndex(0);
    else setIndex((cur) => Math.min(cur, validImages.length - 1));
  }, [validImages.length]);

  const shownIndex = validImages.length ? Math.min(index, validImages.length - 1) : -1;
  const shown = shownIndex >= 0 ? validImages[shownIndex] : undefined;
  const currentUrl = shown?.candidates.find((url) => !failed.has(url)) ?? null;

  const goTo = useMemo(
    () => (next: number) => {
      if (!validImages.length) return;
      const len = validImages.length;
      setIndex(((next % len) + len) % len);
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

  useEffect(() => {
    if (!validImages.length || shownIndex < 0) return;
    const preload = (url: string | undefined) => {
      if (!url || failed.has(url)) return;
      const img = new window.Image();
      img.src = url;
    };
    const nextEntry = validImages[(shownIndex + 1) % validImages.length];
    const prevEntry =
      validImages[(shownIndex - 1 + validImages.length) % validImages.length];
    preload(nextEntry?.candidates.find((u) => !failed.has(u)));
    preload(prevEntry?.candidates.find((u) => !failed.has(u)));
  }, [shownIndex, validImages, failed]);

  const single = validImages.length <= 1;

  return (
    <div className="relative h-44 w-full overflow-hidden bg-muted sm:h-40 md:h-full">
      {currentUrl ? (
        <img
          key={currentUrl}
          src={currentUrl}
          alt="Property"
          className="h-full w-full object-cover"
          loading="lazy"
          decoding="async"
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

/** A flight bookmark card rendered entirely from the saved snapshot. */
function FlightBookmarkCard({ bookmark }: { bookmark: LiveSearchBookmark }) {
  const [open, setOpen] = useState(false);
  const flight = bookmark.snapshot.flight;
  if (!flight) return null;
  const first = flight.segments[0];
  const last = flight.segments[flight.segments.length - 1];
  const isRoundTrip = flight.type?.toLowerCase().includes('round');
  const stops = Math.max(0, flight.segments.length - 1);
  // Legacy/incomplete snapshots (created before snapshot preservation was
  // fixed) may have no segments. Render what exists; never fabricate values.
  const incomplete = flight.segments.length === 0;

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-foreground">{bookmark.title}</h3>
          <span className="flex items-center gap-2 text-sm font-medium text-foreground">
            {flight.airlineLogo ? (
              <img
                src={flight.airlineLogo}
                alt=""
                className="h-4 w-4 rounded-sm object-contain"
                loading="lazy"
              />
            ) : (
              <Plane className="h-4 w-4 text-primary" aria-hidden="true" />
            )}
            {flight.airline !== '—' ? `${flight.airline} · ` : ''}
            {flight.flightNumbers.join(' / ')}
          </span>
          <div className="mt-1">
            <BookmarkCode code={bookmark.bookmarkCode} />
          </div>
          {first && last ? (
            <p className="mt-1 text-sm text-foreground">
              <span className="font-medium">
                {first.departure_airport.id} {formatFlightTime(first.departure_airport.time)}
              </span>
              <span className="mx-2 text-muted-foreground">→</span>
              <span className="text-xs text-muted-foreground">{minutes(flight.totalDuration)}</span>
              <span className="mx-2 text-muted-foreground">→</span>
              <span className="font-medium">
                {last.arrival_airport.id} {formatFlightTime(last.arrival_airport.time)}
              </span>
            </p>
          ) : null}
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {incomplete ? (
              <Badge variant="outline">Incomplete saved data</Badge>
            ) : (
              <Badge variant="secondary">
                {stops === 0 ? 'Non-stop' : stops === 1 ? '1 stop' : `${stops} stops`}
              </Badge>
            )}
            {!incomplete ? (
              <Badge variant="secondary">{flight.segments[0]?.travel_class ?? '—'}</Badge>
            ) : null}
            {isRoundTrip ? (
              <Badge variant="outline">Round trip</Badge>
            ) : (
              <Badge variant="outline">One way</Badge>
            )}
          </div>
        </div>
        <div className="text-right">
          <p className="text-xl font-bold text-foreground">
            {!incomplete && flight.price !== undefined
              ? new Intl.NumberFormat('en-IN', {
                  style: 'currency',
                  currency: flight.currency || 'INR',
                }).format(flight.price)
              : 'Price unavailable'}
          </p>
          <p className="text-xs text-muted-foreground">Saved price</p>
          <SavedTimestamp createdAt={bookmark.createdAt} />
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex items-center gap-1 rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
        >
          {open ? 'View less' : 'View details'}
          <ChevronDown
            className={cn('h-4 w-4 transition-transform', open && 'rotate-180')}
            aria-hidden="true"
          />
        </button>
      </div>
      {open ? <FlightBookmarkDetails flight={flight} /> : null}
    </Card>
  );
}

function FlightBookmarkDetails({ flight }: { flight: FlightBookmarkSnapshot }) {
  const renderSegments = () => (
    <div className="space-y-3">
      {flight.segments.map((segment, index) => (
        <div
          key={`${segment.flight_number}-${index}`}
          className="rounded-lg border border-border bg-card-2 p-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Plane className="h-4 w-4 text-primary" aria-hidden="true" />
              {segment.airline} · {segment.flight_number}
            </span>
            <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              {segment.travel_class ?? '—'}
            </span>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
            <div>
              <p className="text-lg font-semibold text-foreground">
                {formatFlightTime(segment.departure_airport.time)}
              </p>
              <p className="text-xs text-muted-foreground">
                {segment.departure_airport.id} · {formatFlightDate(segment.departure_airport.date)}
              </p>
              <p className="text-xs text-muted-foreground/80">{segment.departure_airport.name}</p>
            </div>
            <div className="flex flex-col items-center text-center">
              <span className="text-xs font-medium text-muted-foreground">
                {minutes(segment.duration)}
              </span>
              <span className="my-1 flex w-full items-center">
                <span className="h-px flex-1 bg-border" />
                <Plane
                  className="mx-1 h-3.5 w-3.5 rotate-90 text-muted-foreground"
                  aria-hidden="true"
                />
                <span className="h-px flex-1 bg-border" />
              </span>
              {segment.airplane && (
                <span className="text-[11px] text-muted-foreground/80">{segment.airplane}</span>
              )}
            </div>
            <div className="sm:text-right">
              <p className="text-lg font-semibold text-foreground">
                {formatFlightTime(segment.arrival_airport.time)}
              </p>
              <p className="text-xs text-muted-foreground">
                {segment.arrival_airport.id} · {formatFlightDate(segment.arrival_airport.date)}
              </p>
              <p className="text-xs text-muted-foreground/80">{segment.arrival_airport.name}</p>
            </div>
          </div>
          {segment.extensions?.length ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {segment.extensions.map((ext) => (
                <Chip key={ext}>{ext}</Chip>
              ))}
            </div>
          ) : null}
          {flight.layovers?.[index] ? (
            <div className="mt-2 flex items-center gap-2 px-1 text-xs text-amber-700">
              <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {minutes(flight.layovers[index].duration)} layover at {flight.layovers[index].name} (
              {flight.layovers[index].id})
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );

  return (
    <div className="space-y-4 border-t border-border p-4">
      <section>
        <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
          <Plane className="h-4 w-4 text-primary" aria-hidden="true" />
          {flight.type?.toLowerCase().includes('round') ? 'Outbound' : 'Flight details'}
        </h4>
        {renderSegments()}
      </section>
      {flight.carbonEmissions ? (
        <div className="rounded-lg border border-border p-3">
          <p className="mb-2 text-xs font-medium text-muted-foreground">Emissions</p>
          <div className="grid gap-3 sm:grid-cols-4">
            <Field
              label="This flight"
              value={`${Math.round((flight.carbonEmissions.this_flight ?? 0) / 1000)} kg`}
            />
            <Field
              label="Typical route"
              value={`${Math.round((flight.carbonEmissions.typical_for_this_route ?? 0) / 1000)} kg`}
            />
            <Field
              label="Lowest route"
              value={`${Math.round((flight.carbonEmissions.lowest_route ?? 0) / 1000)} kg`}
            />
            <Field
              label="Difference"
              value={`${flight.carbonEmissions.difference_percent ?? 0}%`}
            />
          </div>
        </div>
      ) : null}
      {flight.extensions?.length ? (
        <div className="flex flex-wrap gap-1.5">
          {flight.extensions.map((ext) => (
            <Chip key={ext}>{ext}</Chip>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** A hotel bookmark card rendered entirely from the saved snapshot. */
function HotelBookmarkCard({ bookmark }: { bookmark: LiveSearchBookmark }) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const hotel = bookmark.snapshot.hotel;
  if (!hotel) return null;
  const primaryAmenities = (hotel.amenities ?? []).slice(0, 6);
  const pricePerNight = resolveHotelPrice(hotel.pricePerNight);
  const totalPrice = resolveHotelPrice(hotel.totalPrice);

  return (
    <Card>
      <div className="grid md:grid-cols-[220px_1fr]">
        <BookmarkImages images={hotel.images} />
        <div className="flex flex-col p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-foreground">{hotel.name}</h3>
              <div className="mt-1">
                <BookmarkCode code={bookmark.bookmarkCode} />
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                {hotel.rating ? (
                  <span className="flex items-center gap-1">
                    <Star
                      className="h-3.5 w-3.5 fill-amber-400 text-amber-400"
                      aria-hidden="true"
                    />
                    <span className="font-medium text-foreground">{hotel.rating}</span>
                    {hotel.reviews ? (
                      <span className="text-muted-foreground/80">
                        ({hotel.reviews.toLocaleString()})
                      </span>
                    ) : null}
                  </span>
                ) : null}
                {hotel.city ? (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" aria-hidden="true" />
                    {hotel.city}
                    {hotel.country ? `, ${hotel.country}` : ''}
                  </span>
                ) : null}
                {hotel.propertyType ? (
                  <Badge variant="secondary">{hotel.propertyType}</Badge>
                ) : null}
              </div>
            </div>
            {hotel.deal ? (
              <Badge variant="success">
                <Flame className="h-3 w-3" aria-hidden="true" />
                {hotel.deal}
              </Badge>
            ) : null}
          </div>

          {hotel.description ? (
            <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{hotel.description}</p>
          ) : null}

          {primaryAmenities.length ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {primaryAmenities.map((amenity) => (
                <Chip key={amenity}>{amenity}</Chip>
              ))}
              {hotel.amenities && hotel.amenities.length > primaryAmenities.length ? (
                <Chip>{`+${hotel.amenities.length - primaryAmenities.length} more`}</Chip>
              ) : null}
            </div>
          ) : null}

          <div className="mt-3 flex flex-wrap items-end justify-between gap-3 border-t border-border pt-3">
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              <div>
                <p className="text-xs text-muted-foreground">Per night (saved)</p>
                {pricePerNight.main ? (
                  <p className="text-base font-semibold text-foreground">
                    {pricePerNight.main}
                    {pricePerNight.beforeTaxes ? (
                      <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                        Before taxes
                      </span>
                    ) : null}
                  </p>
                ) : (
                  <p className="text-base font-semibold text-foreground">Price unavailable</p>
                )}
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total (saved)</p>
                {totalPrice.main ? (
                  <p className="text-base font-semibold text-foreground">
                    {totalPrice.main}
                    {totalPrice.beforeTaxes ? (
                      <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                        Before taxes
                      </span>
                    ) : null}
                  </p>
                ) : (
                  <p className="text-base font-semibold text-foreground">Price unavailable</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" aria-hidden="true" />
                {hotel.checkInTime ?? '—'} / {hotel.checkOutTime ?? '—'}
              </span>
            </div>
          </div>
          <SavedTimestamp createdAt={bookmark.createdAt} className="mt-2" />

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-4">
              {hotel.providerLink ? (
                <a
                  href={hotel.providerLink}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                >
                  View on provider <ArrowRight className="h-3 w-3" aria-hidden="true" />
                </a>
              ) : null}
              <button
                type="button"
                onClick={() => setDetailsOpen((v) => !v)}
                aria-expanded={detailsOpen}
                className="flex items-center gap-1 rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
              >
                {detailsOpen ? 'View less' : 'View details'}
                <ChevronDown
                  className={cn('h-4 w-4 transition-transform', detailsOpen && 'rotate-180')}
                  aria-hidden="true"
                />
              </button>
            </div>
          </div>
        </div>
      </div>
      {detailsOpen ? <HotelBookmarkDetails hotel={hotel} /> : null}
    </Card>
  );
}

function HotelBookmarkDetails({ hotel }: { hotel: HotelBookmarkSnapshot }) {
  const pricePerNight = resolveHotelPrice(hotel.pricePerNight);
  const totalPrice = resolveHotelPrice(hotel.totalPrice);
  return (
    <div className="grid gap-4 border-t border-border p-4 md:grid-cols-2 lg:grid-cols-3">
      <div className="space-y-1.5">
        {hotel.propertyType ? <Field label="Accommodation" value={hotel.propertyType} /> : null}
        <Field label="Check-in" value={hotel.checkInTime ?? undefined} />
        <Field label="Check-out" value={hotel.checkOutTime ?? undefined} />
        <div>
          <p className="text-xs font-medium text-muted-foreground">Per night (saved)</p>
          {pricePerNight.main ? (
            <p className="text-sm text-foreground">
              {pricePerNight.main}
              {pricePerNight.beforeTaxes ? (
                <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                  Before taxes
                </span>
              ) : null}
            </p>
          ) : (
            <p className="text-sm text-foreground">Price unavailable</p>
          )}
        </div>
        <div>
          <p className="text-xs font-medium text-muted-foreground">Total (saved)</p>
          {totalPrice.main ? (
            <p className="text-sm text-foreground">
              {totalPrice.main}
              {totalPrice.beforeTaxes ? (
                <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                  Before taxes
                </span>
              ) : null}
            </p>
          ) : (
            <p className="text-sm text-foreground">Price unavailable</p>
          )}
        </div>
        {hotel.coordinates ? (
          <Field
            label="Coordinates"
            value={`${hotel.coordinates.latitude}, ${hotel.coordinates.longitude}`}
          />
        ) : null}
        {hotel.essentialInfo?.length ? (
          <>
            <p className="pt-1 text-xs font-medium text-muted-foreground">Room & property</p>
            <div className="flex flex-wrap gap-1.5">
              {hotel.essentialInfo.map((info) => (
                <Chip key={info}>{info}</Chip>
              ))}
            </div>
          </>
        ) : null}
      </div>

      <div>
        {hotel.amenities?.length ? (
          <>
            <p className="mb-1.5 flex items-center gap-1 text-xs font-medium text-muted-foreground">
              <Wifi className="h-3 w-3" aria-hidden="true" /> All amenities
            </p>
            <div className="flex flex-wrap gap-1.5">
              {hotel.amenities.map((amenity) => (
                <Chip key={amenity}>{amenity}</Chip>
              ))}
            </div>
          </>
        ) : null}
        {hotel.excludedAmenities?.length ? (
          <>
            <p className="mb-1.5 mt-3 text-xs font-medium text-muted-foreground">Not available</p>
            <div className="flex flex-wrap gap-1.5">
              {hotel.excludedAmenities.map((amenity) => (
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
        {hotel.nearbyPlaces?.length ? (
          <>
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">Nearby places</p>
            <div className="space-y-1">
              {hotel.nearbyPlaces.map((place) => (
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
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <Field label="Location rating" value={hotel.locationRating} />
          <Field label="Transit rating" value={hotel.transitRating} />
          <Field label="Things to do" value={hotel.thingsToDoRating} />
          <Field label="Airport access" value={hotel.airportAccessRating} />
        </div>
      </div>

      {hotel.reviewsHistogram && Object.keys(hotel.reviewsHistogram).length ? (
        <div className="rounded-lg border border-border p-3 md:col-span-2 lg:col-span-3">
          <p className="mb-2 flex items-center gap-1 text-xs font-medium text-muted-foreground">
            <Users className="h-3 w-3" aria-hidden="true" /> Review histogram
          </p>
          <div className="space-y-1.5">
            {[5, 4, 3, 2, 1].map((star) => {
              const count = hotel.reviewsHistogram?.[String(star)] ?? 0;
              const total = hotel.reviews ?? 1;
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
  );
}

type BookmarkFilter = LiveSearchBookmarkType | 'ALL';

/** Calendar-date key (YYYY-MM-DD) for a saved bookmark's createdAt. */
function savedDateKey(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function BookmarksPage() {
  const [filter, setFilter] = useState<BookmarkFilter>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [savedFrom, setSavedFrom] = useState('');
  const [savedTo, setSavedTo] = useState('');
  const [appliedFrom, setAppliedFrom] = useState('');
  const [appliedTo, setAppliedTo] = useState('');
  const [rangeError, setRangeError] = useState<string | null>(null);
  const bookmarks = useBookmarks(filter === 'ALL' ? undefined : filter);
  const remove = useDeleteBookmark();

  const dateFilterApplied = Boolean(appliedFrom || appliedTo);
  const searchActive = searchQuery.trim().length > 0;

  const withinDateRange = (createdAt: string) => {
    if (!dateFilterApplied) return true;
    const key = savedDateKey(createdAt);
    if (!key) return false;
    if (appliedFrom && key < appliedFrom) return false;
    if (appliedTo && key > appliedTo) return false;
    return true;
  };

  // Client-side, in-memory search over the already-loaded bookmarks only.
  // Typing never triggers any network/API request.
  const matchesSearch = (bookmark: LiveSearchBookmark) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    if (bookmark.type === 'HOTEL') {
      const hotel = bookmark.snapshot.hotel;
      return [hotel?.name, hotel?.city, hotel?.country, bookmark.bookmarkCode, bookmark.title]
        .filter((value): value is string => Boolean(value))
        .some((value) => value.toLowerCase().includes(q));
    }
    const flight = bookmark.snapshot.flight;
    const haystack = [
      flight?.airline,
      ...(flight?.flightNumbers ?? []),
      bookmark.title,
      bookmark.bookmarkCode,
      ...(flight?.segments ?? []).flatMap((segment) => [
        segment.departure_airport?.id,
        segment.departure_airport?.name,
        segment.arrival_airport?.id,
        segment.arrival_airport?.name,
      ]),
    ]
      .filter((value): value is string => Boolean(value))
      .join(' ')
      .toLowerCase();
    return haystack.includes(q);
  };

  const list = (bookmarks.data ?? [])
    .filter((bookmark) => withinDateRange(bookmark.createdAt))
    .filter(matchesSearch);

  const applyDateRange = () => {
    if (savedFrom && savedTo && savedFrom > savedTo) {
      setRangeError('From date must be on or before the To date.');
      return;
    }
    setRangeError(null);
    setAppliedFrom(savedFrom);
    setAppliedTo(savedTo);
  };

  const clearDateRange = () => {
    setSavedFrom('');
    setSavedTo('');
    setAppliedFrom('');
    setAppliedTo('');
    setRangeError(null);
  };

  const dateInputClass =
    'w-full rounded-lg border border-slate-300 bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/60';

  return (
    <div className="space-y-4">
      <PageHeader
        title="Saved travel options"
        description="Saved prices and details reflect the time they were bookmarked. Viewing saved items does not refresh live prices."
      />

      <div
        role="tablist"
        className="flex w-fit rounded-lg border border-border bg-card p-1 shadow-sm"
      >
        {(
          [
            ['ALL', 'All'],
            ['FLIGHT', 'Flights'],
            ['HOTEL', 'Hotels'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={filter === key}
            onClick={() => setFilter(key)}
            className={cn(
              'flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors',
              filter === key
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="rounded-lg border border-border bg-card p-3">
        <input
          aria-label="Search saved bookmarks"
          type="search"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder={
            filter === 'HOTEL'
              ? 'Search saved hotels...'
              : filter === 'FLIGHT'
                ? 'Search saved flights...'
                : 'Search saved hotels & flights...'
          }
          className={`${dateInputClass} w-full sm:max-w-md`}
        />
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">Saved date</p>
            <div className="flex flex-wrap items-end gap-2">
              <label className="block text-sm font-medium text-slate-800">
                From
                <input
                  aria-label="Saved date from"
                  type="date"
                  value={savedFrom}
                  onChange={(event) => setSavedFrom(event.target.value)}
                  className={`${dateInputClass} mt-1`}
                />
              </label>
              <label className="block text-sm font-medium text-slate-800">
                To
                <input
                  aria-label="Saved date to"
                  type="date"
                  value={savedTo}
                  onChange={(event) => setSavedTo(event.target.value)}
                  className={`${dateInputClass} mt-1`}
                />
              </label>
              <Button size="sm" variant="secondary" onClick={applyDateRange}>
                Apply
              </Button>
              <Button size="sm" variant="ghost" onClick={clearDateRange}>
                Clear
              </Button>
            </div>
          </div>
          {rangeError ? (
            <p role="alert" className="text-xs text-red-600">
              {rangeError}
            </p>
          ) : null}
        </div>
      </div>

      {bookmarks.isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : bookmarks.isError ? (
        <Alert tone="error">We couldn&apos;t load bookmarks. Please try again.</Alert>
      ) : list.length ? (
        <div className="space-y-3">
          {list.map((bookmark) => (
            <div key={bookmark.id} className="relative">
              {bookmark.type === 'FLIGHT' ? (
                <FlightBookmarkCard bookmark={bookmark} />
              ) : (
                <HotelBookmarkCard bookmark={bookmark} />
              )}
              <Button
                size="sm"
                variant="secondary"
                className="absolute right-3 top-3 z-10"
                isLoading={remove.isPending}
                onClick={() => remove.mutate(bookmark.id)}
              >
                <Bookmark className="h-4 w-4" aria-hidden="true" />
                Remove bookmark
              </Button>
            </div>
          ))}
        </div>
      ) : searchActive ? (
        <EmptyState
          icon={Bookmark}
          title={
            filter === 'FLIGHT'
              ? 'No saved flights found'
              : filter === 'HOTEL'
                ? 'No saved hotels found'
                : 'No saved items found'
          }
          description="Try a different search or clear the search box to see all saved items."
        />
      ) : dateFilterApplied ? (
        <EmptyState
          icon={Bookmark}
          title="No bookmarks found for this date range."
          description="Try widening the Saved date range or clearing the filter."
        />
      ) : (
        <EmptyState
          icon={Bookmark}
          title="No bookmarks yet"
          description="Save flight or hotel results from Live Search to view them here later."
        />
      )}
    </div>
  );
}
