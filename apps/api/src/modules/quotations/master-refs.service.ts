import type { ServiceType } from '@prisma/client';
import { MASTER_TYPE } from '@interscale/shared';
import { prisma } from '../../config/prisma.js';
import type { AuthContext } from '../../middleware/authenticate.js';
import { ValidationError } from '../../utils/errors.js';
import { resolveMasterScope, type MasterScope } from '../masters/master-visibility.js';

/**
 * Validation for the optional travel-master references on quotation and
 * template rows (Phase 14).
 *
 * Three rules, all enforced here rather than in controllers:
 *
 *  1. TENANCY — every submitted id must belong to the authenticated company or
 *     be a currently-visible System Global record. A cross-tenant id produces
 *     the same generic message as a non-existent one, so the API never confirms
 *     that another company's record exists.
 *
 *  2. PARENT–CHILD — a hotel room type and meal plan must belong to the chosen
 *     hotel; a cruise room type must belong to the chosen cruise. A child is
 *     never used to infer its parent.
 *
 *  3. TYPE COMPATIBILITY — each service master is valid only for its matching
 *     ServiceType. Mismatches are rejected rather than silently stored.
 *
 * Tenant-owned masters retain the pre-existing tenancy-only behavior. A fresh
 * System Global link must still be active, unarchived and visible to the tenant.
 * An exact System Global id already linked to the quotation/template may be
 * retained after that tenant hides it or the System Admin archives it. This
 * preserves historical snapshots without making hidden records selectable for
 * new rows.
 *
 * Lookups are batched per master type — one query each, regardless of how many
 * rows the version contains.
 */

export interface HotelRefInput {
  hotelId?: string | null | undefined;
  hotelRoomTypeId?: string | null | undefined;
  hotelMealPlanId?: string | null | undefined;
  // Multi-room hotel options carry per-line master references that must pass
  // the same tenancy and parent-child rules as the row-level ones.
  roomLines?: Array<{
    hotelRoomTypeId?: string | null | undefined;
  }> | null | undefined;
  mealPlanLines?: Array<{
    hotelMealPlanId?: string | null | undefined;
  }> | null | undefined;
}

export interface ServiceRefInput {
  serviceType: ServiceType;
  airlineId?: string | null | undefined;
  cruiseId?: string | null | undefined;
  cruiseRoomTypeId?: string | null | undefined;
  vehicleId?: string | null | undefined;
  sightseeingId?: string | null | undefined;
  addOnServiceId?: string | null | undefined;
}

/** Existing links which may be retained after a global master is hidden/archived. */
export interface RetainedMasterRefs {
  hotels?: HotelRefInput[] | undefined;
  services?: ServiceRefInput[] | undefined;
}

