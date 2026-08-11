import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, renderHook, screen, waitFor, act } from '@testing-library/react';
import { PERMISSIONS } from '@interscale/shared';
import { renderWithProviders } from '@/test/utils';
import { Sidebar } from './Sidebar';
import {
  readSidebarCollapsed,
  writeSidebarCollapsed,
  useSidebarCollapse,
  SIDEBAR_COLLAPSED_KEY,
} from './sidebar-state';
import { isNavPathActive } from '../navigation';
import { SHOW_BOOKINGS_NAVIGATION, SHOW_QUOTATION_TEMPLATES_NAVIGATION } from '../navigation';

const auth = vi.hoisted(() => ({
  permissions: new Set<string>(),
  isSystemAdmin: false,
}));

vi.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({
    hasPermission: (key: string) =>
      auth.isSystemAdmin ? key.startsWith('masters.') : auth.permissions.has(key),
    isSystemAdmin: auth.isSystemAdmin,
  }),
}));

const ALL_PERMISSIONS = new Set([
  PERMISSIONS.DASHBOARD_VIEW,
  PERMISSIONS.QUERIES_VIEW,
  PERMISSIONS.REMINDERS_VIEW,
  PERMISSIONS.BOOKING_REMINDERS_VIEW,
  PERMISSIONS.NOTIFICATIONS_VIEW,
  PERMISSIONS.NOTIFICATIONS_SETTINGS,
  PERMISSIONS.QUOTATION_TEMPLATES_VIEW,
  PERMISSIONS.QUOTATIONS_VIEW,
  PERMISSIONS.BOOKINGS_VIEW,
  PERMISSIONS.CUSTOMERS_VIEW,
  PERMISSIONS.VENDORS_VIEW,
  PERMISSIONS.MASTERS_VIEW,
  PERMISSIONS.MASTER_CITIES_VIEW,
  PERMISSIONS.MASTER_DESTINATIONS_VIEW,
  PERMISSIONS.MASTER_HOTELS_VIEW,
  PERMISSIONS.MASTER_AIRLINES_VIEW,
  PERMISSIONS.MASTER_CRUISES_VIEW,
  PERMISSIONS.MASTER_VEHICLES_VIEW,
  PERMISSIONS.MASTER_SIGHTSEEING_VIEW,
  PERMISSIONS.MASTER_ADD_ON_SERVICES_VIEW,
  PERMISSIONS.USERS_VIEW,
  PERMISSIONS.ROLES_VIEW,
  PERMISSIONS.PERMISSION_TEMPLATES_VIEW,
  PERMISSIONS.ACTIVITY_LOGS_VIEW,
  PERMISSIONS.REPORTS_VIEW,
  PERMISSIONS.SETTINGS_VIEW,
]);

function renderSidebar({
  collapsed = false,
  mobileOpen = false,
  route = '/dashboard',
  onCloseMobile = vi.fn(),
  onToggleCollapse = vi.fn(),
} = {}) {
  return renderWithProviders(
    <Sidebar
      collapsed={collapsed}
      onToggleCollapse={onToggleCollapse}
      mobileOpen={mobileOpen}
      onCloseMobile={onCloseMobile}
    />,
    { route },
  );
}

beforeEach(() => {
  auth.permissions = new Set(ALL_PERMISSIONS);
  auth.isSystemAdmin = false;
  window.localStorage.clear();
});

describe('Sidebar expanded state', () => {
  it('renders the labels of every permitted module', () => {
    renderSidebar();
    expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Customers' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Quotations' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Masters' })).toBeInTheDocument();
  });

  it('renders the section headings', () => {
    renderSidebar();
    expect(screen.getByText('General')).toBeInTheDocument();
    expect(screen.getByText('Sales')).toBeInTheDocument();
    expect(screen.getByText('Operations')).toBeInTheDocument();
    expect(screen.getByText('Administration')).toBeInTheDocument();
    // "Masters" is both a heading and the group button label.
    expect(screen.getAllByText('Masters').length).toBeGreaterThan(0);
  });
});

