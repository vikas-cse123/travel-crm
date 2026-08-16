import { describe, expect, it } from 'vitest';
import { formatFlightDate, formatFlightTime } from './flight-format';

describe('formatFlightDate', () => {
  it('converts YYYY-MM-DD to DD/MM/YYYY', () => {
    expect(formatFlightDate('2026-08-31')).toBe('31/08/2026');
    expect(formatFlightDate('2026-09-01')).toBe('01/09/2026');
    expect(formatFlightDate('2026-11-14')).toBe('14/11/2026');
  });

  it('handles undefined input', () => {
    expect(formatFlightDate(undefined)).toBe('');
  });
});

describe('formatFlightTime', () => {
  it('converts 24h times to 12h with AM/PM', () => {
    expect(formatFlightTime('09:05')).toBe('09:05 AM');
    expect(formatFlightTime('17:45')).toBe('05:45 PM');
    expect(formatFlightTime('20:55')).toBe('08:55 PM');
    expect(formatFlightTime('00:40')).toBe('12:40 AM');
    expect(formatFlightTime('12:10')).toBe('12:10 PM');
    expect(formatFlightTime('23:30')).toBe('11:30 PM');
  });

  it('handles undefined input', () => {
    expect(formatFlightTime(undefined)).toBe('');
  });
});
