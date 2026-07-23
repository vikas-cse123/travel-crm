import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/utils';
import { SettingsPage } from './SettingsPage';

const response = (data: unknown, ok = true) =>
  ({
    ok,
    status: ok ? 200 : 500,
    json: async () =>
      ok ? { success: true, data } : { success: false, error: { code: 'X', message: 'failed' } },
  }) as Response;

const settings = (overrides: Record<string, unknown> = {}) => ({
  profile: {
    name: 'Interscale Travel',
    email: 'hello@interscale.test',
    phone: '+91 90000 00000',
    website: 'https://interscale.test',
    address: '1 MG Road',
  },
  branding: { primaryColor: '#2563eb', hasLogo: false, logoMimeType: null, logoFileSize: null },
  tax: { taxRegistrationNumber: '29ABCDE1234F1Z5' },
  preferences: { timezone: 'Asia/Kolkata', defaultCurrency: 'INR' },
  defaultTerms: { quotationTerms: 'Pay in 7 days', bookingTerms: 'No refunds' },
  bankAccount: { exists: false },
  numbering: {
    year: 2026,
    queryExample: 'QRY-2026-000001',
    customerExample: 'CUS-2026-000001',
    quotationExample: 'QT-2026-000001',
    quotationTemplateExample: 'QTP-2026-000001',
    bookingExample: 'BK-2026-000001',
    customerPaymentExample: 'PAY-2026-000001',
    refundExample: 'REF-2026-000001',
    vendorExample: 'VEN-2026-000001',
    vendorPayableExample: 'VP-2026-000001',
    vendorPaymentExample: 'VPAY-2026-000001',
  },
  capabilities: { canView: true, canUpdate: true },
  ...overrides,
});

function stub(data: unknown, ok = true) {
  const mock = vi.fn(async (_url: RequestInfo | URL, options?: RequestInit) => {
    if (options?.method && options.method !== 'GET') return response(data);
    return response(data, ok);
  });
  vi.stubGlobal('fetch', mock);
  return mock;
}

