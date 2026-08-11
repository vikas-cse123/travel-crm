import {
  MASTER_PERMISSIONS,
  MASTER_TYPE,
  MASTER_TYPE_LABELS,
  type MasterType,
} from '@interscale/shared';

/**
 * Strict registry of every Master that supports global visibility.
 *
 * This is the ONLY bridge between a client-supplied `masterType` string and a
 * Prisma model. There is no dynamic model access: the hide/restore endpoints
 * look the type up here, and anything not listed is rejected before any query
 * runs.
 */
export interface MasterTypeInfo {
  type: MasterType;
  label: string;
  /** Prisma delegate name — statically allow-listed, never client input. */
  model: keyof PrismaClientDelegates;
  /** Column holding the primary display label, when a plain field exists. */
  nameField: 'name' | 'title' | 'clientName' | null;
  viewPermission: string;
  /** Best-effort human label for a record, used by the hidden-list screen. */
  displayName: (row: {
    name?: string | null;
    title?: string | null;
    clientName?: string | null;
    destinationName?: string | null;
  }) => string;
}

/** Narrowed list of the Prisma delegates we are allowed to touch. */
interface PrismaClientDelegates {
  city: unknown;
  destination: unknown;
  hotel: unknown;
  airline: unknown;
  cruise: unknown;
  vehicle: unknown;
  sightseeing: unknown;
  addOnService: unknown;
  visaType: unknown;
  testimonial: unknown;
}

const labelOf = (row: Record<string, unknown>, key: string): string =>
  String(row[key] ?? '').trim();

export const MASTER_TYPE_REGISTRY: Record<MasterType, MasterTypeInfo> = {
  [MASTER_TYPE.CITY]: {
    type: MASTER_TYPE.CITY,
    label: MASTER_TYPE_LABELS[MASTER_TYPE.CITY],
    model: 'city',
    nameField: 'name',
    viewPermission: MASTER_PERMISSIONS[MASTER_TYPE.CITY].viewPermission,
    displayName: (row) => labelOf(row as Record<string, unknown>, 'name') || 'Untitled city',
  },
  [MASTER_TYPE.DESTINATION]: {
    type: MASTER_TYPE.DESTINATION,
    label: MASTER_TYPE_LABELS[MASTER_TYPE.DESTINATION],
    model: 'destination',
    nameField: 'name',
    viewPermission: MASTER_PERMISSIONS[MASTER_TYPE.DESTINATION].viewPermission,
    displayName: (row) => labelOf(row as Record<string, unknown>, 'name') || 'Untitled destination',
  },
  [MASTER_TYPE.HOTEL]: {
    type: MASTER_TYPE.HOTEL,
    label: MASTER_TYPE_LABELS[MASTER_TYPE.HOTEL],
    model: 'hotel',
    nameField: 'name',
    viewPermission: MASTER_PERMISSIONS[MASTER_TYPE.HOTEL].viewPermission,
    displayName: (row) => labelOf(row as Record<string, unknown>, 'name') || 'Untitled hotel',
  },
  [MASTER_TYPE.AIRLINE]: {
    type: MASTER_TYPE.AIRLINE,
    label: MASTER_TYPE_LABELS[MASTER_TYPE.AIRLINE],
    model: 'airline',
    nameField: 'name',
    viewPermission: MASTER_PERMISSIONS[MASTER_TYPE.AIRLINE].viewPermission,
    displayName: (row) => labelOf(row as Record<string, unknown>, 'name') || 'Untitled airline',
  },
  [MASTER_TYPE.CRUISE]: {
    type: MASTER_TYPE.CRUISE,
    label: MASTER_TYPE_LABELS[MASTER_TYPE.CRUISE],
    model: 'cruise',
    nameField: 'name',
    viewPermission: MASTER_PERMISSIONS[MASTER_TYPE.CRUISE].viewPermission,
    displayName: (row) => labelOf(row as Record<string, unknown>, 'name') || 'Untitled cruise',
  },
  [MASTER_TYPE.VEHICLE]: {
    type: MASTER_TYPE.VEHICLE,
    label: MASTER_TYPE_LABELS[MASTER_TYPE.VEHICLE],
    model: 'vehicle',
    nameField: 'name',
    viewPermission: MASTER_PERMISSIONS[MASTER_TYPE.VEHICLE].viewPermission,
    displayName: (row) => labelOf(row as Record<string, unknown>, 'name') || 'Untitled vehicle',
  },
  [MASTER_TYPE.SIGHTSEEING]: {
    type: MASTER_TYPE.SIGHTSEEING,
    label: MASTER_TYPE_LABELS[MASTER_TYPE.SIGHTSEEING],
    model: 'sightseeing',
    nameField: 'title',
    viewPermission: MASTER_PERMISSIONS[MASTER_TYPE.SIGHTSEEING].viewPermission,
    displayName: (row) =>
      labelOf(row as Record<string, unknown>, 'title') || 'Untitled sightseeing',
  },
  [MASTER_TYPE.ADD_ON_SERVICE]: {
    type: MASTER_TYPE.ADD_ON_SERVICE,
    label: MASTER_TYPE_LABELS[MASTER_TYPE.ADD_ON_SERVICE],
    model: 'addOnService',
    nameField: 'name',
    viewPermission: MASTER_PERMISSIONS[MASTER_TYPE.ADD_ON_SERVICE].viewPermission,
    displayName: (row) =>
      labelOf(row as Record<string, unknown>, 'name') || 'Untitled add-on service',
  },
  [MASTER_TYPE.VISA_TYPE]: {
    type: MASTER_TYPE.VISA_TYPE,
    label: MASTER_TYPE_LABELS[MASTER_TYPE.VISA_TYPE],
    model: 'visaType',
    nameField: 'name',
    viewPermission: MASTER_PERMISSIONS[MASTER_TYPE.VISA_TYPE].viewPermission,
    displayName: (row) => labelOf(row as Record<string, unknown>, 'name') || 'Untitled visa type',
  },
  [MASTER_TYPE.TESTIMONIAL]: {
    type: MASTER_TYPE.TESTIMONIAL,
    label: MASTER_TYPE_LABELS[MASTER_TYPE.TESTIMONIAL],
    model: 'testimonial',
    nameField: 'clientName',
    viewPermission: MASTER_PERMISSIONS[MASTER_TYPE.TESTIMONIAL].viewPermission,
    displayName: (row) =>
      labelOf(row as Record<string, unknown>, 'clientName') ||
      labelOf(row as Record<string, unknown>, 'destinationName') ||
      'Untitled testimonial',
  },
};

/** Minimal row shape the registry loads for a record. */
export interface MasterRegistryRow {
  id: string;
  companyId: string;
  status: string;
  deletedAt: Date | null;
  name: string | null;
  title: string | null;
  clientName: string | null;
  destinationName: string | null;
}

export function masterTypeInfo(type: MasterType): MasterTypeInfo {
  const info = MASTER_TYPE_REGISTRY[type];
  if (!info) {
    throw new Error(`Unsupported master type: ${String(type)}`);
  }
  return info;
}
