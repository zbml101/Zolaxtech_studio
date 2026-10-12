// Dates are plain "YYYY-MM-DD" strings, the same as on the server.
const DAY = 86400000;
export const parse = (iso) => new Date(iso + 'T00:00:00Z');
export const fmt = (d) => d.toISOString().slice(0, 10);
export const addDays = (iso, n) => fmt(new Date(parse(iso).getTime() + n * DAY));
export const weekday = (iso) => parse(iso).getUTCDay(); // 0 = Sunday
export const diffDays = (a, b) => Math.round((parse(a) - parse(b)) / DAY);

export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export const sundayOf = (iso) => addDays(iso, -weekday(iso));
export const nextTuesday = (iso) => addDays(iso, (2 - weekday(iso) + 7) % 7);

export function planDates(settings, position) {
  const record = addDays(settings.first_record_day, (position - 1) * 7);
  return { script: addDays(record, -2), record, edit: addDays(record, 2), publish: addDays(record, settings.publish_offset) };
}

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const dowName = (iso) => DOW[weekday(iso)];
export const monthName = (m) => MONTHS[m];
export function nice(iso) {
  if (!iso) return '';
  const d = parse(iso);
  return `${DOW[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()].slice(0, 3)}`;
}
export function niceLong(iso) {
  const d = parse(iso);
  return `${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}
export function relative(iso, today) {
  const n = diffDays(iso, today);
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n === -1) return 'yesterday';
  if (n > 1) return `in ${n} days`;
  return `${-n} days ago`;
}
