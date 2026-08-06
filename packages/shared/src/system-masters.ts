import { PERMISSIONS } from './permissions.js';

/**
 * System Global Masters.
 *
 * One hidden internal company owns global Master catalogue records that are
 * visible to every normal tenant. This module centralises every stable
 * identifier the feature uses so the same value is never written twice with
 * different spellings.
 */

/** Deterministic slug of the hidden system company that owns global masters. */
export const SYSTEM_GLOBAL_MASTERS_COMPANY_SLUG = 'system-global-masters';

/** Display name of the hidden system company. Never used for lookup. */
export const SYSTEM_GLOBAL_MASTERS_COMPANY_NAME = 'System Global Masters';

/** Fixed role name granted to the System Admin under the system company. */
export const SYSTEM_ADMIN_ROLE_NAME = 'System Admin';

/** Fallback company id, only consulted when the slug lookup cannot resolve. */
export const SYSTEM_GLOBAL_MASTERS_COMPANY_ID_ENV = 'SYSTEM_GLOBAL_MASTERS_COMPANY_ID';

/**
 * Stable internal master identifiers used by the generic hide/restore table.
 * These are internal keys, never user-facing labels, and must not change.
 */
export const MASTER_TYPE = {
  CITY: 'CITY',
  DESTINATION: 'DESTINATION',
  HOTEL: 'HOTEL',
  AIRLINE: 'AIRLINE',
  CRUISE: 'CRUISE',
  VEHICLE: 'VEHICLE',
  SIGHTSEEING: 'SIGHTSEEING',
  ADD_ON_SERVICE: 'ADD_ON_SERVICE',
  VISA_TYPE: 'VISA_TYPE',
  TESTIMONIAL: 'TESTIMONIAL',
} as const;

export type MasterType = (typeof MASTER_TYPE)[keyof typeof MASTER_TYPE];

/** The master modules that support global visibility. */
export const GLOBAL_MASTER_TYPES = [
  MASTER_TYPE.CITY,
  MASTER_TYPE.DESTINATION,
  MASTER_TYPE.HOTEL,
  MASTER_TYPE.AIRLINE,
  MASTER_TYPE.CRUISE,
  MASTER_TYPE.VEHICLE,
  MASTER_TYPE.SIGHTSEEING,
  MASTER_TYPE.ADD_ON_SERVICE,
  MASTER_TYPE.VISA_TYPE,
  MASTER_TYPE.TESTIMONIAL,
] as const satisfies readonly MasterType[];

/** Human label per master type, for UI and audit metadata. */
export const MASTER_TYPE_LABELS: Record<MasterType, string> = {
  [MASTER_TYPE.CITY]: 'City',
  [MASTER_TYPE.DESTINATION]: 'Destination',
  [MASTER_TYPE.HOTEL]: 'Hotel',
  [MASTER_TYPE.AIRLINE]: 'Airline',
  [MASTER_TYPE.CRUISE]: 'Cruise',
  [MASTER_TYPE.VEHICLE]: 'Vehicle',
  [MASTER_TYPE.SIGHTSEEING]: 'Sightseeing',
  [MASTER_TYPE.ADD_ON_SERVICE]: 'Add-On Service',
  [MASTER_TYPE.VISA_TYPE]: 'Visa Type',
  [MASTER_TYPE.TESTIMONIAL]: 'Testimonial',
};

export const MASTER_TYPE_LIST: readonly MasterType[] = GLOBAL_MASTER_TYPES;

export function isMasterType(value: string | undefined | null): value is MasterType {
  return value !== undefined && value !== null && (GLOBAL_MASTER_TYPES as readonly string[]).includes(value);
}

/**
 * Permission metadata per master type: the module view permission and the
 * umbrealla masters permission. Used to gate the generic hide/restore routes.
 */
export interface MasterPermissionRefs {
  viewPermission: string;
}

export const MASTER_PERMISSIONS: Record<MasterType, MasterPermissionRefs> = {
  [MASTER_TYPE.CITY]: { viewPermission: PERMISSIONS.MASTER_CITIES_VIEW },
  [MASTER_TYPE.DESTINATION]: { viewPermission: PERMISSIONS.MASTER_DESTINATIONS_VIEW },
  [MASTER_TYPE.HOTEL]: { viewPermission: PERMISSIONS.MASTER_HOTELS_VIEW },
  [MASTER_TYPE.AIRLINE]: { viewPermission: PERMISSIONS.MASTER_AIRLINES_VIEW },
  [MASTER_TYPE.CRUISE]: { viewPermission: PERMISSIONS.MASTER_CRUISES_VIEW },
  [MASTER_TYPE.VEHICLE]: { viewPermission: PERMISSIONS.MASTER_VEHICLES_VIEW },
  [MASTER_TYPE.SIGHTSEEING]: { viewPermission: PERMISSIONS.MASTER_SIGHTSEEING_VIEW },
  [MASTER_TYPE.ADD_ON_SERVICE]: { viewPermission: PERMISSIONS.MASTER_ADD_ON_SERVICES_VIEW },
  [MASTER_TYPE.VISA_TYPE]: { viewPermission: PERMISSIONS.MASTER_VISA_TYPES_VIEW },
  [MASTER_TYPE.TESTIMONIAL]: { viewPermission: PERMISSIONS.MASTER_TESTIMONIALS_VIEW },
};

