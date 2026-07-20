import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/utils';
import { LoginPage } from './LoginPage';

/** Stub fetch with a per-path handler map. */
function stubFetch(handler: (url: string, init?: RequestInit) => { ok: boolean; body: unknown }) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const { ok, body } = handler(url, init);
      return {
        ok,
        status: ok ? 200 : 401,
        statusText: ok ? 'OK' : 'Unauthorized',
        json: async () => body,
      } as Response;
    }),
  );
}

describe('LoginPage', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    document.cookie = '';
  });

  it('renders the email and password fields', () => {
    renderWithProviders(<LoginPage />, { route: '/login' });
    expect(screen.getByLabelText(/work email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password/i)).toBeInTheDocument();
  });

  it('validates required fields before submitting', async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    renderWithProviders(<LoginPage />, { route: '/login' });
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    // Empty fields surface the required-field messages.
    expect(await screen.findByText(/email is required/i)).toBeInTheDocument();
    // Never hit the network with an invalid form.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('shows the generic error on invalid credentials', async () => {
    const user = userEvent.setup();
    stubFetch(() => ({
      ok: false,
      body: {
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Invalid email or password.' },
      },
    }));

    renderWithProviders(<LoginPage />, { route: '/login' });

    await user.type(screen.getByLabelText(/work email/i), 'user@example.com');
    await user.type(screen.getByLabelText(/^password/i), 'WrongPass@1');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password.');
  });

  it('toggles password visibility', async () => {
    const user = userEvent.setup();
    renderWithProviders(<LoginPage />, { route: '/login' });

    const passwordInput = screen.getByLabelText(/^password/i);
    expect(passwordInput).toHaveAttribute('type', 'password');

    await user.click(screen.getByRole('button', { name: /show password/i }));
    expect(passwordInput).toHaveAttribute('type', 'text');
  });
});
