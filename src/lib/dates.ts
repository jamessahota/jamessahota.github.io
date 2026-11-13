// Dates in content may be a year, a month or a day (2026, 2026-05, 2026-05-13).
// These helpers show each at the precision it was written with.

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const parts = (value: string) => value.split('-').map(Number) as [number, number?, number?];

/** 12 September 2026, May 2026 or 2026. */
export function formatDate(value: string): string {
  const [year, month, day] = parts(value);
  if (!month) return String(year);
  if (!day) return `${MONTHS[month - 1]} ${year}`;
  return `${day} ${MONTHS[month - 1]} ${year}`;
}

/** 12 Sep 2026, May 2026 or 2026, for tight columns. */
export function formatDateShort(value: string): string {
  const [year, month, day] = parts(value);
  if (!month) return String(year);
  if (!day) return `${MONTHS[month - 1]!.slice(0, 3)} ${year}`;
  return `${day} ${MONTHS[month - 1]!.slice(0, 3)} ${year}`;
}

/** April 2026 – Present, or July – September 2026 when both ends share a year. */
export function formatPeriod(start: string, end?: string): string {
  if (!end) return `${formatDate(start)} – Present`;
  if (formatDate(start) === formatDate(end)) return formatDate(start);
  const [startYear, startMonth] = parts(start);
  const [endYear, endMonth] = parts(end);
  if (startYear === endYear && startMonth && endMonth) {
    return `${MONTHS[startMonth - 1]} – ${MONTHS[endMonth - 1]} ${endYear}`;
  }
  return `${formatDate(start)} – ${formatDate(end)}`;
}

/**
 * A sortable key. A date without a day counts as the end of its month, and a
 * date without a month as the end of its year, so in a newest-first list a
 * piece dated "May 2026" comes above one dated "1 May 2026".
 */
export function sortKey(value?: string): string {
  if (!value) return '';
  const [year, month = 99, day = 99] = parts(value);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