/** Company owners approved for image hydration after validation succeeds. */
export interface MasterRefValidationResult {
  imageOwnerCompanyIds: string[];
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

type ScopedMaster = {
  id: string;
  companyId: string;
  status: string;
  deletedAt?: Date | null;
};

type ScopedChildMaster = {
  id: string;
  companyId: string;
  status: string;
};

const ids = (values: (string | null | undefined)[]) => new Set(unique(values));

function ownerCompanyIds(scope: MasterScope): string[] {
  return [scope.tenantCompanyId, scope.systemCompanyId].filter(
    (id, index, values): id is string => Boolean(id) && values.indexOf(id) === index,
  );
}

/**
 * Tenant rows keep the validator's historical tenancy-only behavior. Global
 * rows are accepted only while visible, unless this exact id was already linked.
 */
function masterAvailable(
  row: ScopedMaster | undefined,
  scope: MasterScope,
  retainedIds: ReadonlySet<string>,
): boolean {
  if (!row) return false;
  if (row.companyId === scope.tenantCompanyId) return true;
  if (!scope.systemCompanyId || row.companyId !== scope.systemCompanyId) return false;
  if (retainedIds.has(row.id)) return true;
  return (
    row.status === 'ACTIVE' && row.deletedAt == null && !scope.hiddenMasterIds.includes(row.id)
  );
}

/** Child rows must share the allowed parent's owner as well as its id. */
function childAvailable(
  child: ScopedChildMaster | undefined,
  parent: ScopedMaster | undefined,
  scope: MasterScope,
  retainedChildIds: ReadonlySet<string>,
  retainedParentIds: ReadonlySet<string>,
): boolean {
  if (!child || !parent || child.companyId !== parent.companyId) return false;
  if (child.companyId === scope.tenantCompanyId) return true;
  if (!scope.systemCompanyId || child.companyId !== scope.systemCompanyId) return false;
  if (retainedChildIds.has(child.id) && retainedParentIds.has(parent.id)) return true;
  return child.status === 'ACTIVE' && masterAvailable(parent, scope, new Set());
}

/** Human label used in the generic "not available" message. */
function missing(label: string): never {
  throw new ValidationError(`The selected ${label} is not available.`);
}

/**
 * Validate every master reference on a version's or template's hotel and
 * service rows. Throws on the first problem; returns nothing on success.
 */
export async function validateMasterRefs(
  auth: AuthContext,
  hotels: HotelRefInput[],
  services: ServiceRefInput[],
  retained: RetainedMasterRefs = {},
): Promise<MasterRefValidationResult> {
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

  // --- Hotels --------------------------------------------------------------
  const hotelLineRoomTypeIds = (row: HotelRefInput) =>
    (Array.isArray(row.roomLines) ? row.roomLines : []).map((line) => line?.hotelRoomTypeId ?? null);
  const hotelLineMealPlanIds = (row: HotelRefInput) =>
    (Array.isArray(row.mealPlanLines) ? row.mealPlanLines : []).map((line) => line?.hotelMealPlanId ?? null);
  const hotelIds = unique(hotels.map((row) => row.hotelId));
  const roomTypeIds = unique(hotels.flatMap((row) => [row.hotelRoomTypeId, ...hotelLineRoomTypeIds(row)]));
  const mealPlanIds = unique(hotels.flatMap((row) => [row.hotelMealPlanId, ...hotelLineMealPlanIds(row)]));
  const retainedHotelIds = ids((retained.hotels ?? []).map((row) => row.hotelId));
  const retainedRoomTypeIds = ids((retained.hotels ?? []).map((row) => row.hotelRoomTypeId));
  const retainedMealPlanIds = ids((retained.hotels ?? []).map((row) => row.hotelMealPlanId));

  // A room type or meal plan without its hotel would leave the row unable to
  // prove parentage, so require the hotel explicitly rather than inferring it.
  if (
    hotels.some(
      (row) =>
        ((row.hotelRoomTypeId || row.hotelMealPlanId ||
          hotelLineRoomTypeIds(row).some(Boolean) ||
          hotelLineMealPlanIds(row).some(Boolean)) &&
          !row.hotelId),
    )
  ) {
    throw new ValidationError('Select a hotel before choosing a room type or meal plan.');
  }

  const [hotelScope, airlineScope, cruiseScope, vehicleScope, sightseeingScope, addOnScope] =
    await Promise.all([
      resolveMasterScope(auth, MASTER_TYPE.HOTEL),
      resolveMasterScope(auth, MASTER_TYPE.AIRLINE),
      resolveMasterScope(auth, MASTER_TYPE.CRUISE),
      resolveMasterScope(auth, MASTER_TYPE.VEHICLE),
      resolveMasterScope(auth, MASTER_TYPE.SIGHTSEEING),
      resolveMasterScope(auth, MASTER_TYPE.ADD_ON_SERVICE),
    ]);
  const hotelOwnerIds = ownerCompanyIds(hotelScope);

  const [foundHotels, foundRoomTypes, foundMealPlans] = await Promise.all([
    hotelIds.length
      ? prisma.hotel.findMany({
          where: { id: { in: hotelIds }, companyId: { in: hotelOwnerIds } },
          select: { id: true, companyId: true, status: true, deletedAt: true },
        })
      : [],
    roomTypeIds.length
      ? prisma.hotelRoomType.findMany({
          where: { id: { in: roomTypeIds }, companyId: { in: hotelOwnerIds } },
          select: { id: true, companyId: true, hotelId: true, status: true },
        })
      : [],
    mealPlanIds.length
      ? prisma.hotelMealPlan.findMany({
          where: { id: { in: mealPlanIds }, companyId: { in: hotelOwnerIds } },
          select: { id: true, companyId: true, hotelId: true, status: true },
        })
      : [],
  ]);

  const hotelById = new Map(foundHotels.map((row) => [row.id, row]));
  for (const id of hotelIds)
    if (!masterAvailable(hotelById.get(id), hotelScope, retainedHotelIds)) missing('hotel');

  const roomTypeById = new Map(foundRoomTypes.map((row) => [row.id, row]));
  const mealPlanById = new Map(foundMealPlans.map((row) => [row.id, row]));

  const validateRoomTypeRef = (roomTypeId: string, row: HotelRefInput, context: string) => {
    const child = roomTypeById.get(roomTypeId);
    const parent = row.hotelId ? hotelById.get(row.hotelId) : undefined;
    if (!childAvailable(child, parent, hotelScope, retainedRoomTypeIds, retainedHotelIds))
      missing('room type');
    if (child!.hotelId !== row.hotelId)
      throw new ValidationError(
        `The selected room type does not belong to the selected hotel${context}.`,
      );
  };
  const validateMealPlanRef = (mealPlanId: string, row: HotelRefInput, context: string) => {
    const child = mealPlanById.get(mealPlanId);
    const parent = row.hotelId ? hotelById.get(row.hotelId) : undefined;
    if (!childAvailable(child, parent, hotelScope, retainedMealPlanIds, retainedHotelIds))
      missing('meal plan');
    if (child!.hotelId !== row.hotelId)
      throw new ValidationError(
        `The selected meal plan does not belong to the selected hotel${context}.`,
      );
  };

  for (const row of hotels) {
    if (row.hotelRoomTypeId) validateRoomTypeRef(row.hotelRoomTypeId, row, '');
    if (row.hotelMealPlanId) validateMealPlanRef(row.hotelMealPlanId, row, '');
    // Every room allocation / meal-plan line must point at the same hotel.
    (Array.isArray(row.roomLines) ? row.roomLines : []).forEach((line, index) => {
      if (line?.hotelRoomTypeId) validateRoomTypeRef(line.hotelRoomTypeId, row, ` (Room ${index + 1})`);
    });
    (Array.isArray(row.mealPlanLines) ? row.mealPlanLines : []).forEach((line, index) => {
      if (line?.hotelMealPlanId)
        validateMealPlanRef(line.hotelMealPlanId, row, ` (Meal Plan ${index + 1})`);
    });
  }

  // --- Services ------------------------------------------------------------
  const airlineIds = unique(services.map((row) => row.airlineId));
  const cruiseIds = unique(services.map((row) => row.cruiseId));
  const cruiseRoomTypeIds = unique(services.map((row) => row.cruiseRoomTypeId));
  const vehicleIds = unique(services.map((row) => row.vehicleId));
  const sightseeingIds = unique(services.map((row) => row.sightseeingId));
  const addOnServiceIds = unique(services.map((row) => row.addOnServiceId));
  const retainedAirlineIds = ids((retained.services ?? []).map((row) => row.airlineId));
  const retainedCruiseIds = ids((retained.services ?? []).map((row) => row.cruiseId));
  const retainedCruiseRoomTypeIds = ids(
    (retained.services ?? []).map((row) => row.cruiseRoomTypeId),
  );
  const retainedVehicleIds = ids((retained.services ?? []).map((row) => row.vehicleId));
  const retainedSightseeingIds = ids((retained.services ?? []).map((row) => row.sightseeingId));
  const retainedAddOnServiceIds = ids((retained.services ?? []).map((row) => row.addOnServiceId));

  if (services.some((row) => row.cruiseRoomTypeId && !row.cruiseId)) {
    throw new ValidationError('Select a cruise before choosing a cruise room type.');
  }

  const [airlines, cruises, cruiseRoomTypes, vehicles, sightseeings, addOnServices] =
    await Promise.all([
      airlineIds.length
        ? prisma.airline.findMany({
            where: { id: { in: airlineIds }, companyId: { in: ownerCompanyIds(airlineScope) } },
            select: { id: true, companyId: true, status: true, deletedAt: true },
          })
        : [],
      cruiseIds.length
        ? prisma.cruise.findMany({
            where: { id: { in: cruiseIds }, companyId: { in: ownerCompanyIds(cruiseScope) } },
            select: { id: true, companyId: true, status: true, deletedAt: true },
          })
        : [],
      cruiseRoomTypeIds.length
        ? prisma.cruiseRoomType.findMany({
            where: {
              id: { in: cruiseRoomTypeIds },
              companyId: { in: ownerCompanyIds(cruiseScope) },
            },
            select: { id: true, companyId: true, cruiseId: true, status: true },
          })
        : [],
      vehicleIds.length
        ? prisma.vehicle.findMany({
            where: { id: { in: vehicleIds }, companyId: { in: ownerCompanyIds(vehicleScope) } },
            select: { id: true, companyId: true, status: true, deletedAt: true },
          })
        : [],
      sightseeingIds.length
        ? prisma.sightseeing.findMany({
            where: {
              id: { in: sightseeingIds },
              companyId: { in: ownerCompanyIds(sightseeingScope) },
            },
            select: { id: true, companyId: true, status: true, deletedAt: true },
          })
        : [],
      addOnServiceIds.length
        ? prisma.addOnService.findMany({
            where: {
              id: { in: addOnServiceIds },
              companyId: { in: ownerCompanyIds(addOnScope) },
            },
            select: { id: true, companyId: true, status: true, deletedAt: true },
          })
        : [],
    ]);

  const airlineById = new Map(airlines.map((row) => [row.id, row]));
  const cruiseById = new Map(cruises.map((row) => [row.id, row]));
  const vehicleById = new Map(vehicles.map((row) => [row.id, row]));
  const sightseeingById = new Map(sightseeings.map((row) => [row.id, row]));
  const addOnById = new Map(addOnServices.map((row) => [row.id, row]));

  for (const id of airlineIds)
    if (!masterAvailable(airlineById.get(id), airlineScope, retainedAirlineIds)) missing('airline');
  for (const id of cruiseIds)
    if (!masterAvailable(cruiseById.get(id), cruiseScope, retainedCruiseIds)) missing('cruise');
  for (const id of vehicleIds)
    if (!masterAvailable(vehicleById.get(id), vehicleScope, retainedVehicleIds)) missing('vehicle');
  for (const id of sightseeingIds)
    if (!masterAvailable(sightseeingById.get(id), sightseeingScope, retainedSightseeingIds))
      missing('sightseeing');
  for (const id of addOnServiceIds)
    if (!masterAvailable(addOnById.get(id), addOnScope, retainedAddOnServiceIds))
      missing('add-on service');

  const cruiseRoomTypeById = new Map(cruiseRoomTypes.map((row) => [row.id, row]));
  for (const row of services) {
    if (!row.cruiseRoomTypeId) continue;
    const child = cruiseRoomTypeById.get(row.cruiseRoomTypeId);
    const parent = row.cruiseId ? cruiseById.get(row.cruiseId) : undefined;
    if (!childAvailable(child, parent, cruiseScope, retainedCruiseRoomTypeIds, retainedCruiseIds))
      missing('cruise room type');
    if (child!.cruiseId !== row.cruiseId)
      throw new ValidationError('The selected room type does not belong to the selected cruise.');
  }

  return {
    imageOwnerCompanyIds: [hotelScope, cruiseScope, vehicleScope, sightseeingScope]
      .flatMap(ownerCompanyIds)
      .filter((id, index, values) => values.indexOf(id) === index),
  };
}
