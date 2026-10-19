// Builds the morning email: what today is for, the tasks, and which video milestones fall due.
const { STAGES } = require('../constants');
const { addDays, weekday } = require('./dates');

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
// A milestone is done once the video has reached this stage.
const MILESTONES = [['script', 'Script', 1], ['record', 'Record', 2], ['edit', 'Edit', 4], ['publish', 'Publish', 6]];

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const longDate = (iso) => { const d = new Date(iso + 'T00:00:00Z'); return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`; };
const shortDate = (iso) => { const d = new Date(iso + 'T00:00:00Z'); return `${WEEKDAYS[d.getUTCDay()].slice(0, 3)} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()].slice(0, 3)}`; };
const hours = (m) => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}` : `${m} min`);

function planDates(settings, position) {
  const record = addDays(settings.first_record_day, (position - 1) * 7);
  return { script: addDays(record, -2), record, edit: addDays(record, 2), publish: addDays(record, settings.publish_offset) };
}

function buildDigest({ settings, videos, ticked = new Set(), templates, today, appUrl = '' }) {
  const dayKey = DAY_KEYS[weekday(today)];
  const info = templates.routine.days[dayKey];
  const weekStart = addDays(today, -weekday(today));
  const tasks = templates.routine.tasks.filter((t) => t.day === dayKey && (t.applies === 'both' || t.applies === settings.recording_method));
  const open = tasks.filter((t) => !ticked.has(`${weekStart}|${t.id}`));
  const minutes = open.reduce((s, t) => s + (t.minutes || 0), 0);

  const live = videos.filter((v) => v.stage !== 'published').sort((a, b) => a.position - b.position);
  const due = []; const late = [];
  for (const v of live) {
    const idx = STAGES.indexOf(v.stage);
    const d = planDates(settings, v.position);
    let isLate = false; // one "behind" line per video is enough: the earliest missed step
    for (const [key, label, need] of MILESTONES) {
      if (idx >= need) continue;
      if (d[key] === today) due.push({ v, label, date: d[key] });
      else if (d[key] < today && !isLate) { late.push({ v, label, date: d[key] }); isLate = true; }
    }
  }
  const next = live[0] || null;
  const tomorrow = templates.routine.days[DAY_KEYS[(weekday(today) + 1) % 7]];

  const subject = `${shortDate(today)} · ${info.role}${open.length ? ` · ${open.length} ${open.length === 1 ? 'task' : 'tasks'}, ${hours(minutes)}` : ''}`;

  const text = [
    `${longDate(today)} · ${info.role}`, info.blurb, '',
    open.length ? `Today's tasks (${hours(minutes)}):` : (tasks.length ? 'Everything for today is already ticked. Well done.' : 'No channel work today.'),
    ...open.map((t) => `- ${t.text}${t.tool ? ` [${t.tool}]` : ''} (${t.minutes} min)`),
    ...(due.length ? ['', 'Due today:', ...due.map((x) => `- ${x.label}: week ${x.v.position}, ${x.v.title}`)] : []),
    ...(late.length ? ['', 'Behind schedule:', ...late.map((x) => `- ${x.label} for week ${x.v.position}, ${x.v.title} (was ${shortDate(x.date)})`)] : []),
    ...(next ? ['', `Up next: week ${next.position}, ${next.title}`] : []),
    '', `Tomorrow: ${tomorrow.role}`, appUrl ? `Open the app: ${appUrl}` : '',
  ].filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n');

  const li = (s) => `<li style="margin:0 0 8px">${s}</li>`;
  const html = `<!doctype html><html><body style="margin:0;background:#0b1722;padding:24px;font-family:Segoe UI,Arial,sans-serif;color:#e8eef4">
<div style="max-width:560px;margin:0 auto;background:#132433;border-radius:14px;padding:24px;border:1px solid #23394d">
<div style="color:#f5b82e;font-size:13px;letter-spacing:.02em">${esc(longDate(today))}</div>
<h1 style="margin:4px 0 6px;font-size:24px;color:#fff">${esc(info.role)}</h1>
<p style="margin:0 0 18px;color:#9fb3c4">${esc(info.blurb)}</p>
${open.length ? `<h2 style="font-size:15px;margin:0 0 10px;color:#fff">Today's tasks · ${esc(hours(minutes))}</h2><ul style="padding-left:18px;margin:0 0 16px">${open.map((t) => li(`${esc(t.text)}<br><span style="color:#9fb3c4;font-size:12px">${esc(t.tool || '')}${t.tool ? ' · ' : ''}${t.minutes} min</span>`)).join('')}</ul>`
    : `<p style="margin:0 0 16px">${tasks.length ? 'Everything for today is already ticked. Well done.' : 'No channel work today. Rest keeps the habit going.'}</p>`}
${due.length ? `<h2 style="font-size:15px;margin:0 0 10px;color:#f5b82e">Due today</h2><ul style="padding-left:18px;margin:0 0 16px">${due.map((x) => li(`${esc(x.label)}: week ${x.v.position}, ${esc(x.v.title)}`)).join('')}</ul>` : ''}
${late.length ? `<h2 style="font-size:15px;margin:0 0 10px;color:#ff7a66">Behind schedule</h2><ul style="padding-left:18px;margin:0 0 16px">${late.map((x) => li(`${esc(x.label)} for week ${x.v.position}, ${esc(x.v.title)} <span style="color:#9fb3c4">(was ${esc(shortDate(x.date))})</span>`)).join('')}</ul>` : ''}
${next ? `<p style="margin:0 0 6px;color:#9fb3c4;font-size:13px">Up next</p><p style="margin:0 0 16px;font-weight:600;color:#fff">Week ${next.position}: ${esc(next.title)}</p>` : ''}
<p style="margin:0 0 18px;color:#9fb3c4;font-size:13px">Tomorrow: ${esc(tomorrow.role)}</p>
${appUrl ? `<a href="${esc(appUrl)}" style="display:inline-block;background:#f5b82e;color:#0b1722;text-decoration:none;font-weight:700;padding:10px 18px;border-radius:9px">Open ZolaxTech Studio</a>` : ''}
</div></body></html>`;
  return { subject, text, html, taskCount: open.length };
}

// Today's date where you live, as YYYY-MM-DD.
function todayIn(timeZone, now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

module.exports = { buildDigest, todayIn };
