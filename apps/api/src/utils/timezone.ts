/** Convert a wall-clock time in an IANA timezone to its UTC instant. */
function zonedTimeToUtc(
  timezone: string,
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
) {
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const offsetAt = (date: Date) => {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date);
    const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return (
      Date.UTC(
        Number(value.year),
        Number(value.month) - 1,
        Number(value.day),
        Number(value.hour),
        Number(value.minute),
        Number(value.second),
      ) - date.getTime()
    );
  };
  let result = new Date(guess.getTime() - offsetAt(guess));
  result = new Date(guess.getTime() - offsetAt(result));
  return result;
}

/** UTC boundaries for the current local day in the company's timezone. */
export function localDayBounds(timezone: string, reference = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(reference);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const year = Number(value.year);
  const month = Number(value.month);
  const day = Number(value.day);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  const start = zonedTimeToUtc(timezone, year, month, day);
  const end = zonedTimeToUtc(
    timezone,
    next.getUTCFullYear(),
    next.getUTCMonth() + 1,
    next.getUTCDate(),
  );
  return { start, end };
}

export function localWeekStart(timezone: string, reference = new Date()) {
  const { start } = localDayBounds(timezone, reference);
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
  }).format(reference);
  const daysFromMonday = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(weekday);
  const localDate = new Date(reference.getTime() - Math.max(0, daysFromMonday) * 86_400_000);
  return localDayBounds(timezone, localDate).start < start
    ? localDayBounds(timezone, localDate).start
    : start;
}
