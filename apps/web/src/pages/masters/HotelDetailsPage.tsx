import { useEffect, useState } from 'react';
import { ArrowLeft, Building2, MapPin, Pencil, Star } from 'lucide-react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { PERMISSIONS } from '@interscale/shared';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/features/auth/AuthProvider';
import { hotelImageUrl, useHotel } from '@/features/masters/masters.api';
import { LoadingCard, MasterHeader, SafeRichText, Stars, StatusBadge } from './MasterUi';

const tabs = [
  ['description', 'Description'],
  ['amenities', 'Amenities'],
  ['roomTypes', 'Room Types'],
  ['mealPlans', 'Meal Plans'],
] as const;

export function HotelDetailsPage() {
  const { hotelId } = useParams();
  const hotel = useHotel(hotelId);
  const { hasPermission } = useAuth();
  const canViewCosting = hasPermission(PERMISSIONS.MASTER_HOTELS_VIEW_COSTING);
  const [tab, setTab] = useState<(typeof tabs)[number][0]>('description');
  const [imageUrl, setImageUrl] = useState('');

  useEffect(() => {
    if (!hotelId || !hotel.data?.hasImage) return;
    let active = true;
    void hotelImageUrl(hotelId)
      .then((result) => active && setImageUrl(result.url))
      .catch(() => setImageUrl(''));
    return () => {
      active = false;
    };
  }, [hotel.data?.hasImage, hotelId]);

  if (hotel.isError) return <Navigate to="/masters/hotels" replace />;
  if (!hotel.data) return <LoadingCard />;
  const value = hotel.data;

  return (
    <div className="space-y-5">
      <MasterHeader
        title="View Hotel"
        description="Hotel overview, content, room types and meal plans."
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
        <section className="overflow-hidden rounded-xl border bg-white shadow-sm">
          {imageUrl ? (
            <img src={imageUrl} alt={value.name} className="h-56 w-full object-cover" />
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
                <dt className="text-slate-500">Check-in / out</dt>
                <dd className="font-medium">
                  {value.checkInTime ?? '—'} / {value.checkOutTime ?? '—'}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Created</dt>
                <dd className="font-medium">{new Date(value.createdAt).toLocaleDateString()}</dd>
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
        <section className="overflow-hidden rounded-xl border bg-white shadow-sm">
          <div className="overflow-x-auto border-b bg-slate-50">
            <div role="tablist" className="flex min-w-max">
              {tabs.map(([key, label]) => (
                <button
                  key={key}
                  role="tab"
                  aria-selected={tab === key}
                  onClick={() => setTab(key)}
                  className={`border-b-2 px-4 py-4 text-sm font-medium ${tab === key ? 'border-brand-600 bg-white text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
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
                      {canViewCosting && room.sellingPrice != null && (
                        <>
                          {' '}
                          · {room.currency} {room.sellingPrice}
                        </>
                      )}
                    </p>
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
                      {canViewCosting && plan.sellingPrice != null && (
                        <>
                          {' '}
                          · {plan.currency} {plan.sellingPrice}
                        </>
                      )}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-500">No meal plans added.</p>
              ))}
          </div>
        </section>
      </div>
    </div>
  );
}
