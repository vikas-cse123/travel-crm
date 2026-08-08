import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/utils';
import { APP_NAME } from '@interscale/shared';
import { SidebarHeader } from './SidebarHeader';

const auth = vi.hoisted(() => ({
  user: null as {
    company?: {
      name: string;
      logoUrl?: string | null;
      customDomain?: { hostname: string } | null;
    };
  } | null,
}));

vi.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({ user: auth.user }),
}));

const originalLocation = window.location;
const setHost = (host: string) => {
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { hostname: host },
  });
};

afterAll(() => {
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: originalLocation,
  });
});

const props = {
  onToggleCollapse: () => undefined,
  onCloseMobile: () => undefined,
};

describe('SidebarHeader custom-domain branding', () => {
  beforeEach(() => {
    auth.user = null;
  });

  it('shows the shared platform brand on the default platform domain', () => {
    setHost('app.travelagencycrm.in');
    auth.user = {
      company: { name: 'Easy Tour and Travels', customDomain: { hostname: 'crm.easytour.com' } },
    };
    renderWithProviders(<SidebarHeader collapsed={false} {...props} />);
    expect(screen.getByText(APP_NAME)).toBeInTheDocument();
    expect(screen.queryByText('Easy Tour and Travels')).not.toBeInTheDocument();
  });

  it('shows the Company name on its ACTIVE custom domain', () => {
    setHost('crm.easytour.com');
    auth.user = {
      company: { name: 'Easy Tour and Travels', customDomain: { hostname: 'crm.easytour.com' } },
    };
    renderWithProviders(<SidebarHeader collapsed={false} {...props} />);
    expect(screen.getByText('Easy Tour and Travels')).toBeInTheDocument();
    expect(screen.queryByText(APP_NAME)).not.toBeInTheDocument();
  });

  it('shows the Company logo when present on the custom domain', () => {
    setHost('crm.easytour.com');
    auth.user = {
      company: {
        name: 'Easy Tour',
        logoUrl: 'https://example.com/logo.png',
        customDomain: { hostname: 'crm.easytour.com' },
      },
    };
    renderWithProviders(<SidebarHeader collapsed={false} {...props} />);
    const img = document.querySelector('img');
    expect(img).not.toBeNull();
    expect(img).toHaveAttribute('src', 'https://example.com/logo.png');
  });

  it('falls back to the platform mark when the Company has no logo', () => {
    setHost('crm.easytour.com');
    auth.user = {
      company: { name: 'Easy Tour', logoUrl: null, customDomain: { hostname: 'crm.easytour.com' } },
    };
    renderWithProviders(<SidebarHeader collapsed={false} {...props} />);
    expect(document.querySelector('img')).toBeNull();
    expect(screen.getByText('Easy Tour')).toBeInTheDocument();
  });

  it('truncates a long Company name without breaking the sidebar', () => {
    setHost('crm.easytour.com');
    const longName =
      'Easy Tour and Travels Limited a very long company name that must truncate cleanly';
    auth.user = { company: { name: longName, customDomain: { hostname: 'crm.easytour.com' } } };
    renderWithProviders(<SidebarHeader collapsed={false} {...props} />);
    const name = screen.getByText(longName);
    expect(name.className).toContain('truncate');
    expect(name).toHaveAttribute('title', longName);
  });
});
