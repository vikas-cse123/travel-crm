import { useState } from 'react';
import { ArrowLeft, Building2, MapPin, Pencil, Star } from 'lucide-react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { PERMISSIONS } from '@interscale/shared';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/features/auth/AuthProvider';
import { hotelImageUrl, useHotel } from '@/features/masters/masters.api';
import { MasterImageGalleryView } from './MasterImageGallery';
import {
  formatMasterDate,
  LoadingCard,
  MasterHeader,
  SafeRichText,
  Stars,
  StatusBadge,
} from './MasterUi';

const tabs = [
  ['description', 'Description'],
  ['amenities', 'Amenities'],
  ['roomTypes', 'Room Types'],
  ['mealPlans', 'Meal Plans'],
  ['pricing', 'Pricing'],
] as const;

/** Hotel price display (currency-aware), matching the pre-existing detail page. */
function money(amount: number | null | undefined, currency: string): string {
  if (amount == null) return '—';
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount);
}

/** Raw price display for room/meal/month/season rows (currency code + number). */
const plainMoney = (amount: number | null | undefined, currency: string): string =>
  amount == null ? '—' : `${currency} ${amount}`;

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

function RateList({
  months,
  seasons,
}: {
  months: Array<{ month: number; price: number | null; currency: string }> | undefined;
  seasons: Array<{
    name: string;
    startDate: string;
    endDate: string;
    price: number | null;
    currency: string;
  }> | undefined;
}) {
  if (!months?.length && !seasons?.length)
    return <p className="text-sm text-slate-500">No monthly or seasonal rates configured.</p>;
  return (
    <ul className="space-y-2 text-sm">
      {(months ?? []).map((month) => (
        <li key={`m-${month.month}`} className="flex justify-between gap-3 rounded-lg border p-2">
          <span className="font-medium text-slate-700">{MONTH_NAMES[month.month - 1]}</span>
          <span className="text-slate-600">{plainMoney(month.price, month.currency)}</span>
        </li>
      ))}
      {(seasons ?? []).map((season) => (
        <li key={`s-${season.name}-${season.startDate}`} className="flex justify-between gap-3 rounded-lg border p-2">
          <span className="font-medium text-slate-700">
            {season.name}
            <span className="ml-2 text-xs text-slate-500">
              {season.startDate.slice(0, 10)} → {season.endDate.slice(0, 10)}
            </span>
          </span>
          <span className="text-slate-600">{plainMoney(season.price, season.currency)}</span>
        </li>
      ))}
    </ul>
  );
}

