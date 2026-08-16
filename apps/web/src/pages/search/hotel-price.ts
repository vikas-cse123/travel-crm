import type { SearchApiPrice } from '@interscale/shared';

export interface ResolvedHotelPrice {
  /** The main price string to render, or null when no price is available. */
  main: string | null;
  /** True when the shown price came from `price_before_taxes`. */
  beforeTaxes: boolean;
}

/**
 * Resolve the current price to display for a hotel price object.
 *
 * SearchApi sometimes omits the `price` field and only returns
 * `price_before_taxes`. In that case `price_before_taxes` is the CURRENT
 * price before taxes — not an old/original price — and must be shown as the
 * main price rather than struck through.
 */
export function resolveHotelPrice(price: SearchApiPrice | null | undefined): ResolvedHotelPrice {
  const current = price?.price?.trim();
  if (current && current !== '—') {
    return { main: current, beforeTaxes: false };
  }
  const beforeTaxes = price?.price_before_taxes?.trim();
  if (beforeTaxes) {
    return { main: beforeTaxes, beforeTaxes: true };
  }
  return { main: null, beforeTaxes: false };
}
