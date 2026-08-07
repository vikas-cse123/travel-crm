import { describe, expect, it } from 'vitest';
import { destinationImageCandidates } from '../src/modules/quotations/quotations.service.js';

/**
 * Destination-image resolution semantics.
 *
 * The lead itinerary's `country` field holds the Destination Master name
 * (e.g. "Malaysia") while `destination` holds the city (e.g. "Kuala Lumpur").
 * The image resolver must prefer the Master country so a Malaysia → Kuala Lumpur
 * quotation resolves the Malaysia Master image instead of searching for a
 * "Kuala Lumpur" Destination (which never exists).
 */
describe('destinationImageCandidates', () => {
  it('resolves Malaysia first for a Malaysia → Kuala Lumpur quotation', () => {
    const candidates = destinationImageCandidates('Kuala Lumpur', [
      { country: 'Malaysia', destination: 'Kuala Lumpur' },
    ]);
    // The Master country must be the primary lookup candidate, before the city.
    expect(candidates[0]).toBe('malaysia');
    expect(candidates).toContain('kuala lumpur');
  });

  it('resolves Singapore for a Singapore → Singapore quotation', () => {
    const candidates = destinationImageCandidates('Singapore', [
      { country: 'Singapore', destination: 'Singapore' },
    ]);
    expect(candidates[0]).toBe('singapore');
  });

  it('deduplicates repeated stays of the same Master country', () => {
    const candidates = destinationImageCandidates('Kuala Lumpur', [
      { country: 'Malaysia', destination: 'Kuala Lumpur' },
      { country: 'Malaysia', destination: 'Langkawi' },
    ]);
    expect(candidates.filter((c) => c === 'malaysia')).toHaveLength(1);
  });

  it('orders multiple Master countries in first-seen order (Malaysia → Singapore)', () => {
    const candidates = destinationImageCandidates('Kuala Lumpur', [
      { country: 'Malaysia', destination: 'Kuala Lumpur' },
      { country: 'Singapore', destination: 'Singapore' },
    ]);
    const idxMalaysia = candidates.indexOf('malaysia');
    const idxSingapore = candidates.indexOf('singapore');
    expect(idxMalaysia).toBeGreaterThanOrEqual(0);
    expect(idxSingapore).toBeGreaterThan(idxMalaysia);
  });

  it('falls back to the destination summary for legacy quotations with no country', () => {
    const candidates = destinationImageCandidates('Kuala Lumpur', [
      { country: null, destination: 'Kuala Lumpur' },
    ]);
    // Summary (Kuala Lumpur) comes before the city fallback.
    expect(candidates[0]).toBe('kuala lumpur');
  });

  it('returns an empty list when nothing is present', () => {
    expect(destinationImageCandidates('', [])).toEqual([]);
    expect(destinationImageCandidates(null, null)).toEqual([]);
  });
});
