import type { ServiceType } from '@prisma/client';
import { prisma } from '../../config/prisma.js';
import { ValidationError } from '../../utils/errors.js';

/**
 * Validation for the optional travel-master references on booking services
 * (Phase 15). Mirrors the quotation validator so a link that was valid on the
 * quotation stays valid on the booking it converts into.
 *
 * Three rules, all enforced here:
 *
 *  1. TENANCY — every submitted id must belong to the authenticated company.
 *     A cross-tenant id produces the same generic message as a non-existent
 *     one, so the API never confirms another company's record exists.
 *
 *  2. PARENT–CHILD — a hotel room type and meal plan must belong to the chosen
 *     hotel; a cruise room type must belong to the chosen cruise.
 *
 *  3. TYPE COMPATIBILITY — each service master is valid only for its matching
 *     ServiceType.
 *
 * Archived masters are accepted: a booking may legitimately reference something
 * archived after it was written, and conversion must never be blocked because a
 * master was archived. Soft-deleted masters are rejected for fresh writes; the
 * selectors only ever offer active masters, so an archived id in practice only
 * arrives from a row that already had it.
 *
 * Lookups are batched per master type — one query each, regardless of how many
 * services the booking contains.
 */

export interface ServiceMasterRefInput {
  serviceType: ServiceType;
  hotelId?: string | null | undefined;
  hotelRoomTypeId?: string | null | undefined;
  hotelMealPlanId?: string | null | undefined;
  airlineId?: string | null | undefined;
  cruiseId?: string | null | undefined;
  cruiseRoomTypeId?: string | null | undefined;
  vehicleId?: string | null | undefined;
  sightseeingId?: string | null | undefined;
  addOnServiceId?: string | null | undefined;
}

/** Which service master belongs to which ServiceType. */
const SERVICE_MASTER_TYPE: Record<
  'airlineId' | 'cruiseId' | 'cruiseRoomTypeId' | 'vehicleId' | 'sightseeingId' | 'addOnServiceId',
  { type: ServiceType; label: string }
> = {
  airlineId: { type: 'FLIGHT', label: 'An airline' },
  cruiseId: { type: 'CRUISE', label: 'A cruise' },
  cruiseRoomTypeId: { type: 'CRUISE', label: 'A cruise room type' },
  vehicleId: { type: 'VEHICLE_TRANSFER', label: 'A vehicle' },
  sightseeingId: { type: 'SIGHTSEEING', label: 'A sightseeing' },
  addOnServiceId: { type: 'OTHER_ADD_ON', label: 'An add-on service' },
};

const unique = (values: (string | null | undefined)[]): string[] => [
  ...new Set(values.filter((value): value is string => Boolean(value))),
];

function missing(label: string): never {
  throw new ValidationError(`The selected ${label} is not available.`);
}

/**
 * Validate every master reference on a set of booking service rows. Throws on
 * the first problem; returns nothing on success. Rows are validated for hotel
 * (parent-child) and service masters together.
 */
