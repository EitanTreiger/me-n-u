export const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function pad(n: number) {
  return String(n).padStart(2, '0');
}

/** Local date as YYYY-MM-DD. */
export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fromISODate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Monday of the week containing `d`. */
export function weekStart(d = new Date()): string {
  const date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const offset = (date.getDay() + 6) % 7; // Monday = 0
  date.setDate(date.getDate() - offset);
  return toISODate(date);
}

export function addWeeks(iso: string, weeks: number): string {
  const d = fromISODate(iso);
  d.setDate(d.getDate() + weeks * 7);
  return toISODate(d);
}

export function dayDate(iso: string, day: number): Date {
  const d = fromISODate(iso);
  d.setDate(d.getDate() + day);
  return d;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatShort(d: Date): string {
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

export function weekLabel(iso: string): string {
  const start = fromISODate(iso);
  const end = dayDate(iso, 6);
  const current = weekStart();
  const prefix = iso === current ? 'This week' : iso === addWeeks(current, 1) ? 'Next week' : iso === addWeeks(current, -1) ? 'Last week' : null;
  const range = `${formatShort(start)} – ${formatShort(end)}`;
  return prefix ? `${prefix} · ${range}` : range;
}

/** Index (0 = Monday) of today if it falls in the given week, else -1. */
export function todayIndex(iso: string): number {
  return iso === weekStart() ? (new Date().getDay() + 6) % 7 : -1;
}
