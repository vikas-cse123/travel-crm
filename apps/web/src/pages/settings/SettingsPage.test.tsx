import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
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
    operatingSince: 2015,
    totalReviews: 120,
    tripsSold: 3400,
  },
  branding: { primaryColor: '#2563eb', hasLogo: false, logoMimeType: null, logoFileSize: null },
  tax: { taxRegistrationNumber: '29ABCDE1234F1Z5', tan: 'ABC12345E' },
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
    expect(screen.getByLabelText('Operating Since')).toHaveValue(2015);
    expect(screen.getByLabelText('Total Reviews')).toHaveValue(120);
    expect(screen.getByLabelText('Trips Sold')).toHaveValue(3400);

    await userEvent.click(screen.getByRole('button', { name: 'Branding' }));
    expect(await screen.findByText('Company logo')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Tax' }));
    expect(await screen.findByLabelText('GSTIN')).toHaveValue('29ABCDE1234F1Z5');
    expect(screen.getByLabelText('TAN')).toHaveValue('ABC12345E');
    // Preferences, Default Terms, Primary Colour and Bank Account are UI-hidden.
    // Timezone is fixed at Asia/Kolkata, so the tab and its fields are gone.
    expect(screen.queryByRole('button', { name: 'Preferences' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Timezone')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Default currency')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Default Terms' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Default quotation terms')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Bank Account' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Primary colour hex')).not.toBeInTheDocument();
  });

  it('saves the company profile', async () => {
    const mock = stub(settings());
    renderWithProviders(<SettingsPage />);
    await screen.findByLabelText('Company name');
    await userEvent.clear(screen.getByLabelText('Company name'));
    await userEvent.type(screen.getByLabelText('Company name'), 'Renamed Co');
    await userEvent.clear(screen.getByLabelText('Total Reviews'));
    await userEvent.type(screen.getByLabelText('Total Reviews'), '250');
    await userEvent.click(screen.getByRole('button', { name: 'Save profile' }));
    await waitFor(() =>
      expect(
        mock.mock.calls.some(([url, o]) => {
          const body = o?.body ? JSON.parse(String(o.body)) : null;
          return (
            String(url).endsWith('/settings/profile') &&
            o?.method === 'PATCH' &&
            body?.totalReviews === 250 &&
            body?.operatingSince === 2015 &&
            body?.tripsSold === 3400
          );
        }),
      ).toBe(true),
    );
  });

  it('keeps primary colour data intact while hiding the control', async () => {
    stub(settings());
    renderWithProviders(<SettingsPage />);
    await screen.findByRole('heading', { name: 'Company Settings' });
    // The colour picker/save control is hidden from the UI…
    expect(screen.queryByLabelText('Primary colour picker')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save colour' })).not.toBeInTheDocument();
    // …while other branding (logo) remains usable.
    await userEvent.click(screen.getByRole('button', { name: 'Branding' }));
    expect(await screen.findByText('Company logo')).toBeInTheDocument();
    // The preferences save control is gone with the tab; no request is possible.
    expect(screen.queryByRole('button', { name: 'Save preferences' })).not.toBeInTheDocument();
  });

  it('saves GSTIN and TAN together and renders field-specific errors', async () => {
    const mock = stub(settings());
    renderWithProviders(<SettingsPage />);
    await screen.findByRole('heading', { name: 'Company Settings' });
    await userEvent.click(screen.getByRole('button', { name: 'Tax' }));
    await userEvent.clear(screen.getByLabelText('GSTIN'));
    await userEvent.type(screen.getByLabelText('GSTIN'), '07AAKCT5864G1ZX');
    await userEvent.clear(screen.getByLabelText('TAN'));
    await userEvent.type(screen.getByLabelText('TAN'), 'ABCD12345E');
    await userEvent.click(screen.getByRole('button', { name: 'Save tax settings' }));
    await waitFor(() =>
      expect(
        mock.mock.calls.some(([url, o]) => {
          const body = o?.body ? JSON.parse(String(o.body)) : null;
          return (
            String(url).endsWith('/settings/tax') &&
            o?.method === 'PATCH' &&
            body?.taxRegistrationNumber === '07AAKCT5864G1ZX' &&
            body?.tan === 'ABCD12345E'
          );
        }),
      ).toBe(true),
    );
  });

  it('hides the Bank Account section entirely while unrelated settings still work', async () => {
    stub(settings());
    renderWithProviders(<SettingsPage />);
    await screen.findByRole('heading', { name: 'Company Settings' });
    // No Bank Account navigation or controls anywhere.
    expect(screen.queryByRole('button', { name: 'Bank Account' })).not.toBeInTheDocument();
    expect(screen.queryByText('Account holder')).not.toBeInTheDocument();
    expect(screen.queryByText('Save bank account')).not.toBeInTheDocument();
    // Unrelated settings still render and save normally.
    await userEvent.click(screen.getByRole('button', { name: 'Tax' }));
    expect(await screen.findByLabelText('GSTIN')).toHaveValue('29ABCDE1234F1Z5');
    await userEvent.click(screen.getByRole('button', { name: 'Company Profile' }));
    expect(await screen.findByLabelText('Company name')).toHaveValue('Interscale Travel');
  });

  it('hides the Bank Account section even when bank data exists', async () => {
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
    expect(screen.queryByRole('button', { name: 'Bank Account' })).not.toBeInTheDocument();
    expect(screen.queryByText(/9012/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Replace account/)).not.toBeInTheDocument();
  });

  it('hides save controls for a view-only user', async () => {
    stub(settings({ capabilities: { canView: true, canUpdate: false } }));
    renderWithProviders(<SettingsPage />);
    await screen.findByLabelText('Company name');
    expect(screen.queryByRole('button', { name: 'Save profile' })).not.toBeInTheDocument();
  });

  it('excludes numbering and other out-of-scope sections', async () => {
    stub(settings());
    renderWithProviders(<SettingsPage />);
    await screen.findByRole('heading', { name: 'Company Settings' });
    expect(screen.queryByRole('button', { name: 'Numbering' })).not.toBeInTheDocument();
    expect(screen.queryByText('Current numbering formats')).not.toBeInTheDocument();
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

  const domainFixture = (overrides: Record<string, unknown> = {}) => ({
    hostname: 'quote.travelenfield.in',
    status: 'PENDING',
    cnameTarget: 'app.travelagencycrm.in',
    validationName: '_abc.quote.travelenfield.in',
    validationValue: '_xyz.acm-validations.aws',
    dnsVerifiedAt: null,
    activatedAt: null,
    lastCheckedAt: '2026-08-09T00:00:00.000Z',
    lastError: null,
    ...overrides,
  });

  it('shows Edit Domain and Delete Domain actions beside a configured domain', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/settings/custom-domain')) return response(domainFixture());
        return response(settings());
      }),
    );
    renderWithProviders(<SettingsPage />);
    await screen.findByRole('heading', { name: 'Company Settings' });
    await userEvent.click(screen.getByRole('button', { name: 'Custom Domain' }));
    expect(await screen.findByText('quote.travelenfield.in')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit Domain' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete Domain' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Check Again' })).toBeInTheDocument();
  });

  it('edits a custom domain through the modal and shows the new records', async () => {
    const updated = domainFixture({
      hostname: 'quote2.travelenfield.in',
      validationName: '_new.quote2.travelenfield.in',
      validationValue: '_new.acm.validations.aws',
    });
    const mock = vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/settings/custom-domain') && options?.method === 'PUT')
        return response(updated);
      if (url.endsWith('/settings/custom-domain')) return response(domainFixture());
      return response(settings());
    });
    vi.stubGlobal('fetch', mock);
    renderWithProviders(<SettingsPage />);
    await screen.findByRole('heading', { name: 'Company Settings' });
    await userEvent.click(screen.getByRole('button', { name: 'Custom Domain' }));
    await screen.findByText('quote.travelenfield.in');
    await userEvent.click(screen.getByRole('button', { name: 'Edit Domain' }));
    const input = await screen.findByLabelText('Edit custom domain hostname');
    expect(input).toHaveValue('quote.travelenfield.in');
    await userEvent.clear(input);
    await userEvent.type(input, 'quote2.travelenfield.in');
    await userEvent.click(screen.getByRole('button', { name: 'Save Domain' }));
    await waitFor(() =>
      expect(
        mock.mock.calls.some(
          ([url, o]) => String(url).endsWith('/settings/custom-domain') && o?.method === 'PUT',
        ),
      ).toBe(true),
    );
    expect(await screen.findByText('quote2.travelenfield.in')).toBeInTheDocument();
    expect(
      screen.getByText('Custom domain updated. Waiting for DNS / SSL validation.'),
    ).toBeInTheDocument();
    expect(screen.getByText(/Name: _new\.quote2\.travelenfield\.in/)).toBeInTheDocument();
  });

  it('deletes a custom domain after confirmation and returns to the empty state', async () => {
    const none = domainFixture({
      hostname: null,
      status: 'NONE',
      validationName: null,
      validationValue: null,
    });
    const mock = vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/settings/custom-domain') && options?.method === 'DELETE')
        return response(none);
      if (url.endsWith('/settings/custom-domain')) return response(domainFixture());
      return response(settings());
    });
    vi.stubGlobal('fetch', mock);
    renderWithProviders(<SettingsPage />);
    await screen.findByRole('heading', { name: 'Company Settings' });
    await userEvent.click(screen.getByRole('button', { name: 'Custom Domain' }));
    await screen.findByText('quote.travelenfield.in');
    await userEvent.click(screen.getByRole('button', { name: 'Delete Domain' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete Custom Domain' });
    expect(dialog).toHaveTextContent(
      /Remove this custom domain\? Your CRM will no longer be accessible/,
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete Domain' }));
    await waitFor(() =>
      expect(mock.mock.calls.some(([, o]) => String(o?.method) === 'DELETE')).toBe(true),
    );
    expect(await screen.findByRole('button', { name: 'Add Custom Domain' })).toBeInTheDocument();
    expect(screen.getByText('Custom domain removed.')).toBeInTheDocument();
  });

  it('shows the Add Custom Domain button in the empty state', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/settings/custom-domain'))
          return response(
            domainFixture({
              hostname: null,
              status: 'NONE',
              validationName: null,
              validationValue: null,
            }),
          );
        return response(settings());
      }),
    );
    renderWithProviders(<SettingsPage />);
    await screen.findByRole('heading', { name: 'Company Settings' });
    await userEvent.click(screen.getByRole('button', { name: 'Custom Domain' }));
    expect(await screen.findByRole('button', { name: 'Add Custom Domain' })).toBeInTheDocument();
  });
});
