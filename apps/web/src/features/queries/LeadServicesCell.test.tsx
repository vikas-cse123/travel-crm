import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LeadServicesCell } from './LeadServicesCell';
import type { Lead } from './queries.api';

/** Build a minimal Lead carrying only the services the cell reads. */
const leadWith = (services: Array<{ serviceType?: string | null }>): Lead =>
  ({ services }) as unknown as Lead;

function chipNames(): string[] {
  return screen.getAllByRole('img').map((el) => el.getAttribute('aria-label') ?? '');
}

describe('LeadServicesCell', () => {
  it('renders service chips in the fixed display order regardless of input order', () => {
    render(
      <LeadServicesCell
        lead={leadWith([
          { serviceType: 'CRUISE' },
          { serviceType: 'OTHER_ADD_ON' },
          { serviceType: 'FLIGHT' },
          { serviceType: 'HOTEL' },
        ])}
      />,
    );
    expect(chipNames()).toEqual([
      'Flight service',
      'Hotel service',
      'Cruise service',
      'Other Add On service',
    ]);
  });

  it('renders exactly the selected Hotel + Sightseeing services and nothing else', () => {
    render(
      <LeadServicesCell
        lead={leadWith([{ serviceType: 'HOTEL' }, { serviceType: 'SIGHTSEEING' }])}
      />,
    );
    expect(chipNames()).toEqual(['Hotel service', 'Sightseeing service']);
    expect(screen.getAllByRole('img')).toHaveLength(2);
    expect(screen.queryByRole('img', { name: 'Flight service' })).not.toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'Vehicle Transfer service' })).not.toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'Cruise service' })).not.toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'Other Add On service' })).not.toBeInTheDocument();
  });

  it('renders all six form services as six icons with no +N chip', () => {
    render(
      <LeadServicesCell
        lead={leadWith([
          { serviceType: 'CRUISE' },
          { serviceType: 'FLIGHT' },
          { serviceType: 'HOTEL' },
          { serviceType: 'VEHICLE_TRANSFER' },
          { serviceType: 'SIGHTSEEING' },
          { serviceType: 'OTHER_ADD_ON' },
        ])}
      />,
    );
    expect(screen.getAllByRole('img')).toHaveLength(6);
    expect(chipNames()).toEqual([
      'Flight service',
      'Hotel service',
      'Sightseeing service',
      'Vehicle Transfer service',
      'Cruise service',
      'Other Add On service',
    ]);
    expect(screen.queryByRole('img', { name: /more services/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/\+1/)).not.toBeInTheDocument();
  });

  it('deduplicates repeated types and shows a count badge only when the count is greater than one', () => {
    const duplicated = render(
      <LeadServicesCell lead={leadWith([{ serviceType: 'HOTEL' }, { serviceType: 'HOTEL' }])} />,
    );
    // One chip for the repeated type, with a "2" badge.
    expect(screen.getAllByRole('img')).toHaveLength(1);
    const badgeChip = screen.getByRole('img', { name: 'Hotel services: 2' });
    expect(badgeChip.textContent?.trim()).toBe('2');
    duplicated.unmount();

    // A count of one renders no badge.
    render(<LeadServicesCell lead={leadWith([{ serviceType: 'HOTEL' }])} />);
    expect(screen.getAllByRole('img')).toHaveLength(1);
    const singleChip = screen.getByRole('img', { name: 'Hotel service' });
    expect(singleChip.textContent?.trim()).toBe('');
  });

  it('ignores blank, null and unsupported service entries instead of rendering a fallback icon', () => {
    render(
      <LeadServicesCell
        lead={leadWith([
          {},
          { serviceType: '' },
          { serviceType: null },
          { serviceType: 'MYSTERY_SERVICE' },
          { serviceType: 'VISA' },
          { serviceType: 'RAIL' },
        ])}
      />,
    );
    // Only the muted empty state renders — no placeholder chip.
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('shows a clean em-dash empty state when no services are selected', () => {
    render(<LeadServicesCell lead={leadWith([])} />);
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('gives every visible chip a tooltip and keeps the cell wrapping', () => {
    render(
      <LeadServicesCell
        lead={leadWith([
          { serviceType: 'FLIGHT' },
          { serviceType: 'HOTEL' },
          { serviceType: 'SIGHTSEEING' },
          { serviceType: 'VEHICLE_TRANSFER' },
          { serviceType: 'CRUISE' },
        ])}
      />,
    );
    const container = screen.getByRole('img', { name: 'Flight service' }).parentElement;
    expect(container?.className).toContain('flex-wrap');
    for (const name of [
      'Flight service',
      'Hotel service',
      'Sightseeing service',
      'Vehicle Transfer service',
      'Cruise service',
    ]) {
      const chip = screen.getByRole('img', { name });
      expect(chip.getAttribute('title')).toBeTruthy();
      expect(chip.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    }
  });

  it('does not permanently render service names as text inside the cell', () => {
    render(
      <LeadServicesCell
        lead={leadWith([
          { serviceType: 'FLIGHT' },
          { serviceType: 'HOTEL' },
          { serviceType: 'SIGHTSEEING' },
        ])}
      />,
    );
    for (const name of ['Flight service', 'Hotel service', 'Sightseeing service']) {
      expect(screen.getByRole('img', { name }).textContent?.trim()).toBe('');
    }
  });
});