/**
 * Every master permission key granted to the System Admin role. Ownership is
 * still enforced separately: these keys only authorise operations against
 * records owned by the System Global Masters company.
 */
export const SYSTEM_ADMIN_PERMISSION_KEYS: readonly string[] = [
  PERMISSIONS.MASTERS_VIEW,
  PERMISSIONS.MASTER_CITIES_VIEW,
  PERMISSIONS.MASTER_CITIES_CREATE,
  PERMISSIONS.MASTER_CITIES_UPDATE,
  PERMISSIONS.MASTER_CITIES_DELETE,
  PERMISSIONS.MASTER_DESTINATIONS_VIEW,
  PERMISSIONS.MASTER_DESTINATIONS_CREATE,
  PERMISSIONS.MASTER_DESTINATIONS_UPDATE,
  PERMISSIONS.MASTER_DESTINATIONS_DELETE,
  PERMISSIONS.MASTER_DESTINATIONS_MANAGE_IMAGES,
  PERMISSIONS.MASTER_HOTELS_VIEW,
  PERMISSIONS.MASTER_HOTELS_CREATE,
  PERMISSIONS.MASTER_HOTELS_UPDATE,
  PERMISSIONS.MASTER_HOTELS_DELETE,
  PERMISSIONS.MASTER_HOTELS_MANAGE_MEDIA,
  PERMISSIONS.MASTER_HOTELS_VIEW_COSTING,
  PERMISSIONS.MASTER_HOTELS_MANAGE_COSTING,
  PERMISSIONS.MASTER_AIRLINES_VIEW,
  PERMISSIONS.MASTER_AIRLINES_CREATE,
  PERMISSIONS.MASTER_AIRLINES_UPDATE,
  PERMISSIONS.MASTER_AIRLINES_DELETE,
  PERMISSIONS.MASTER_AIRLINES_MANAGE_MEDIA,
  PERMISSIONS.MASTER_CRUISES_VIEW,
  PERMISSIONS.MASTER_CRUISES_CREATE,
  PERMISSIONS.MASTER_CRUISES_UPDATE,
  PERMISSIONS.MASTER_CRUISES_DELETE,
  PERMISSIONS.MASTER_CRUISES_MANAGE_MEDIA,
  PERMISSIONS.MASTER_CRUISES_VIEW_COSTING,
  PERMISSIONS.MASTER_CRUISES_MANAGE_COSTING,
  PERMISSIONS.MASTER_VEHICLES_VIEW,
  PERMISSIONS.MASTER_VEHICLES_CREATE,
  PERMISSIONS.MASTER_VEHICLES_UPDATE,
  PERMISSIONS.MASTER_VEHICLES_DELETE,
  PERMISSIONS.MASTER_VEHICLES_MANAGE_MEDIA,
  PERMISSIONS.MASTER_SIGHTSEEING_VIEW,
  PERMISSIONS.MASTER_SIGHTSEEING_CREATE,
  PERMISSIONS.MASTER_SIGHTSEEING_UPDATE,
  PERMISSIONS.MASTER_SIGHTSEEING_DELETE,
  PERMISSIONS.MASTER_SIGHTSEEING_MANAGE_MEDIA,
  PERMISSIONS.MASTER_ADD_ON_SERVICES_VIEW,
  PERMISSIONS.MASTER_ADD_ON_SERVICES_CREATE,
  PERMISSIONS.MASTER_ADD_ON_SERVICES_UPDATE,
  PERMISSIONS.MASTER_ADD_ON_SERVICES_DELETE,
  PERMISSIONS.MASTER_VISA_TYPES_VIEW,
  PERMISSIONS.MASTER_VISA_TYPES_CREATE,
  PERMISSIONS.MASTER_VISA_TYPES_UPDATE,
  PERMISSIONS.MASTER_VISA_TYPES_DELETE,
  PERMISSIONS.MASTER_TESTIMONIALS_VIEW,
  PERMISSIONS.MASTER_TESTIMONIALS_CREATE,
  PERMISSIONS.MASTER_TESTIMONIALS_UPDATE,
  PERMISSIONS.MASTER_TESTIMONIALS_DELETE,
  PERMISSIONS.MASTER_TESTIMONIALS_MANAGE_MEDIA,
];

/**
 * Safe, deterministic landing route for the System Admin after login and for
 * route-guard denial redirects.
 */
export const SYSTEM_ADMIN_LANDING_PATH = '/masters/cities';

/** Safe landing route for normal tenants. */
export const TENANT_LANDING_PATH = '/dashboard';
