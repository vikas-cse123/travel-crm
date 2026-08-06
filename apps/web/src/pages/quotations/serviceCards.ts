import {
  Binoculars,
  BookOpen,
  Camera,
  CarFront,
  Hotel,
  IdCard,
  Layers,
  MapPinned,
  MessageSquare,
  Package,
  PackagePlus,
  Plane,
  Puzzle,
  ShieldCheck,
  Ship,
  TrainFront,
  Utensils,
  type LucideIcon,
} from 'lucide-react';

/** A service rendered as a card in the public "Services Include" section. */
export interface ServiceCard {
  key: string;
  label: string;
}

/**
 * Map an included-service key to its green card icon. Unknown keys fall back to
 * a generic icon so an unfamiliar service type can never break the page.
 */
export function serviceCardIcon(key: string): LucideIcon {
  switch (key) {
    case 'flights':
      return Plane;
    case 'hotels':
      return Hotel;
    case 'sightseeing':
      return Camera;
    case 'cruise':
      return Ship;
    case 'transportation':
      return CarFront;
    case 'visa':
      return BookOpen;
    case 'add-ons':
      return Puzzle;
    default:
      return Layers;
  }
}

/**
 * Normalize a raw service-type value to its canonical `SERVICE_TYPES` key.
 * Handles the variations already present in the application: case, separator
 * differences, and legacy aliases (`VEHICLE`, `ADD_ON`, spaced forms).
 */
export function normalizeServiceType(value: string | null | undefined): string {
  const raw = (value ?? '').trim().toUpperCase();
  if (raw === 'VEHICLE' || raw === 'VEHICLE TRANSFER') return 'VEHICLE_TRANSFER';
  if (raw === 'ADD_ON' || raw === 'OTHER ADD ON') return 'OTHER_ADD_ON';
  if (raw === 'SIGHT SEEING') return 'SIGHTSEEING';
  if (raw === 'GENERAL ENQUIRY') return 'GENERAL_ENQUIRY';
  if (raw === 'TRAVEL INSURANCE') return 'TRAVEL_INSURANCE';
  return raw.replace(/[^A-Z0-9]/g, '_').replace(/__+/g, '_').replace(/^_+|_+$/g, '');
}

/** Icons keyed by canonical service type; unknown types use the fallback. */
const SERVICE_TYPE_ICONS: Record<string, LucideIcon> = {
  HOTEL: Hotel,
  SIGHTSEEING: Binoculars,
  CRUISE: Ship,
  VEHICLE_TRANSFER: CarFront,
  FLIGHT: Plane,
  OTHER_ADD_ON: PackagePlus,
  VISA: BookOpen,
  TRAVEL_INSURANCE: ShieldCheck,
  RAIL: TrainFront,
  PASSPORT_ASSISTANCE: IdCard,
  MEAL: Utensils,
  GUIDE: MapPinned,
  GENERAL_ENQUIRY: MessageSquare,
};

/** Decorative icon for a service-type value, with a generic fallback. */
export function serviceTypeIcon(value: string | null | undefined): LucideIcon {
  return SERVICE_TYPE_ICONS[normalizeServiceType(value)] ?? Package;
}
