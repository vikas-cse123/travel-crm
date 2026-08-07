import { describe, expect, it } from 'vitest';
import { resolveTravelDates } from './travel-dates';

/**
 * Travel-date resolution. "Open" must never appear as an end date; when the end
 * date is missing, a reliable trip duration (number of travel days) is used to
 * derive an inclusive end date (end = start + totalDays - 1).
 */
describe('resolveTravelDates', () => {
  it('shows both actual dates when start and end are present', () => {
    const r = resolveTravelDates({
      start: '2026-09-02',
      end: '2026-09-08',
      totalDays: 7,
    });
    expect(r.label).toBe(`${new Date('2026-09-02').toLocaleDateString()} – ${new Date('2026-09-08').toLocaleDateString()}`);
  });

  it('derives the inclusive end date for a 7-day trip starting 02/09/2026 → 08/09/2026', () => {
    const r = resolveTravelDates({ start: '2026-09-02', end: null, totalDays: 7 });
    expect(r.end).not.toBeNull();
    expect(r.end!.toISOString().slice(0, 10)).toBe('2026-09-08');
  });

  it('derives the inclusive end date for a 7-day trip starting 28/08/2026 → 03/09/2026', () => {
    const r = resolveTravelDates({ start: '2026-08-28', end: null, totalDays: 7 });
    expect(r.end).not.toBeNull();
    expect(r.end!.toISOString().slice(0, 10)).toBe('2026-09-03');
  });

  it('shows only the start date when there is no reliable duration', () => {
    const r = resolveTravelDates({ start: '2026-09-02', end: null, totalDays: null });
    expect(r.end).toBeNull();
    expect(r.label).toBe(new Date('2026-09-02').toLocaleDateString());
  });

  it('returns an empty label when there is no start date (caller shows its empty state)', () => {
    const r = resolveTravelDates({ start: null, end: null, totalDays: 7 });
    expect(r.label).toBe('');
    expect(r.start).toBeNull();
    expect(r.end).toBeNull();
  });

  it('never returns "Open"', () => {
    const single = resolveTravelDates({ start: '2026-09-02', end: null, totalDays: null });
    const full = resolveTravelDates({ start: '2026-09-02', end: '2026-09-08' });
    expect(single.label).not.toContain('Open');
    expect(full.label).not.toContain('Open');
  });
});