describe('Phase 18 settings page', () => {
  beforeEach(() => vi.unstubAllGlobals());

  it('renders the profile tab by default and switches tabs', async () => {
    stub(settings());
    renderWithProviders(<SettingsPage />);
    expect(await screen.findByRole('heading', { name: 'Company Settings' })).toBeInTheDocument();
    expect(screen.getByLabelText('Company name')).toHaveValue('Interscale Travel');

    await userEvent.click(screen.getByRole('button', { name: 'Branding' }));
    expect(await screen.findByLabelText('Primary colour hex')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Tax' }));
    expect(await screen.findByLabelText('Tax registration number')).toHaveValue('29ABCDE1234F1Z5');
    await userEvent.click(screen.getByRole('button', { name: 'Preferences' }));
    expect(await screen.findByLabelText('Timezone')).toHaveValue('Asia/Kolkata');
    await userEvent.click(screen.getByRole('button', { name: 'Default Terms' }));
    expect(await screen.findByLabelText('Default quotation terms')).toHaveValue('Pay in 7 days');
    await userEvent.click(screen.getByRole('button', { name: 'Bank Account' }));
    expect(await screen.findByLabelText('Account holder')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Numbering' }));
    expect(await screen.findByText('Current numbering formats')).toBeInTheDocument();
  });

  it('saves the company profile', async () => {
    const mock = stub(settings());
    renderWithProviders(<SettingsPage />);
    await screen.findByLabelText('Company name');
    await userEvent.clear(screen.getByLabelText('Company name'));
    await userEvent.type(screen.getByLabelText('Company name'), 'Renamed Co');
    await userEvent.click(screen.getByRole('button', { name: 'Save profile' }));
    await waitFor(() =>
      expect(
        mock.mock.calls.some(
          ([url, o]) => String(url).endsWith('/settings/profile') && o?.method === 'PATCH',
        ),
      ).toBe(true),
    );
  });

  it('updates the primary colour and preferences', async () => {
    const mock = stub(settings());
    renderWithProviders(<SettingsPage />);
    await screen.findByRole('heading', { name: 'Company Settings' });
    await userEvent.click(screen.getByRole('button', { name: 'Branding' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save colour' }));
    await userEvent.click(screen.getByRole('button', { name: 'Preferences' }));
    await userEvent.selectOptions(screen.getByLabelText('Timezone'), 'Asia/Dubai');
    await userEvent.selectOptions(screen.getByLabelText('Default currency'), 'AED');
    await userEvent.click(screen.getByRole('button', { name: 'Save preferences' }));
    await waitFor(() =>
      expect(mock.mock.calls.some(([url]) => String(url).endsWith('/settings/preferences'))).toBe(
        true,
      ),
    );
  });

  it('creates a bank account and blocks a confirmation mismatch', async () => {
    const mock = stub(settings());
    renderWithProviders(<SettingsPage />);
    await screen.findByRole('heading', { name: 'Company Settings' });
    await userEvent.click(screen.getByRole('button', { name: 'Bank Account' }));
    await userEvent.type(screen.getByLabelText('Account holder'), 'Interscale Pvt Ltd');
    await userEvent.type(screen.getByLabelText('Bank name'), 'HDFC');
    await userEvent.type(screen.getByLabelText('Account number'), '123456789012');
    await userEvent.type(screen.getByLabelText('Confirm account number'), '99999999');
    await userEvent.click(screen.getByRole('button', { name: 'Save bank account' }));
    expect(await screen.findByText('Account numbers do not match.')).toBeInTheDocument();
    // No PUT was sent on mismatch.
    expect(mock.mock.calls.some(([, o]) => o?.method === 'PUT')).toBe(false);

    await userEvent.clear(screen.getByLabelText('Confirm account number'));
    await userEvent.type(screen.getByLabelText('Confirm account number'), '123456789012');
    await userEvent.click(screen.getByRole('button', { name: 'Save bank account' }));
    await waitFor(() =>
      expect(
        mock.mock.calls.some(
          ([url, o]) => String(url).endsWith('/settings/bank-account') && o?.method === 'PUT',
        ),
      ).toBe(true),
    );
  });

  it('shows a masked existing bank account', async () => {
    stub(
      settings({
        bankAccount: {
          exists: true,
          accountHolderName: 'Interscale Pvt Ltd',
          bankName: 'HDFC',
          branchName: 'MG Road',
          accountNumberLast4: '9012',
          accountNumberMasked: '••••9012',
          ifscCode: 'HDFC0001234',
        },
      }),
    );
    renderWithProviders(<SettingsPage />);
    await screen.findByRole('heading', { name: 'Company Settings' });
    await userEvent.click(screen.getByRole('button', { name: 'Bank Account' }));
    expect(await screen.findByText(/9012/)).toBeInTheDocument();
    expect(screen.getByText(/Replace account/)).toBeInTheDocument();
  });

  it('hides save controls for a view-only user', async () => {
    stub(settings({ capabilities: { canView: true, canUpdate: false } }));
    renderWithProviders(<SettingsPage />);
    await screen.findByLabelText('Company name');
    expect(screen.queryByRole('button', { name: 'Save profile' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Bank Account' }));
    expect(screen.queryByLabelText('Account holder')).not.toBeInTheDocument();
  });

  it('renders a read-only numbering table and excludes out-of-scope sections', async () => {
    stub(settings());
    renderWithProviders(<SettingsPage />);
    await screen.findByRole('heading', { name: 'Company Settings' });
    await userEvent.click(screen.getByRole('button', { name: 'Numbering' }));
    expect(await screen.findByText('BK-2026-000001')).toBeInTheDocument();
    expect(screen.getByText(/Read-only in this version/)).toBeInTheDocument();
    // Excluded settings must not appear anywhere.
    for (const label of [
      'Email Configuration',
      'WhatsApp Settings',
      'Subscription Info',
      'Learning',
    ])
      expect(screen.queryByText(label)).not.toBeInTheDocument();
  });

  it('shows loading and error states', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    );
    const view = renderWithProviders(<SettingsPage />);
    expect(document.querySelector('.animate-pulse')).toBeInTheDocument();
    view.unmount();
    stub(settings(), false);
    renderWithProviders(<SettingsPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not be loaded/i);
  });
});
