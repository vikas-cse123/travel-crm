function upperCaseMeridiem(value: string) {
  return value.replace(/\b(am|pm)\b/gi, (marker) => marker.toUpperCase());
}

/** Formats stored 24-hour clock values without changing the persisted value. */
export function formatTime12Hour(value: string | null | undefined, fallback = '—') {
  if (!value) return fallback;
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(value.trim());
  if (!match) return value;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return value;
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${String(minute).padStart(2, '0')} ${hour >= 12 ? 'PM' : 'AM'}`;
}

export function formatDateTime12Hour(
  value: string | number | Date | null | undefined,
  options: { locale?: string; timeZone?: string; fallback?: string } = {},
) {
  if (value == null || value === '') return options.fallback ?? '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return options.fallback ?? '—';
  return upperCaseMeridiem(
    new Intl.DateTimeFormat(options.locale ?? 'en-IN', {
      dateStyle: 'medium',
      timeStyle: 'short',
      hour12: true,
      ...(options.timeZone ? { timeZone: options.timeZone } : {}),
    }).format(date),
  );
}

export function formatDateClock12Hour(
  value: string | number | Date | null | undefined,
  options: { locale?: string; timeZone?: string; fallback?: string } = {},
) {
  if (value == null || value === '') return options.fallback ?? '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return options.fallback ?? '—';
  return upperCaseMeridiem(
    new Intl.DateTimeFormat(options.locale ?? 'en-IN', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      ...(options.timeZone ? { timeZone: options.timeZone } : {}),
    }).format(date),
  );
}
