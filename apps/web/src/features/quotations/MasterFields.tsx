import { useMemo } from 'react';
import { MasterSelect, type MasterOption } from '@/components/ui/MasterSelect';
import {
  useAddOnServices,
  useAirlines,
  useCruise,
  useCruises,
  useHotel,
  useHotels,
  useSightseeingList,
  useVehicles,
} from '@/features/masters/masters.api';

/**
 * The master pickers shared by the quotation builder and the template builder.
 *
 * These components only choose ids and hand back a patch; the caller writes
 * both the id and the snapshot text onto its own row. That split is deliberate:
 * the snapshot columns stay authoritative for rendering, so a row keeps reading
 * correctly long after the master it came from is renamed or archived.
 *
 * Nothing here is required. A row with no master selected is a normal,
 * fully supported row.
 */

const ACTIVE = () => new URLSearchParams({ status: 'ACTIVE', pageSize: '100' });

// ---------------------------------------------------------------------------
// Hotels
// ---------------------------------------------------------------------------

export interface HotelRowPatch {
  hotelId?: string | null | undefined;
  hotelRoomTypeId?: string | null | undefined;
  hotelMealPlanId?: string | null | undefined;
  city?: string;
  hotelName?: string;
  roomType?: string | null;
  mealPlan?: string | null;
  category?: string | null;
  internalCost?: number;
  sellingPrice?: number;
}

interface HotelMasterFieldsProps {
  value: {
    hotelId?: string | null | undefined;
    hotelRoomTypeId?: string | null | undefined;
    hotelMealPlanId?: string | null | undefined;
  };
  /** Costing inputs are hidden without the permission, so never prefill them. */
  canCost: boolean;
  onChange: (patch: HotelRowPatch) => void;
}

