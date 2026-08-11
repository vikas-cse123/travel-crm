import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Archive,
  BedDouble,
  Building2,
  ChartNoAxesColumn,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  MapPin,
  MapPinned,
  Pencil,
  Plus,
  Search,
  Star,
  Utensils,
} from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { PERMISSIONS } from '@interscale/shared';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/features/auth/AuthProvider';
import {
  useArchiveHotel,
  useDestination,
  useDestinations,
  useHideGlobalMaster,
  useHotels,
  hotelImageUrl,
  type HotelSummary,
} from '@/features/masters/masters.api';
import { GlobalBadge, HIDE_GLOBAL_CONFIRM, MasterHeader, Stars } from './MasterUi';

const LARGE = new URLSearchParams('pageSize=100&status=ACTIVE');

type DestinationGroup = {
  id: string;
  name: string;
  hotels: HotelSummary[];
};

export function HotelsPage() {
  const [params, setParams] = useSearchParams();
  // The destination view must have the complete matching list, not just one page.
  const hotelParams = useMemo(() => {
    const next = new URLSearchParams(params);
    next.set('pageSize', '100');
    next.delete('page');
    return next;
  }, [params]);
  const hotels = useHotels(hotelParams);
  const destinations = useDestinations(LARGE);
  const selectedDestination = params.get('destinationId') ?? '';
  const destinationDetail = useDestination(selectedDestination || undefined);
  const archive = useArchiveHotel();
  const hideMaster = useHideGlobalMaster();
  const { hasPermission } = useAuth();
  const canCreate = hasPermission(PERMISSIONS.MASTER_HOTELS_CREATE);
  const canUpdate = hasPermission(PERMISSIONS.MASTER_HOTELS_UPDATE);
  const canArchive = hasPermission(PERMISSIONS.MASTER_HOTELS_DELETE);
  const [openDestinations, setOpenDestinations] = useState<Set<string>>(new Set());

  const cityOptions = useMemo(() => {
    const links = selectedDestination
      ? (destinationDetail.data?.cities ?? [])
      : (destinations.data?.data.flatMap((destination) => destination.cities) ?? []);
    return [...new Map(links.map((link) => [link.cityId, link])).values()].sort((a, b) =>
      a.city.name.localeCompare(b.city.name),
    );
  }, [destinationDetail.data?.cities, destinations.data?.data, selectedDestination]);

  const groups = useMemo<DestinationGroup[]>(() => {
    const grouped = new Map<string, DestinationGroup>();
    hotels.data?.data.forEach((hotel) => {
      const current = grouped.get(hotel.destination.id);
      if (current) current.hotels.push(hotel);
      else
        grouped.set(hotel.destination.id, {
          id: hotel.destination.id,
          name: hotel.destination.name,
          hotels: [hotel],
        });
    });
    return [...grouped.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [hotels.data]);

  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key === 'destinationId') next.delete('cityId');
    setParams(next);
  };
  const toggle = (id: string) =>
    setOpenDestinations((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const archiveRow = (id: string) => {
    if (window.confirm('Are you sure you want to delete this hotel?')) archive.mutate(id);
  };
  const hideRow = (id: string) => {
    if (window.confirm(HIDE_GLOBAL_CONFIRM))
      hideMaster.mutate({ masterType: 'HOTEL', masterId: id });
  };
  const addHotelPath = (destinationId?: string) =>
    destinationId ? `/masters/hotels/new?destinationId=${destinationId}` : '/masters/hotels/new';

  return (
    <div className="space-y-5">
      <MasterHeader title="Hotel Master" description="Organized by destinations" current="Hotels" />

      <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-700">Filters &amp; Actions</h2>
          {canCreate && (
            <Link to={addHotelPath()}>
              <Button size="sm">
                <Plus className="h-4 w-4" /> Add New Hotel
              </Button>
            </Link>
          )}
        </div>
        <div className="grid gap-3 p-5 md:grid-cols-[minmax(0,1.25fr)_240px_240px_240px]">
          <label className="relative">
            <span className="sr-only">Search hotels</span>
            <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <input
              aria-label="Search hotels"
              placeholder="Search hotels, cities…"
              className="w-full rounded-md border py-2.5 pl-9 pr-3 text-sm"
              value={params.get('search') ?? ''}
              onChange={(event) => update('search', event.target.value)}
            />
          </label>
          <select
            aria-label="Hotel destination"
            className="rounded-md border px-3 py-2.5 text-sm"
            value={selectedDestination}
            onChange={(event) => update('destinationId', event.target.value)}
          >
            <option value="">All Destinations</option>
            {destinations.data?.data.map((destination) => (
              <option key={destination.id} value={destination.id}>
                {destination.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Hotel city"
            className="rounded-md border px-3 py-2.5 text-sm"
            value={params.get('cityId') ?? ''}
            onChange={(event) => update('cityId', event.target.value)}
          >
            <option value="">All Cities</option>
            {cityOptions.map((link) => (
              <option key={link.cityId} value={link.cityId}>
                {link.city.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Hotel star category"
            className="rounded-md border px-3 py-2.5 text-sm"
            value={params.get('starCategory') ?? ''}
            onChange={(event) => update('starCategory', event.target.value)}
          >
            <option value="">All Star Categories</option>
            {[5, 4, 3, 2, 1].map((star) => (
              <option key={star} value={star}>
                {star} Star
              </option>
            ))}
          </select>
        </div>
      </section>

      {hotels.isPending ? (
        <div className="h-72 animate-pulse rounded-xl bg-slate-100" />
      ) : hotels.isError ? (
        <div role="alert" className="rounded-xl border bg-card p-8 text-center text-red-700">
          Hotels could not be loaded.
        </div>
      ) : !groups.length ? (
        <div className="rounded-xl border bg-card p-12 text-center">
          <Building2 className="mx-auto h-10 w-10 text-slate-300" />
          <h2 className="mt-3 font-semibold">No hotels found</h2>
          <p className="text-sm text-slate-500">Adjust the filters or add the first hotel.</p>
        </div>
      ) : (
        <>
          <div className="space-y-4">
            {groups.map((group) => {
              const isOpen = openDestinations.has(group.id);
              const cities = new Set(group.hotels.map((hotel) => hotel.city.id));
              const defaults = group.hotels.filter((hotel) => hotel.isDefaultForCity).length;
              return (
                <section
                  key={group.id}
                  className="overflow-hidden rounded-lg border bg-card shadow-sm"
                >
                  <div className="flex flex-wrap items-center gap-3 bg-slate-50 px-4 py-3">
                    <button
                      type="button"
                      onClick={() => toggle(group.id)}
                      aria-expanded={isOpen}
                      className="flex min-w-0 items-center gap-2 text-left"
                    >
                      {isOpen ? (
                        <ChevronDown className="h-5 w-5 text-slate-500" />
                      ) : (
                        <ChevronRight className="h-5 w-5 text-slate-500" />
                      )}
                      <MapPin className="h-5 w-5 text-slate-500" />
                      <span className="font-semibold text-brand-700">{group.name}</span>
                    </button>
                    <span className="text-sm text-slate-500">
                      {group.hotels.length} {group.hotels.length === 1 ? 'hotel' : 'hotels'} (
                      {cities.size} {cities.size === 1 ? 'city' : 'cities'})
                    </span>
                    {defaults > 0 && (
                      <span className="rounded bg-emerald-600 px-1.5 py-0.5 text-xs font-semibold text-white">
                        {defaults} default
                      </span>
                    )}
                    <div className="ml-auto flex gap-2">
                      {canCreate && (
                        <Link to={addHotelPath(group.id)}>
                          <Button variant="secondary" size="sm">
                            <Plus className="h-4 w-4" /> Add Hotel
                          </Button>
                        </Link>
                      )}
                      <Link to={`/masters/destinations/${group.id}`}>
                        <Button variant="secondary" size="sm">
                          View Destination
                        </Button>
                      </Link>
                    </div>
                  </div>
                  {isOpen && (
                    <HotelTable
                      hotels={group.hotels}
                      canUpdate={canUpdate}
                      canArchive={canArchive}
                      onArchive={archiveRow}
                      onHide={hideRow}
                    />
                  )}
                </section>
              );
            })}
          </div>
          <HotelStatisticsPanel statistics={hotels.data.statistics} />
        </>
      )}
    </div>
  );
}

function HotelStatisticsPanel({
  statistics,
}: {
  statistics:
    | {
        totalHotels: number;
        destinations: number;
        totalCities: number;
        averageRating: number | null;
        roomTypes: number;
        mealPlans: number;
      }
    | undefined;
}) {
  if (!statistics) return null;
  const cards = [
    ['Total Hotels', statistics.totalHotels, Building2, 'bg-cyan-600'],
    ['Destinations', statistics.destinations, MapPinned, 'bg-emerald-600'],
    ['Total Cities', statistics.totalCities, Building2, 'bg-amber-400'],
    ['Avg Rating', statistics.averageRating?.toFixed(1) ?? '—', Star, 'bg-brand-600'],
    ['Room Types', statistics.roomTypes, BedDouble, 'bg-rose-500'],
    ['Meal Plans', statistics.mealPlans, Utensils, 'bg-slate-600'],
  ] as const;
  return (
    <section className="overflow-hidden rounded-lg border bg-card shadow-sm">
      <div className="flex items-center gap-2 border-b bg-slate-50 px-5 py-3">
        <ChartNoAxesColumn className="h-5 w-5 text-slate-600" />
        <h2 className="text-lg font-semibold text-slate-700">Hotel Statistics</h2>
      </div>
      <div className="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-6">
        {cards.map(([label, value, Icon, colour]) => (
          <div key={label} className="flex items-center gap-3 rounded-lg border p-3">
            <div
              className={`flex h-14 w-14 shrink-0 items-center justify-center rounded ${colour} text-white`}
            >
              <Icon className="h-7 w-7" />
            </div>
            <div>
              <p className="text-sm text-slate-600">{label}</p>
              <p className="mt-1 text-lg font-semibold text-slate-900">{value}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function HotelTable({
  hotels,
  canUpdate,
  canArchive,
  onArchive,
  onHide,
}: {
  hotels: HotelSummary[];
  canUpdate: boolean;
  canArchive: boolean;
  onArchive: (id: string) => void;
  onHide: (id: string) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-[900px] w-full text-left text-sm">
        <thead className="bg-slate-100 text-xs font-semibold uppercase tracking-wide text-slate-600">
          <tr>
            {[
              'Hotel Name',
              'City',
              'Default',
              'Star Category',
              'User Rating',
              'Rooms',
              'Meals',
              'Actions',
            ].map((heading) => (
              <th key={heading} className="px-4 py-3">
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">
          {hotels.map((hotel) => (
            <tr key={hotel.id} className="hover:bg-slate-50">
              <td className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <HotelThumbnail hotel={hotel} />
                  <span className="font-semibold text-brand-700">
                    {hotel.name}
                    {hotel.isGlobal && <GlobalBadge />}
                  </span>
                </div>
              </td>
              <td className="px-4 py-3">
                <span className="rounded bg-slate-600 px-2 py-1 text-xs font-semibold text-white">
                  {hotel.city.name}
                </span>
              </td>
              <td className="px-4 py-3">
                {hotel.isDefaultForCity ? (
                  <span className="text-emerald-600">
                    <Star className="inline h-5 w-5 fill-current" />
                  </span>
                ) : (
                  <span className="text-slate-400">—</span>
                )}
              </td>
              <td className="px-4 py-3">
                <Stars value={hotel.starCategory} />
              </td>
              <td className="px-4 py-3">
                {hotel.starRating != null ? (
                  <span className="rounded bg-cyan-600 px-2 py-1 text-xs font-semibold text-white">
                    {hotel.starRating.toFixed(1)}/5
                  </span>
                ) : (
                  '—'
                )}
              </td>
              <td className="px-4 py-3">
                <span className="rounded bg-amber-400 px-2 py-1 text-xs font-semibold text-amber-950">
                  {hotel._count?.roomTypes ?? 0}
                </span>
              </td>
              <td className="px-4 py-3">
                <span className="rounded bg-emerald-500 px-2 py-1 text-xs font-semibold text-white">
                  {hotel._count?.mealPlans ?? 0}
                </span>
              </td>
              <td className="px-4 py-3">
                <div className="flex gap-1">
                  <Link
                    aria-label={`View ${hotel.name}`}
                    to={`/masters/hotels/${hotel.id}`}
                    className="rounded border border-cyan-600 p-2 text-cyan-600"
                  >
                    <Eye className="h-4 w-4" />
                  </Link>
                  {canUpdate && !hotel.isGlobal && (
                    <Link
                      aria-label={`Edit ${hotel.name}`}
                      to={`/masters/hotels/${hotel.id}/edit`}
                      className="rounded border border-brand-600 p-2 text-brand-600"
                    >
                      <Pencil className="h-4 w-4" />
                    </Link>
                  )}
                  {hotel.canHide && (
                    <button
                      aria-label={`Hide ${hotel.name} for this company`}
                      title="Hide this global record for your company"
                      onClick={() => onHide(hotel.id)}
                      className="rounded border border-amber-600 p-2 text-amber-600"
                    >
                      <EyeOff className="h-4 w-4" />
                    </button>
                  )}
                  {canArchive && hotel.status !== 'ARCHIVED' && !hotel.isGlobal && (
                    <button
                      aria-label={`Archive ${hotel.name}`}
                      onClick={() => onArchive(hotel.id)}
                      className="rounded border border-red-600 p-2 text-red-600"
                    >
                      <Archive className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HotelThumbnail({ hotel }: { hotel: HotelSummary }) {
  const image = useQuery({
    queryKey: ['masters', 'hotels', hotel.id, 'image'],
    queryFn: () => hotelImageUrl(hotel.id),
    enabled: hotel.hasImage,
    staleTime: 240_000,
  });
  return hotel.hasImage && image.data?.url ? (
    <img src={image.data.url} alt="" className="h-12 w-16 shrink-0 rounded object-cover" />
  ) : (
    <div className="flex h-12 w-16 shrink-0 items-center justify-center rounded bg-slate-100 text-slate-400">
      <Building2 className="h-6 w-6" />
    </div>
  );
}
