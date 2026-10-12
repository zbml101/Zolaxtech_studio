// Builds an iCalendar (.ics) file with the four working days of every video.
// Import it into Google Calendar: Settings > Import & export.
const { planDates, addDays } = require('./dates');

const KINDS = [
  ['script', 'Script day', 'Write the full script and test every step on screen.'],
  ['record', 'Record day', 'Record the screen and your voice in Camtasia.'],
  ['edit', 'Edit day', 'Cut in Camtasia, clean audio in Audition, finish in CapCut, then upload and schedule.'],
  ['publish', 'Publish day', 'Check that the video is live, share it and reply to comments.'],
];

const esc = (s) =>
  String(s).replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

// Lines must be 75 bytes or fewer; longer lines continue on the next line after a space.
function fold(line) {
  const out = [];
  let cur = '';
  let bytes = 0;
  for (const ch of line) {
    const b = Buffer.byteLength(ch);
    if (bytes + b > 75) {
      out.push(cur);
      cur = ' ';
      bytes = 1;
    }
    cur += ch;
    bytes += b;
  }
  out.push(cur);
  return out.join('\r\n');
}

const compact = (iso) => iso.replace(/-/g, '');

function buildCalendar(videos, settings, now = new Date()) {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const channel = settings.channel_name || 'ZolaxTech';
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', `PRODID:-//${esc(channel)}//Studio//EN`, 'CALSCALE:GREGORIAN',
    `X-WR-CALNAME:${esc(channel)} plan`];

  for (const v of videos) {
    const dates = planDates(settings, v.position);
    for (const [kind, label, blurb] of KINDS) {
      const day = dates[kind];
      lines.push(
        'BEGIN:VEVENT',
        `UID:${v.id}-${kind}@zolaxtech-studio`,
        `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${compact(day)}`,
        `DTEND;VALUE=DATE:${compact(addDays(day, 1))}`,
        `SUMMARY:${esc(`${channel} ${label}: Ep ${v.position} ${v.title}`)}`,
        `DESCRIPTION:${esc(blurb)}`,
        'TRANSP:TRANSPARENT',
        'END:VEVENT',
      );
    }
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

module.exports = { buildCalendar };