export function HotelMasterFields({ value, canCost, onChange }: HotelMasterFieldsProps) {
  const hotels = useHotels(ACTIVE());
  const detail = useHotel(value.hotelId ?? undefined);

  const hotelOptions = useMemo<MasterOption[]>(
    () =>
      (hotels.data?.data ?? []).map((hotel) => ({
        id: hotel.id,
        label: hotel.name,
        hint: hotel.city?.name,
      })),
    [hotels.data],
  );
  const roomTypes = detail.data?.roomTypes ?? [];
  const mealPlans = detail.data?.mealPlans ?? [];

  /**
   * Cost and price are recomputed from the room type and meal plan together,
   * never accumulated, so switching either one cannot drift the totals.
   */
  const pricing = (roomTypeId: string | null, mealPlanId: string | null): HotelRowPatch => {
    const room = roomTypes.find((entry) => entry.id === roomTypeId);
    const meal = mealPlans.find((entry) => entry.id === mealPlanId);
    const selling = (room?.sellingPrice ?? 0) + (meal?.sellingPrice ?? 0);
    // A master with no price of its own must not overwrite a typed figure.
    if (!room?.sellingPrice && !meal?.sellingPrice) return {};
    return {
      sellingPrice: selling,
      ...(canCost ? { internalCost: (room?.baseCost ?? 0) + (meal?.baseCost ?? 0) } : {}),
    };
  };

  return (
    <>
      <MasterSelect
        ariaLabel="Hotel master"
        placeholder="Link a hotel"
        options={hotelOptions}
        value={value.hotelId}
        loading={hotels.isPending}
        fallbackLabel={detail.data?.name}
        onSelect={(option) =>
          onChange({
            hotelId: option?.id ?? null,
            // The child selections belong to the previous hotel.
            hotelRoomTypeId: null,
            hotelMealPlanId: null,
            ...(option
              ? { hotelName: option.label, ...(option.hint ? { city: option.hint } : {}) }
              : {}),
          })
        }
      />
      <MasterSelect
        ariaLabel="Room type master"
        placeholder={value.hotelId ? 'Link a room type' : 'Select a hotel first'}
        options={roomTypes.map((room) => ({ id: room.id, label: room.name }))}
        value={value.hotelRoomTypeId}
        disabled={!value.hotelId}
        loading={Boolean(value.hotelId) && detail.isPending}
        onSelect={(option) =>
          onChange({
            hotelRoomTypeId: option?.id ?? null,
            ...(option ? { roomType: option.label } : {}),
            ...pricing(option?.id ?? null, value.hotelMealPlanId ?? null),
          })
        }
      />
      <MasterSelect
        ariaLabel="Meal plan master"
        placeholder={value.hotelId ? 'Link a meal plan' : 'Select a hotel first'}
        options={mealPlans.map((meal) => ({ id: meal.id, label: meal.name, hint: meal.type }))}
        value={value.hotelMealPlanId}
        disabled={!value.hotelId}
        loading={Boolean(value.hotelId) && detail.isPending}
        onSelect={(option) =>
          onChange({
            hotelMealPlanId: option?.id ?? null,
            ...(option ? { mealPlan: option.label } : {}),
            ...pricing(value.hotelRoomTypeId ?? null, option?.id ?? null),
          })
        }
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Services
// ---------------------------------------------------------------------------

export interface ServiceRowPatch {
  airlineId?: string | null | undefined;
  cruiseId?: string | null | undefined;
  cruiseRoomTypeId?: string | null | undefined;
  vehicleId?: string | null | undefined;
  sightseeingId?: string | null | undefined;
  addOnServiceId?: string | null | undefined;
  name?: string;
  sellingPrice?: number;
}

export const SERVICE_MASTER_KEYS = [
  'airlineId',
  'cruiseId',
  'cruiseRoomTypeId',
  'vehicleId',
  'sightseeingId',
  'addOnServiceId',
] as const;

/** Every master link cleared — used when the service type changes. */
export const CLEARED_SERVICE_MASTERS: ServiceRowPatch = Object.fromEntries(
  SERVICE_MASTER_KEYS.map((key) => [key, null]),
);

interface ServiceMasterFieldsProps {
  serviceType: string;
  value: {
    airlineId?: string | null | undefined;
    cruiseId?: string | null | undefined;
    cruiseRoomTypeId?: string | null | undefined;
    vehicleId?: string | null | undefined;
    sightseeingId?: string | null | undefined;
    addOnServiceId?: string | null | undefined;
  };
  onChange: (patch: ServiceRowPatch) => void;
}

/**
 * Renders the picker that matches the row's service type, and nothing for the
 * types that have no master behind them. The server enforces the same pairing.
 */
export function ServiceMasterFields({ serviceType, value, onChange }: ServiceMasterFieldsProps) {
  const enabled = {
    flight: serviceType === 'FLIGHT',
    cruise: serviceType === 'CRUISE',
    vehicle: serviceType === 'VEHICLE_TRANSFER',
    sightseeing: serviceType === 'SIGHTSEEING',
    addOn: serviceType === 'OTHER_ADD_ON',
  };

  if (enabled.flight) return <AirlineField value={value.airlineId} onChange={onChange} />;
  if (enabled.cruise) return <CruiseFields value={value} onChange={onChange} />;
  if (enabled.vehicle) return <VehicleField value={value.vehicleId} onChange={onChange} />;
  if (enabled.sightseeing)
    return <SightseeingField value={value.sightseeingId} onChange={onChange} />;
  if (enabled.addOn) return <AddOnField value={value.addOnServiceId} onChange={onChange} />;
  return null;
}

function AirlineField({
  value,
  onChange,
}: {
  value: string | null | undefined;
  onChange: (patch: ServiceRowPatch) => void;
}) {
  const airlines = useAirlines(ACTIVE());
  return (
    <MasterSelect
      ariaLabel="Airline master"
      placeholder="Link an airline"
      options={(airlines.data?.data ?? []).map((row) => ({ id: row.id, label: row.name }))}
      value={value}
      loading={airlines.isPending}
      // Airlines carry no price, so the row's own figures are left untouched.
      onSelect={(option) =>
        onChange({ airlineId: option?.id ?? null, ...(option ? { name: option.label } : {}) })
      }
    />
  );
}

function CruiseFields({
  value,
  onChange,
}: {
  value: { cruiseId?: string | null | undefined; cruiseRoomTypeId?: string | null | undefined };
  onChange: (patch: ServiceRowPatch) => void;
}) {
  const cruises = useCruises(ACTIVE());
  const detail = useCruise(value.cruiseId ?? undefined);
  const roomTypes = detail.data?.roomTypes ?? [];
  return (
    <>
      <MasterSelect
        ariaLabel="Cruise master"
        placeholder="Link a cruise"
        options={(cruises.data?.data ?? []).map((row) => ({ id: row.id, label: row.name }))}
        value={value.cruiseId}
        loading={cruises.isPending}
        fallbackLabel={detail.data?.name}
        onSelect={(option) =>
          onChange({
            cruiseId: option?.id ?? null,
            cruiseRoomTypeId: null,
            ...(option ? { name: option.label } : {}),
          })
        }
      />
      <MasterSelect
        ariaLabel="Cruise room type master"
        placeholder={value.cruiseId ? 'Link a cabin' : 'Select a cruise first'}
        options={roomTypes.map((room) => ({ id: room.id, label: room.name }))}
        value={value.cruiseRoomTypeId}
        disabled={!value.cruiseId}
        loading={Boolean(value.cruiseId) && detail.isPending}
        onSelect={(option) => {
          const room = roomTypes.find((entry) => entry.id === option?.id);
          onChange({
            cruiseRoomTypeId: option?.id ?? null,
            // price is absent for viewers without the costing permission.
            ...(room?.price ? { sellingPrice: room.price } : {}),
          });
        }}
      />
    </>
  );
}

function VehicleField({
  value,
  onChange,
}: {
  value: string | null | undefined;
  onChange: (patch: ServiceRowPatch) => void;
}) {
  const vehicles = useVehicles(ACTIVE());
  return (
    <MasterSelect
      ariaLabel="Vehicle master"
      placeholder="Link a vehicle"
      options={(vehicles.data?.data ?? []).map((row) => ({
        id: row.id,
        label: row.name,
        hint: row.vehicleType,
      }))}
      value={value}
      loading={vehicles.isPending}
      onSelect={(option) =>
        onChange({ vehicleId: option?.id ?? null, ...(option ? { name: option.label } : {}) })
      }
    />
  );
}

function SightseeingField({
  value,
  onChange,
}: {
  value: string | null | undefined;
  onChange: (patch: ServiceRowPatch) => void;
}) {
  const sightseeing = useSightseeingList(ACTIVE());
  return (
    <MasterSelect
      ariaLabel="Sightseeing master"
      placeholder="Link a sightseeing"
      options={(sightseeing.data?.data ?? []).map((row) => ({ id: row.id, label: row.title }))}
      value={value}
      loading={sightseeing.isPending}
      onSelect={(option) =>
        onChange({ sightseeingId: option?.id ?? null, ...(option ? { name: option.label } : {}) })
      }
    />
  );
}

function AddOnField({
  value,
  onChange,
}: {
  value: string | null | undefined;
  onChange: (patch: ServiceRowPatch) => void;
}) {
  const services = useAddOnServices(ACTIVE());
  const rows = services.data?.data ?? [];
  return (
    <MasterSelect
      ariaLabel="Add-on service master"
      placeholder="Link an add-on service"
      options={rows.map((row) => ({ id: row.id, label: row.name }))}
      value={value}
      loading={services.isPending}
      onSelect={(option) => {
        const row = rows.find((entry) => entry.id === option?.id);
        onChange({
          addOnServiceId: option?.id ?? null,
          ...(option ? { name: option.label } : {}),
          ...(row?.price ? { sellingPrice: row.price } : {}),
        });
      }}
    />
  );
}
