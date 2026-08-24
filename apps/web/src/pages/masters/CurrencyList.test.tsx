import { describe, expect, it } from 'vitest';
import { SETTINGS_CURRENCIES } from '@interscale/shared';
import { render, screen } from '@testing-library/react';
import { CurrencySelect } from '../masters/MasterUi';

describe('shared currency list (full active ISO 4217)', () => {
  it('offers the full active ISO 4217 set, not the old 9-code subset', () => {
    expect(SETTINGS_CURRENCIES.length).toBeGreaterThan(100);
    // Previously-missing active currencies are now available.
    for (const code of ['KES', 'NOK', 'XCD', 'ZMW', 'EGP', 'HUF', 'BHD', 'MXN', 'VND']) {
      expect(SETTINGS_CURRENCIES).toContain(code);
    }
    // The original codes are all still present.
    for (const code of ['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD', 'THB', 'AUD', 'JPY']) {
      expect(SETTINGS_CURRENCIES).toContain(code);
    }
  });

  it('contains only unique, well-formed three-letter codes', () => {
    expect(new Set(SETTINGS_CURRENCIES).size).toBe(SETTINGS_CURRENCIES.length);
    for (const code of SETTINGS_CURRENCIES) {
      expect(code).toMatch(/^[A-Z]{3}$/);
    }
  });

  it('renders every currency code as an option in CurrencySelect and defaults to INR', () => {
    render(<CurrencySelect value="INR" onChange={() => undefined} />);
    const select = screen.getByRole('combobox');
    const options = Array.from(select.querySelectorAll('option')).map((o) => o.value);
    expect(options).toEqual(SETTINGS_CURRENCIES);
    expect(select).toHaveValue('INR');
    expect(options).toContain('XCD');
  });
});