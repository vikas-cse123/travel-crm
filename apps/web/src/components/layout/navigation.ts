import {
  BarChart3,
  Building2,
  CalendarClock,
  FileText,
  LayoutDashboard,
  MessageSquare,
  Settings,
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
}

export const NAV_ITEMS: readonly NavItem[] = [
  {
    label: 'Dashboard',
    to: '/dashboard',
    icon: LayoutDashboard,
    available: true,
    permission: PERMISSIONS.DASHBOARD_VIEW,
  },
  { label: 'Queries', to: '/queries', icon: MessageSquare, available: false },
  { label: 'Follow-ups', to: '/follow-ups', icon: CalendarClock, available: false },
  { label: 'Quotations', to: '/quotations', icon: FileText, available: false },
  { label: 'Bookings', to: '/bookings', icon: Ticket, available: false },
  { label: 'Customers', to: '/customers', icon: Users, available: false },
  { label: 'Vendors', to: '/vendors', icon: Building2, available: false },
  // Users, Reports and Settings have permissions already, but their screens
  // are Phase 4+ work, so they stay disabled here.
  {
    label: 'Users',
    to: '/users',
    icon: Users,
    available: true,
    permission: PERMISSIONS.USERS_VIEW,
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
