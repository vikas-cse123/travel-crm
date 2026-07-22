import {
  BarChart3,
  Bell,
  Building2,
  Bus,
  CalendarClock,
  FileText,
  Files,
  Globe2,
  LayoutDashboard,
  Map,
  MapPin,
  MapPinned,
  MessageSquare,
  Plane,
  PackagePlus,
  Settings,
  Ship,
  Shield,
  ScrollText,
  Ticket,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { PERMISSIONS } from '@interscale/shared';

/**
 * The sidebar model.
 *
 * `available: false` renders an item as "Coming soon" — visible so the product
 * shape is clear, but not navigable. `permission` is the key required to see
 * an item at all; Phase 5 wires the filtering to real permission checks.
 */
export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  available: boolean;
  permission?: string;
  group?: string;
  children?: readonly NavItem[];
}

export const NAV_ITEMS: readonly NavItem[] = [
  {
    label: 'Dashboard',
    to: '/dashboard',
    icon: LayoutDashboard,
    available: true,
    permission: PERMISSIONS.DASHBOARD_VIEW,
  },
  {
    label: 'Leads',
    to: '/queries',
    icon: MessageSquare,
    available: true,
    permission: PERMISSIONS.QUERIES_VIEW,
  },
  {
    label: 'Reminders',
    to: '/reminders',
    icon: CalendarClock,
    available: true,
    permission: PERMISSIONS.REMINDERS_VIEW,
    children: [
      {
        label: 'My Reminders',
        to: '/reminders',
        icon: CalendarClock,
        available: true,
        permission: PERMISSIONS.REMINDERS_VIEW,
      },
      {
        label: 'Booking Reminders',
        to: '/reminders/bookings',
        icon: Ticket,
        available: true,
        permission: PERMISSIONS.BOOKING_REMINDERS_VIEW,
      },
      {
        label: 'Notifications',
        to: '/reminders/notifications',
        icon: Bell,
        available: true,
        permission: PERMISSIONS.NOTIFICATIONS_VIEW,
      },
      {
        label: 'Notification Settings',
        to: '/reminders/settings',
        icon: Settings,
        available: true,
        permission: PERMISSIONS.NOTIFICATIONS_SETTINGS,
      },
    ],
  },
  {
    label: 'Quotation Templates',
    to: '/quotation-templates',
    icon: Files,
    available: true,
    permission: PERMISSIONS.QUOTATION_TEMPLATES_VIEW,
  },
  {
    label: 'Quotations',
    to: '/quotations',
    icon: FileText,
    available: true,
    permission: PERMISSIONS.QUOTATIONS_VIEW,
  },
  {
    label: 'Bookings',
    to: '/bookings',
    icon: Ticket,
    available: true,
    permission: PERMISSIONS.BOOKINGS_VIEW,
  },
  {
    label: 'Customers',
    to: '/customers',
    icon: Users,
    available: true,
    permission: PERMISSIONS.CUSTOMERS_VIEW,
  },
  {
    label: 'Vendors',
    to: '/vendors',
    icon: Building2,
    available: true,
    permission: PERMISSIONS.VENDORS_VIEW,
  },
  {
    label: 'Masters',
    to: '/masters/cities',
    icon: Map,
    available: true,
    permission: PERMISSIONS.MASTERS_VIEW,
    children: [
      {
        label: 'Cities',
        to: '/masters/cities',
        icon: MapPin,
        available: true,
        permission: PERMISSIONS.MASTER_CITIES_VIEW,
      },
      {
        label: 'Destinations',
        to: '/masters/destinations',
        icon: Globe2,
        available: true,
        permission: PERMISSIONS.MASTER_DESTINATIONS_VIEW,
      },
      {
        label: 'Hotels',
        to: '/masters/hotels',
        icon: Building2,
        available: true,
        permission: PERMISSIONS.MASTER_HOTELS_VIEW,
      },
      {
        label: 'Airlines',
        to: '/masters/airlines',
        icon: Plane,
        available: true,
        permission: PERMISSIONS.MASTER_AIRLINES_VIEW,
      },
      {
        label: 'Cruises',
        to: '/masters/cruises',
        icon: Ship,
        available: true,
        permission: PERMISSIONS.MASTER_CRUISES_VIEW,
      },
      {
        label: 'Vehicles',
        to: '/masters/vehicles',
        icon: Bus,
        available: true,
        permission: PERMISSIONS.MASTER_VEHICLES_VIEW,
      },
      {
        label: 'Sightseeing',
        to: '/masters/sightseeing',
        icon: MapPinned,
        available: true,
        permission: PERMISSIONS.MASTER_SIGHTSEEING_VIEW,
      },
      {
        label: 'Add-On Services',
        to: '/masters/add-on-services',
        icon: PackagePlus,
        available: true,
        permission: PERMISSIONS.MASTER_ADD_ON_SERVICES_VIEW,
      },
    ],
  },
  // Users, Reports and Settings have permissions already, but their screens
  // are Phase 4+ work, so they stay disabled here.
  {
    label: 'User List',
    to: '/users',
    icon: Users,
    available: true,
    permission: PERMISSIONS.USERS_VIEW,
    group: 'Users',
  },
  {
    label: 'Roles',
    to: '/roles',
    icon: Shield,
    available: true,
    permission: PERMISSIONS.ROLES_VIEW,
    group: 'Users',
  },
  {
    label: 'Permission Templates',
    to: '/permission-templates',
    icon: Settings,
    available: true,
    permission: PERMISSIONS.PERMISSION_TEMPLATES_VIEW,
    group: 'Users',
  },
  {
    label: 'Activity Logs',
    to: '/activity-logs',
    icon: ScrollText,
    available: true,
    permission: PERMISSIONS.ACTIVITY_LOGS_VIEW,
    group: 'Users',
  },
  { label: 'Reports', to: '/reports', icon: BarChart3, available: false },
  { label: 'Settings', to: '/settings', icon: Settings, available: false },
] as const;

/** Initials for the avatar, e.g. "Priya Nair" → "PN". */
export function initialsOf(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return (parts[0] ?? '').slice(0, 2).toUpperCase();
  return `${parts[0]?.[0] ?? ''}${parts[parts.length - 1]?.[0] ?? ''}`.toUpperCase();
}
