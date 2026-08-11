import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLocation } from 'react-router-dom';
import { renderWithProviders } from '@/test/utils';
import { NewNotePage } from './NewNotePage';

const response = (data: unknown) =>
  ({ ok: true, status: 200, json: async () => ({ success: true, data }) }) as Response;

const lead = {
  id: 'lead-77',
  queryNumber: 'QRY-000077',
  customerName: 'Nina Shah',
  phone: '+91 90000 00000',
  email: 'nina@example.com',
};

/** Renders the current path so navigation off the page can be asserted. */
function LocationProbe() {
  return <div data-testid="location">{useLocation().pathname}</div>;
}

describe('Add note lead picker (NewNotePage)', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        response({
          data: [lead],
          pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
        }),
      ),
    );
  });

  it('matches the Create quotation layout: back link, heading and lead card', () => {
    renderWithProviders(<NewNotePage />);
    expect(screen.getByRole('heading', { name: 'Add note' })).toBeInTheDocument();
    expect(screen.getByText('Lead notes')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Choose the lead to note against' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveAttribute('href', '/notes');
  });

  it('keeps Continue disabled until a lead is chosen, then opens that lead note form', async () => {
    renderWithProviders(
      <>
        <NewNotePage />
        <LocationProbe />
      </>,
    );

    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();

    await userEvent.click(screen.getByRole('combobox', { name: 'Lead' }));
    await userEvent.click(await screen.findByRole('option', { name: /Nina Shah/ }));

    const proceed = screen.getByRole('button', { name: 'Continue' });
    expect(proceed).toBeEnabled();
    await userEvent.click(proceed);

    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent('/queries/lead-77/notes/new'),
    );
  });
});
