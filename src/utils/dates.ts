const pad = (n: number) => String(n).padStart(2, '0');

/** ISO timestamp -> "YYYY-MM-DD" of the user's LOCAL day (null if the timestamp is invalid). */
export function localDayKey(iso: string): string | null {
  const date = new Date(iso);
  if (isNaN(date.getTime())) return null;
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** "2026-10-14" -> "Wed, Oct 14" */
export function formatDayLabel(dayKey: string): string {
  const [y, m, d] = dayKey.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  if (isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

/** ISO timestamp -> local time, e.g. "21:40" ("--:--" if the timestamp is invalid) */
export function formatTime(iso: string): string {
  const date = new Date(iso);
  if (isNaN(date.getTime())) return '--:--';
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
