import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SidebarAppSwitcher } from './SidebarAppSwitcher';
import { WHATSAPP_CRM_URL } from '../navigation';

describe('SidebarAppSwitcher', () => {
  it('links to the WhatsApp CRM and opens it safely in a new tab', () => {
    render(<SidebarAppSwitcher collapsed={false} />);
    const link = screen.getByRole('link', { name: /whatsapp crm/i });
    expect(link).toHaveAttribute('href', WHATSAPP_CRM_URL);
    expect(WHATSAPP_CRM_URL).toBe('https://interscalechat.co.in/inbox');
    expect(link).toHaveAttribute('target', '_blank');
    // Prevents the opened tab from reaching back into this window.
    expect(link.getAttribute('rel')).toContain('noopener');
    expect(link.getAttribute('rel')).toContain('noreferrer');
    expect(screen.getByText('WhatsApp CRM')).toBeInTheDocument();
  });

  it('keeps an accessible name and hides the label text on the collapsed rail', () => {
    render(<SidebarAppSwitcher collapsed />);
    const link = screen.getByRole('link', { name: /whatsapp crm/i });
    expect(link).toHaveAttribute('href', WHATSAPP_CRM_URL);
    // The label block stays in the DOM (for the mobile drawer) but its wrapper
    // is hidden on the collapsed desktop rail.
    expect(screen.getByText('WhatsApp CRM').parentElement?.className).toContain('lg:hidden');
  });
});