export async function validateServiceMasterRefs(
  companyId: string,
  services: ServiceMasterRefInput[],
): Promise<void> {
  // --- Service-type compatibility (pure, no I/O) ---------------------------
  for (const row of services) {
    for (const [key, rule] of Object.entries(SERVICE_MASTER_TYPE)) {
      const value = row[key as keyof typeof SERVICE_MASTER_TYPE];
      if (value && row.serviceType !== rule.type) {
        throw new ValidationError(
          `${rule.label} can only be linked to a ${rule.type.replaceAll('_', ' ').toLowerCase()} service.`,
        );
      }
    }
  }

  // A room type or meal plan without its hotel cannot prove parentage.
  if (services.some((row) => (row.hotelRoomTypeId || row.hotelMealPlanId) && !row.hotelId)) {
    throw new ValidationError('Select a hotel before choosing a room type or meal plan.');
  }
  if (services.some((row) => row.cruiseRoomTypeId && !row.cruiseId)) {
    throw new ValidationError('Select a cruise before choosing a cruise room type.');
  }

  const hotelIds = unique(services.map((row) => row.hotelId));
  const roomTypeIds = unique(services.map((row) => row.hotelRoomTypeId));
  const mealPlanIds = unique(services.map((row) => row.hotelMealPlanId));
  const airlineIds = unique(services.map((row) => row.airlineId));
  const cruiseIds = unique(services.map((row) => row.cruiseId));
  const cruiseRoomTypeIds = unique(services.map((row) => row.cruiseRoomTypeId));
  const vehicleIds = unique(services.map((row) => row.vehicleId));
  const sightseeingIds = unique(services.map((row) => row.sightseeingId));
  const addOnServiceIds = unique(services.map((row) => row.addOnServiceId));

  const [
    hotels,
    roomTypes,
    mealPlans,
    airlines,
    cruises,
    cruiseRoomTypes,
    vehicles,
    sightseeings,
    addOnServices,
  ] = await Promise.all([
    hotelIds.length
      ? prisma.hotel.findMany({ where: { id: { in: hotelIds }, companyId }, select: { id: true } })
      : [],
    roomTypeIds.length
      ? prisma.hotelRoomType.findMany({
          where: { id: { in: roomTypeIds }, companyId },
          select: { id: true, hotelId: true },
        })
      : [],
    mealPlanIds.length
      ? prisma.hotelMealPlan.findMany({
          where: { id: { in: mealPlanIds }, companyId },
          select: { id: true, hotelId: true },
        })
      : [],
    airlineIds.length
      ? prisma.airline.findMany({
          where: { id: { in: airlineIds }, companyId },
          select: { id: true },
        })
      : [],
    cruiseIds.length
      ? prisma.cruise.findMany({
          where: { id: { in: cruiseIds }, companyId },
          select: { id: true },
        })
      : [],
    cruiseRoomTypeIds.length
      ? prisma.cruiseRoomType.findMany({
          where: { id: { in: cruiseRoomTypeIds }, companyId },
          select: { id: true, cruiseId: true },
        })
      : [],
    vehicleIds.length
      ? prisma.vehicle.findMany({
          where: { id: { in: vehicleIds }, companyId },
          select: { id: true },
        })
      : [],
    sightseeingIds.length
      ? prisma.sightseeing.findMany({
          where: { id: { in: sightseeingIds }, companyId },
          select: { id: true },
        })
      : [],
    addOnServiceIds.length
      ? prisma.addOnService.findMany({
          where: { id: { in: addOnServiceIds }, companyId },
          select: { id: true },
        })
      : [],
  ]);

  const has = (rows: { id: string }[]) => new Set(rows.map((row) => row.id));
  const hotelSet = has(hotels);
  const airlineSet = has(airlines);
  const cruiseSet = has(cruises);
  const vehicleSet = has(vehicles);
  const sightseeingSet = has(sightseeings);
  const addOnSet = has(addOnServices);

  for (const id of hotelIds) if (!hotelSet.has(id)) missing('hotel');
  for (const id of airlineIds) if (!airlineSet.has(id)) missing('airline');
  for (const id of cruiseIds) if (!cruiseSet.has(id)) missing('cruise');
  for (const id of vehicleIds) if (!vehicleSet.has(id)) missing('vehicle');
  for (const id of sightseeingIds) if (!sightseeingSet.has(id)) missing('sightseeing');
  for (const id of addOnServiceIds) if (!addOnSet.has(id)) missing('add-on service');

  const roomTypeParent = new Map(roomTypes.map((row) => [row.id, row.hotelId]));
  const mealPlanParent = new Map(mealPlans.map((row) => [row.id, row.hotelId]));
  const cruiseRoomTypeParent = new Map(cruiseRoomTypes.map((row) => [row.id, row.cruiseId]));

  for (const row of services) {
    if (row.hotelRoomTypeId) {
      const parent = roomTypeParent.get(row.hotelRoomTypeId);
      if (!parent) missing('room type');
      if (parent !== row.hotelId)
        throw new ValidationError('The selected room type does not belong to the selected hotel.');
    }
    if (row.hotelMealPlanId) {
      const parent = mealPlanParent.get(row.hotelMealPlanId);
      if (!parent) missing('meal plan');
      if (parent !== row.hotelId)
        throw new ValidationError('The selected meal plan does not belong to the selected hotel.');
    }
    if (row.cruiseRoomTypeId) {
      const parent = cruiseRoomTypeParent.get(row.cruiseRoomTypeId);
      if (!parent) missing('cruise room type');
      if (parent !== row.cruiseId)
        throw new ValidationError('The selected room type does not belong to the selected cruise.');
    }
  }
}