// Quotation Templates and Bookings are temporarily hidden from the sidebar via
// SHOW_QUOTATION_TEMPLATES_NAVIGATION / SHOW_BOOKINGS_NAVIGATION. Their routes
// and pages remain fully intact (see AppRoutes).
describe('Temporarily hidden sidebar modules', () => {
  it('does not render Quotation Templates or Bookings links', () => {
    renderSidebar();
    expect(screen.queryByRole('link', { name: 'Quotation Templates' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Bookings' })).not.toBeInTheDocument();
    // Nothing invisible-but-focusable is left behind.
    expect(screen.queryByText('Quotation Templates')).not.toBeInTheDocument();
    expect(screen.queryByText('Bookings')).not.toBeInTheDocument();
  });

  it('keeps them out of the collapsed rail and the mobile drawer', () => {
    renderSidebar({ collapsed: true, mobileOpen: true });
    expect(screen.queryByRole('link', { name: 'Quotation Templates' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Bookings' })).not.toBeInTheDocument();
    expect(screen.queryByText('Quotation Templates')).not.toBeInTheDocument();
    expect(screen.queryByText('Bookings')).not.toBeInTheDocument();
  });

  it('keeps the remaining Sales and Operations entries unchanged', () => {
    renderSidebar();
    expect(screen.getByRole('link', { name: 'Quotations' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Customers' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Vendors' })).toBeInTheDocument();
    // Both sections still render because their other items remain.
    expect(screen.getByText('Sales')).toBeInTheDocument();
    expect(screen.getByText('Operations')).toBeInTheDocument();
  });

  it('does not hide the unrelated Booking Reminders entry', () => {
    renderSidebar();
    fireEvent.click(screen.getByRole('button', { name: 'Reminders' }));
    expect(screen.getByRole('link', { name: 'Booking Reminders' })).toBeInTheDocument();
  });

  it('hides the modules through explicit, reversible visibility flags', () => {
    expect(SHOW_QUOTATION_TEMPLATES_NAVIGATION).toBe(false);
    expect(SHOW_BOOKINGS_NAVIGATION).toBe(false);
  });
});

describe('Sidebar collapsed state', () => {
  it('hides labels on the collapsed rail', () => {
    renderSidebar({ collapsed: true });
    // Labels stay in the DOM for the mobile drawer but are hidden on the rail.
    const label = screen.getByText('Customers');
    expect(label.className).toContain('lg:hidden');
  });

  it('still exposes an accessible name for icon-only links', () => {
    renderSidebar({ collapsed: true });
    expect(screen.getByRole('link', { name: 'Quotations' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Customers' })).toBeInTheDocument();
  });

  it('shows a tooltip on hover with a small delay', async () => {
    renderSidebar({ collapsed: true });
    const customers = screen.getByRole('link', { name: 'Customers' });
    fireEvent.mouseEnter(customers);
    await screen.findByRole('tooltip');
    expect(screen.getByRole('tooltip')).toHaveTextContent('Customers');
  });

  it('hides the tooltip on pointer leave', async () => {
    renderSidebar({ collapsed: true });
    const customers = screen.getByRole('link', { name: 'Customers' });
    fireEvent.mouseEnter(customers);
    await screen.findByRole('tooltip');
    fireEvent.mouseLeave(customers);
    await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument());
  });

  it('opens the tooltip on keyboard focus', async () => {
    renderSidebar({ collapsed: true });
    const vendors = screen.getByRole('link', { name: 'Vendors' });
    vendors.focus();
    fireEvent.focus(vendors);
    await screen.findByRole('tooltip');
    expect(screen.getByRole('tooltip')).toHaveTextContent('Vendors');
  });

  it('expands the sidebar and opens a group when its icon is clicked', () => {
    const onToggleCollapse = vi.fn();
    renderSidebar({ collapsed: true, onToggleCollapse });
    fireEvent.click(screen.getByRole('button', { name: 'Masters' }));
    expect(onToggleCollapse).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Masters' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });
});

describe('Collapse preference persistence', () => {
  it('writes the preference to localStorage', () => {
    writeSidebarCollapsed(true);
    expect(window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY)).toBe('true');
  });

  it('reads a persisted true preference', () => {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, 'true');
    expect(readSidebarCollapsed()).toBe(true);
  });

  it('falls back to expanded on a malformed value', () => {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, 'garbage');
    expect(readSidebarCollapsed()).toBe(false);
  });

  it('persists through the toggle hook', () => {
    const { result } = renderHook(() => useSidebarCollapse());
    expect(result.current.collapsed).toBe(false);
    act(() => result.current.toggleCollapsed());
    expect(result.current.collapsed).toBe(true);
    expect(window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY)).toBe('true');
  });
});

describe('Active route detection', () => {
  it('sets aria-current="page" on the active flat item', () => {
    renderSidebar({ route: '/customers/123' });
    expect(screen.getByRole('link', { name: 'Customers' })).toHaveAttribute('aria-current', 'page');
  });

  it('does not activate Quotations from a Quotation Templates route', () => {
    renderSidebar({ route: '/quotation-templates' });
    expect(screen.getByRole('link', { name: 'Quotations' })).not.toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('activates Quotations from its own route', () => {
    renderSidebar({ route: '/quotations/123' });
    expect(screen.getByRole('link', { name: 'Quotations' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('activates a nested Master detail route', () => {
    renderSidebar({ route: '/masters/add-on-services/123' });
    expect(screen.getByRole('link', { name: 'Add-On Services' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('matches paths segment-aware via the helper', () => {
    expect(isNavPathActive('/quotation-templates', '/quotations')).toBe(false);
    expect(isNavPathActive('/quotations/42', '/quotations')).toBe(true);
    expect(isNavPathActive('/quotation-templates', '/quotation-templates')).toBe(true);
  });
});

describe('Masters collapsible group', () => {
  it('auto-expands when a child route is active', () => {
    renderSidebar({ route: '/masters/hotels' });
    const masters = screen.getByRole('button', { name: 'Masters' });
    expect(masters).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('link', { name: 'Hotels' })).toHaveAttribute('aria-current', 'page');
  });

  it('can be manually collapsed and expanded', () => {
    renderSidebar();
    const masters = screen.getByRole('button', { name: 'Masters' });
    expect(masters).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(masters);
    expect(masters).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(masters);
    expect(masters).toHaveAttribute('aria-expanded', 'false');
  });

  it('highlights the active Master child', () => {
    renderSidebar({ route: '/masters/destinations' });
    expect(screen.getByRole('link', { name: 'Destinations' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    // Parent is visually active via its class while a child is selected.
    const masters = screen.getByRole('button', { name: 'Masters' });
    expect(masters.className).toContain('text-sidebar-primary');
  });
});

describe('Permission and role filtering', () => {
  it('System Admin sees only the permitted Masters navigation', () => {
    auth.isSystemAdmin = true;
    renderSidebar();
    expect(screen.getByRole('button', { name: 'Masters' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Cities' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Dashboard' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Leads' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Bookings' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Quotations' })).not.toBeInTheDocument();
    // The tenant restore screen is intentionally hidden for System Admin.
    expect(screen.queryByRole('link', { name: 'Hidden Global' })).not.toBeInTheDocument();
  });

  it('a limited-permission user sees only allowed modules', () => {
    auth.permissions = new Set([
      PERMISSIONS.QUERIES_VIEW,
      PERMISSIONS.MASTERS_VIEW,
      PERMISSIONS.MASTER_CITIES_VIEW,
    ]);
    renderSidebar();
    expect(screen.getByRole('link', { name: 'Leads' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Cities' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Bookings' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Quotations' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Hotels' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Reports' })).not.toBeInTheDocument();
  });

  it('does not render an empty section heading', () => {
    auth.permissions = new Set([PERMISSIONS.MASTERS_VIEW, PERMISSIONS.MASTER_CITIES_VIEW]);
    renderSidebar();
    expect(screen.queryByText('General')).not.toBeInTheDocument();
    expect(screen.queryByText('Sales')).not.toBeInTheDocument();
    expect(screen.queryByText('Operations')).not.toBeInTheDocument();
    expect(screen.queryByText('Administration')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Masters' })).toBeInTheDocument();
  });
});

describe('Mobile drawer', () => {
  it('opens as a drawer with a scrim', () => {
    renderSidebar({ mobileOpen: true });
    expect(screen.getByTestId('sidebar-scrim')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument();
  });

  it('closes after a navigation item is selected', () => {
    const onCloseMobile = vi.fn();
    renderSidebar({ mobileOpen: true, onCloseMobile });
    fireEvent.click(screen.getByRole('link', { name: 'Dashboard' }));
    expect(onCloseMobile).toHaveBeenCalled();
  });

  it('closes on Escape', () => {
    const onCloseMobile = vi.fn();
    renderSidebar({ mobileOpen: true, onCloseMobile });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCloseMobile).toHaveBeenCalled();
  });

  it('closes when the backdrop is clicked', () => {
    const onCloseMobile = vi.fn();
    renderSidebar({ mobileOpen: true, onCloseMobile });
    fireEvent.click(screen.getByTestId('sidebar-scrim'));
    expect(onCloseMobile).toHaveBeenCalled();
  });
});

describe('WhatsApp CRM cross-app launcher', () => {
  it('renders the sister-app launcher pinned in the sidebar', () => {
    renderSidebar();
    const link = screen.getByRole('link', { name: /whatsapp crm/i });
    expect(link).toHaveAttribute('href', 'https://interscalechat.co.in/inbox');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
  });

  it('stays reachable on the collapsed rail and in the mobile drawer', () => {
    renderSidebar({ collapsed: true, mobileOpen: true });
    expect(screen.getByRole('link', { name: /whatsapp crm/i })).toBeInTheDocument();
  });
});

describe('Layout safety', () => {
  it('keeps the nav area horizontally clipped without hiding items', () => {
    renderSidebar();
    const nav = screen.getByRole('navigation', { name: 'Primary' });
    expect(nav.className).toContain('overflow-x-hidden');
    expect(nav.className).toContain('overflow-y-auto');
  });
});
