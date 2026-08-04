import {
  BookOpen,
  Camera,
  CarFront,
  Hotel,
  Layers,
  Plane,
  Puzzle,
  Ship,
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
