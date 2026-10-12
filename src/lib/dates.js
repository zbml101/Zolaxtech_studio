// Date math for the weekly plan. All dates are plain "YYYY-MM-DD" strings (no time zones).
//
// The plan, for the video in week N (position N):
//   record day  = first Tuesday + (N - 1) weeks
//   script day  = record day - 2   (Sunday)
//   edit day    = record day + 2   (Thursday)
//   publish day = record day + publish_offset (4 = Saturday)

const DAY = 86400000;

const parse = (iso) => new Date(iso + 'T00:00:00Z');
const fmt = (date) => date.toISOString().slice(0, 10);
const addDays = (iso, n) => fmt(new Date(parse(iso).getTime() + n * DAY));

// Day of the week, 0 = Sunday ... 6 = Saturday
const weekday = (iso) => parse(iso).getUTCDay();

// The next Tuesday on or after the given date.
function nextTuesday(iso) {
  const diff = (2 - weekday(iso) + 7) % 7;
  return addDays(iso, diff);
}

function planDates(settings, position) {
  const record = addDays(settings.first_record_day, (position - 1) * 7);
  return {
    script: addDays(record, -2),
    record,
    edit: addDays(record, 2),
    publish: addDays(record, settings.publish_offset),
  };
}

module.exports = { parse, fmt, addDays, weekday, nextTuesday, planDates };