export function HotelDetailsPage() {
  const { hotelId } = useParams();
  const hotel = useHotel(hotelId);
  const { hasPermission } = useAuth();
  const canViewCosting = hasPermission(PERMISSIONS.MASTER_HOTELS_VIEW_COSTING);
  const [tab, setTab] = useState<(typeof tabs)[number][0]>('description');

  if (hotel.isError) return <Navigate to="/masters/hotels" replace />;
  if (!hotel.data) return <LoadingCard />;
  const value = hotel.data;

  return (
    <div className="space-y-5">
      <MasterHeader
        title="View Hotel"
        description=""
        current={value.name}
        action={
          <div className="flex gap-2">
            <Link to="/masters/hotels">
              <Button variant="secondary">
                <ArrowLeft className="h-4 w-4" /> Back
              </Button>
            </Link>
            {hasPermission(PERMISSIONS.MASTER_HOTELS_UPDATE) && (
              <Link to={`/masters/hotels/${value.id}/edit`}>
                <Button>
                  <Pencil className="h-4 w-4" /> Edit
                </Button>
              </Link>
            )}
          </div>
        }
      />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
          {value.hasImage ? (
            <div className="bg-slate-50 p-3">
              <MasterImageGalleryView
                masterId={value.id}
                entity={value}
                download={hotelImageUrl}
                alt={value.name}
              />
            </div>
          ) : (
            <div className="flex h-48 items-center justify-center bg-gradient-to-br from-amber-500 via-orange-500 to-rose-500 text-white">
              <Building2 className="h-16 w-16 opacity-80" />
            </div>
          )}
          <div className="space-y-5 p-5">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-2xl font-semibold">{value.name}</h2>
                <StatusBadge value={value.status} />
                {value.isDefaultForCity && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-800">
                    <Star className="h-3 w-3" /> Default for city
                  </span>
                )}
              </div>
              <div className="mt-1">
                <Stars value={value.starCategory} />
              </div>
            </div>
            <dl className="grid gap-3 border-t pt-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-slate-500">Destination</dt>
                <dd className="font-medium">{value.destination.name}</dd>
              </div>
              <div>
                <dt className="text-slate-500">City</dt>
                <dd className="font-medium">{value.city.name}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Room Types</dt>
                <dd className="font-medium">{value.roomTypes.length}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Meal Plans</dt>
                <dd className="font-medium">{value.mealPlans.length}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Price</dt>
                <dd className="font-medium">{money(value.price, value.currency ?? 'INR')}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Created</dt>
                <dd className="font-medium">{formatMasterDate(value.createdAt)}</dd>
              </div>
            </dl>
            {(value.address || value.landmark) && (
              <div className="border-t pt-4 text-sm">
                <p className="flex items-center gap-1 font-medium text-slate-700">
                  <MapPin className="h-4 w-4" /> Address
                </p>
                <p className="mt-1 text-slate-600">{value.address ?? value.landmark}</p>
              </div>
            )}
            {(value.contactName || value.phone || value.email || value.website) && (
              <div className="border-t pt-4 text-sm">
                <p className="font-medium text-slate-700">Contact</p>
                <ul className="mt-1 space-y-0.5 text-slate-600">
                  {value.contactName && <li>{value.contactName}</li>}
                  {value.phone && <li>{value.phone}</li>}
                  {value.email && <li>{value.email}</li>}
                  {value.website && <li>{value.website}</li>}
                </ul>
              </div>
            )}
          </div>
        </section>
        <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
          <div className="overflow-x-auto border-b bg-slate-50">
            <div role="tablist" className="flex min-w-max">
              {tabs.map(([key, label]) => (
                <button
                  key={key}
                  role="tab"
                  aria-selected={tab === key}
                  onClick={() => setTab(key)}
                  className={`border-b-2 px-4 py-4 text-sm font-medium ${tab === key ? 'border-brand-600 bg-card text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div role="tabpanel" className="min-h-72 space-y-3 p-6">
            {tab === 'description' && <SafeRichText html={value.description} />}
            {tab === 'amenities' && (
              <SafeRichText html={value.amenities} empty="No amenities listed." />
            )}
            {tab === 'roomTypes' &&
              (value.roomTypes.length ? (
                value.roomTypes.map((room) => (
                  <div key={room.id} className="rounded-lg border p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <p className="font-medium">{room.name}</p>
                      <StatusBadge value={room.status} />
                    </div>
                    <p className="text-xs text-slate-500">
                      {[room.bedType, room.maxOccupancy ? `Sleeps ${room.maxOccupancy}` : null]
                        .filter(Boolean)
                        .join(' · ') || '—'}
                      {canViewCosting && <> · {plainMoney(room.sellingPrice, room.currency)}</>}
                    </p>
                    {canViewCosting && <RateList months={room.monthPrices} seasons={room.seasons} />}
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-500">No room types added.</p>
              ))}
            {tab === 'mealPlans' &&
              (value.mealPlans.length ? (
                value.mealPlans.map((plan) => (
                  <div key={plan.id} className="rounded-lg border p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <p className="font-medium">{plan.name}</p>
                      <StatusBadge value={plan.status} />
                    </div>
                    <p className="text-xs text-slate-500">
                      {plan.type.replaceAll('_', ' ')}
                      {canViewCosting && <> · {plainMoney(plan.sellingPrice, plan.currency)}</>}
                    </p>
                    {canViewCosting && <RateList months={plan.monthPrices} seasons={plan.seasons} />}
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-500">No meal plans added.</p>
              ))}
            {tab === 'pricing' && (
              <div className="space-y-4">
                <div className="rounded-lg border p-3 text-sm">
                  <p className="font-medium text-slate-800">Hotel Base Price</p>
                  <p className="mt-1 text-slate-600">{money(value.price, value.currency ?? 'INR')}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Used when no monthly or seasonal rate applies.
                  </p>
                </div>
                <div>
                  <h4 className="mb-2 text-sm font-semibold text-slate-800">
                    Hotel Monthly &amp; Seasonal Rates
                  </h4>
                  <RateList months={value.monthPrices} seasons={value.seasons} />
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
