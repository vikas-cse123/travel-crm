import { describe, expect, it } from 'vitest';
import { formatDateTime12Hour, formatTime12Hour } from './dateTime';

describe('12-hour time formatting', () => {
  it.each([
    ['00:00', '12:00 AM'],
    ['09:05', '9:05 AM'],
    ['12:00', '12:00 PM'],
    ['23:45', '11:45 PM'],
  ])('formats %s as %s', (value, expected) => {
    expect(formatTime12Hour(value)).toBe(expected);
  });

  it('forces AM/PM for timestamp displays', () => {
    expect(formatDateTime12Hour('2026-08-11T15:30:00+05:30', { timeZone: 'Asia/Kolkata' })).toMatch(
      /3:30 PM/,
    );
  });
});
