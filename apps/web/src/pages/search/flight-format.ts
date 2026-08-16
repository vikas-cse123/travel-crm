/** Format an ISO date (YYYY-MM-DD) for display as DD/MM/YYYY. */
export function formatFlightDate(date: string | undefined): string {
  if (!date) return '';
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  if (!match) return date;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

/** Format a 24h time (HH:MM) for display as hh:mm AM/PM. */
export function formatFlightTime(time: string | undefined): string {
  if (!time) return '';
  const match = /^(\d{2}):(\d{2})/.exec(time);
  if (!match) return time;
  const hours = Number(match[1]);
  const minutes = match[2];
  const period = hours >= 12 ? 'PM' : 'AM';
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${String(hour12).padStart(2, '0')}:${minutes} ${period}`;
}
