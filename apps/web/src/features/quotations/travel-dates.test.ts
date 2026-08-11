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
    expect(r.label).toBe(
      `${new Date('2026-09-02').toLocaleDateString()} – ${new Date('2026-09-08').toLocaleDateString()}`,
    );
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

  it('derives the correct end when the stored end wrongly duplicates the start of a 7-day trip', () => {
    // "22/08/2026 – 22/08/2026" is wrong for a 7-day trip → 22/08/2026 – 28/08/2026.
    const r = resolveTravelDates({ start: '2026-08-22', end: '2026-08-22', totalDays: 7 });
    expect(r.end).not.toBeNull();
    expect(r.end!.toISOString().slice(0, 10)).toBe('2026-08-28');
    expect(r.label).toContain(new Date('2026-08-28').toLocaleDateString());
  });

  it('derives a 3-day trip end as start + 2 days', () => {
    const r = resolveTravelDates({ start: '2026-09-01', end: '2026-09-01', totalDays: 3 });
    expect(r.end!.toISOString().slice(0, 10)).toBe('2026-09-03');
  });

  it('keeps an explicit valid end date that differs from the start', () => {
    const r = resolveTravelDates({ start: '2026-09-02', end: '2026-09-10', totalDays: 9 });
    expect(r.end!.toISOString().slice(0, 10)).toBe('2026-09-10');
  });

  it('treats a genuine single-day trip (totalDays 1) as start-only, never "start – start"', () => {
    const r = resolveTravelDates({ start: '2026-09-02', end: '2026-09-02', totalDays: 1 });
    expect(r.end).toBeNull();
    expect(r.label).toBe(new Date('2026-09-02').toLocaleDateString());
  });

  it('shows only the start when end duplicates start and there is no reliable duration', () => {
    const r = resolveTravelDates({ start: '2026-09-02', end: '2026-09-02', totalDays: null });
    expect(r.end).toBeNull();
    expect(r.label).toBe(new Date('2026-09-02').toLocaleDateString());
  });

  it('derives 22/08 + 6 nights → 22/08 – 28/08 even when the itinerary max day is 1', () => {
    // Quotation has a Day-1-only itinerary (maxDay 1) but a 6-night stay.
    const r = resolveTravelDates({
      start: '2026-08-22',
      end: '2026-08-22',
      totalDays: 1,
      nights: 6,
    });
    expect(r.end!.toISOString().slice(0, 10)).toBe('2026-08-28');
    expect(r.label).toContain(new Date('2026-08-28').toLocaleDateString());
  });

  it('derives 04/09 + 6 nights → 04/09 – 10/09 even when the itinerary max day is 1', () => {
    const r = resolveTravelDates({
      start: '2026-09-04',
      end: '2026-09-04',
      totalDays: 1,
      nights: 6,
    });
    expect(r.end!.toISOString().slice(0, 10)).toBe('2026-09-10');
  });

  it('never lets an itinerary max day of 1 suppress a real nights value', () => {
    const withDay1 = resolveTravelDates({
      start: '2026-08-22',
      end: null,
      totalDays: 1,
      nights: 6,
    });
    const withoutDays = resolveTravelDates({ start: '2026-08-22', end: null, nights: 6 });
    expect(withDay1.end!.toISOString().slice(0, 10)).toBe('2026-08-28');
    expect(withDay1.end!.toISOString()).toBe(withoutDays.end!.toISOString());
  });

  it('derives 30/08 + 3 nights → 30/08 – 02/09', () => {
    const r = resolveTravelDates({ start: '2026-08-30', end: null, nights: 3 });
    expect(r.end!.toISOString().slice(0, 10)).toBe('2026-09-02');
  });

  it('crosses month/year boundaries when deriving the end date', () => {
    const r = resolveTravelDates({ start: '2026-12-30', end: '2026-12-30', totalDays: 4 });
    expect(r.end!.toISOString().slice(0, 10)).toBe('2027-01-02');
  });

  it('derives end = start + nights when no totalDays is available', () => {
    // 6 nights starting 22/08/2026 → end 28/08/2026 (7 travel days).
    const r = resolveTravelDates({ start: '2026-08-22', end: null, nights: 6 });
    expect(r.end!.toISOString().slice(0, 10)).toBe('2026-08-28');
  });

  it('ignores a stored end that equals the start when only nights are available', () => {
    const r = resolveTravelDates({ start: '2026-08-22', end: '2026-08-22', nights: 6 });
    expect(r.end!.toISOString().slice(0, 10)).toBe('2026-08-28');
  });

  it('prefers totalDays over nights when both are provided', () => {
    const r = resolveTravelDates({ start: '2026-08-22', end: null, totalDays: 7, nights: 9 });
    expect(r.end!.toISOString().slice(0, 10)).toBe('2026-08-28');
  });
});
