import {
  Binoculars,
  CarFront,
  Hotel,
  PackagePlus,
  Plane,
  Ship,
  type LucideIcon,
} from 'lucide-react';
import { labelForLookup } from '@interscale/shared';
import type { Lead } from './queries.api';

/**
 * Normalized, order-stable representation of a lead's selected services.
 * Only service types actually offered by the Lead form are ever included;
 * anything else is ignored so a blank or unsupported value can never surface a
 * placeholder icon in the table.
 */
export interface LeadServiceSummary {
  key: string;
  label: string;
  icon: LucideIcon;
  count: number;
}

/**
 * Strict allowlist matching the Lead form's service checkboxes
 * (CRUISE, FLIGHT, HOTEL, VEHICLE_TRANSFER, SIGHTSEEING, OTHER_ADD_ON).
 * Display order is fixed: Flight, Hotel, Sightseeing, Vehicle, Cruise,
 * Add-on Service.
 */
const LEAD_SERVICE_ORDER = [
  'FLIGHT',
  'HOTEL',
  'SIGHTSEEING',
  'VEHICLE_TRANSFER',
  'CRUISE',
  'OTHER_ADD_ON',
] as const;

type LeadServiceKey = (typeof LEAD_SERVICE_ORDER)[number];

const LEAD_SERVICE_ICONS: Record<LeadServiceKey, LucideIcon> = {
  FLIGHT: Plane,
  HOTEL: Hotel,
  SIGHTSEEING: Binoculars,
  VEHICLE_TRANSFER: CarFront,
  CRUISE: Ship,
  OTHER_ADD_ON: PackagePlus,
};

/** Normalize a service-type value to a canonical key, tolerating legacy aliases. */
export function normalizeLeadServiceType(value: string | null | undefined): string {
  const raw = (value ?? '').trim().toUpperCase();
  if (raw === 'VEHICLE' || raw === 'VEHICLE TRANSFER') return 'VEHICLE_TRANSFER';
  if (raw === 'ADD_ON' || raw === 'OTHER ADD ON') return 'OTHER_ADD_ON';
  if (raw === 'SIGHT SEEING') return 'SIGHTSEEING';
  if (raw === 'GENERAL ENQUIRY') return 'GENERAL_ENQUIRY';
  if (raw === 'TRAVEL INSURANCE') return 'TRAVEL_INSURANCE';
  return raw
    .replace(/[^A-Z0-9]/g, '_')
    .replace(/__+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Turn a lead's raw service list into the ordered list of chips to render.
 *
 * Only strictly selected service types are included: blank/undefined values,
 * empty strings and service types outside the Lead-form allowlist are ignored,
 * so an empty selection (or an unknown legacy value) can never render a
 * fallback icon. Genuine duplicates are counted (one chip, one count badge)
 * but the persisted Lead-form selection never produces duplicates.
 */
export function getLeadServiceSummary(lead: Pick<Lead, 'services'>): LeadServiceSummary[] {
  const counts = new Map<LeadServiceKey, number>();
  for (const raw of lead.services ?? []) {
    const serviceType = raw?.serviceType;
    if (typeof serviceType !== 'string' || serviceType.trim() === '') continue;
    const key = normalizeLeadServiceType(serviceType) as LeadServiceKey;
    if (!LEAD_SERVICE_ORDER.includes(key)) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const rank = (key: LeadServiceKey) => LEAD_SERVICE_ORDER.indexOf(key);

  return Array.from(counts, ([key, count]) => ({ key, count }))
    .sort((a, b) => rank(a.key) - rank(b.key))
    .map(({ key, count }) => ({
      key,
      label: labelForLookup(key),
      icon: LEAD_SERVICE_ICONS[key],
      count,
    }));
}
