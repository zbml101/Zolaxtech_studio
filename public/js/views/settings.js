import { h } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { field, toast, errorText } from '../lib/ui.js';
import { PUBLISH_DAYS } from '../lib/constants.js';
import { weekday, nice, addDays } from '../lib/dates.js';
import { state, refresh, saveSettings, connectGoogle, disconnectGoogle, syncCalendar, exportSheet } from '../store.js';
import { confirmDialog } from '../lib/ui.js';
import { download, api } from '../api.js';
import { signOut } from '../auth.js';

export function currentTheme() { return document.documentElement.getAttribute('data-theme'); }
export function setTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  try { localStorage.setItem('zx-theme', t); } catch (_) { /* fine */ }
  const meta = document.querySelector('meta[name=theme-color]');
  if (meta) meta.setAttribute('content', t === 'dark' ? '#0B1722' : '#F3F6F9');
}

let busy = null; // which Google action is running

function googlePanel(rerender) {
  const g = state.google;
  const run = (key, fn, done) => async () => {
    if (busy) return;
    busy = key; rerender();
    try { toast(await done(await fn()), 'success'); } catch (e) { toast(errorText(e), 'error'); }
    busy = null; rerender();
  };
  const btn = (key, label, fn, done, primary) => h('button', { class: `btn${primary ? ' primary' : ''}`, disabled: Boolean(busy), onclick: run(key, fn, done) }, busy === key ? 'Working…' : label);
  const when = g.lastSync ? new Date(g.lastSync).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : null;
  const row = (title, text, ...actions) => h('div', { class: 'rule' }, h('strong', null, title), h('span', { class: 'muted small' }, text), h('div', { class: 'row gap wrap', style: { marginTop: '6px' } }, actions));

  if (!g.configured) {
    return h('section', { class: 'panel stack' }, h('h2', null, 'Google Workspace'),
      h('p', { class: 'muted small' }, 'Not set up on this server yet. Add GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and TOKEN_KEY in the SnapDeploy environment variables to turn on Calendar, Docs and Sheets. The README has the steps.'));
  }
  if (!g.connected) {
    return h('section', { class: 'panel stack' }, h('h2', null, 'Google Workspace'),
      h('p', { class: 'muted small' }, 'Connect your Google account to put your schedule on Google Calendar, send scripts to Google Docs, and copy the video list to Google Sheets. The app can only see the calendar events and the files it creates itself.'),
      h('div', null, h('button', { class: 'btn primary', onclick: () => connectGoogle().catch((e) => toast(errorText(e), 'error')) }, icon('external'), 'Connect Google')));
  }
  return h('section', { class: 'panel stack' },
    h('div', { class: 'panel-h', style: { marginBottom: 0 } }, h('h2', null, 'Google Workspace'), h('span', { class: 'pill ok' }, g.email ? `Connected: ${g.email}` : 'Connected')),
    row('Google Calendar', `Adds the script, record, edit and publish days of every unpublished video as all-day events, and keeps them in step when you move videos. ${when ? `Last synced ${when}.` : 'Not synced yet.'} Events you deleted in Google come back on the next sync.`,
      btn('cal', when ? 'Sync again' : 'Sync to Google Calendar', syncCalendar, (r) => `Calendar updated: ${r.created} added, ${r.updated} changed, ${r.deleted} removed.`, true)),
    row('Google Sheets', 'Copies the video list into a sheet in your Drive. Each export replaces the sheet with the latest plan, so keep your own notes on another tab.',
      btn('sheet', g.sheetUrl ? 'Update Google Sheet' : 'Export to Google Sheets', exportSheet, () => 'Google Sheet is up to date.'),
      g.sheetUrl ? h('a', { class: 'btn ghost', href: g.sheetUrl, target: '_blank', rel: 'noopener noreferrer' }, icon('external'), 'Open sheet') : null),
    row('Google Docs', 'Open a video, go to its Script tab and choose Send to Google Docs. You get one document with English and Amharic side by side.',
      g.folderUrl ? h('a', { class: 'btn ghost', href: g.folderUrl, target: '_blank', rel: 'noopener noreferrer' }, icon('external'), 'Open the Drive folder') : null),
    h('div', null, h('button', { class: 'btn danger', disabled: Boolean(busy), onclick: async () => {
      if (!(await confirmDialog({ title: 'Disconnect Google?', body: 'The app stops syncing. Events and files already in Google stay where they are.', confirm: 'Disconnect' }))) return;
      try { await disconnectGoogle(); toast('Google disconnected.'); } catch (e) { toast(errorText(e), 'error'); }
    } }, 'Disconnect Google')));
}

let sending = false;
function emailPanel(rerender) {
  const on = state.settings.daily_email !== false;
  const set = async (value) => { try { await saveSettings({ daily_email: value }); toast(value ? 'Daily email is on.' : 'Daily email is off.', 'success'); } catch (_) { /* store showed the error */ } };
  const sendNow = async () => {
    if (sending) return;
    sending = true; rerender();
    try { const r = await api.post('/email/test', {}); toast(`Sent to ${r.to}. Check your inbox (and spam).`, 'success'); } catch (e) { toast(errorText(e), 'error'); }
    sending = false; rerender();
  };
  return h('section', { class: 'panel stack' }, h('h2', null, 'Daily email'),
    h('p', { class: 'muted small' }, 'Every morning at about 6:00 (Ethiopia time) you get one email with today\'s role, the tasks, any video steps due today, and anything that is behind schedule.'),
    h('div', { class: 'seg-ctl', role: 'group', 'aria-label': 'Daily email' },
      [[true, 'On'], [false, 'Off']].map(([v, label]) => h('button', { class: on === v ? 'on' : '', 'aria-pressed': on === v ? 'true' : 'false', onclick: () => { if (on !== v) set(v); } }, label))),
    h('div', null, h('button', { class: 'btn', disabled: sending, onclick: sendNow }, icon('external'), sending ? 'Sending…' : 'Send me today\'s email now')));
}

export function renderSettings(rerender) {
  const st = state.settings;
  const save = async (patch, ok = 'Saved.') => { try { await saveSettings(patch); toast(ok, 'success'); } catch (_) { /* store already showed the error */ } };
  const exp = async (path, name) => { try { await download(path, name); } catch (e) { toast(errorText(e), 'error'); } };
  return h('div', { class: 'stack-l' },
    h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'Settings'), h('p', null, state.email))),
    h('div', { class: 'cols even' },
      h('section', { class: 'panel stack' }, h('h2', null, 'Channel plan'),
        field('Channel name', h('input', { type: 'text', value: st.channel_name, maxlength: 60, onchange: (e) => { const v = e.target.value.trim(); if (v && v !== st.channel_name) save({ channel_name: v }); } })),
        field('First recording day', h('input', { type: 'date', value: st.first_record_day, onchange: (e) => {
          const v = e.target.value;
          if (!v) return;
          if (weekday(v) !== 2) { toast('Pick a Tuesday: the plan records on Tuesdays.', 'error'); e.target.value = st.first_record_day; return; }
          save({ first_record_day: v }, 'Plan dates updated.');
        } }), `Week 1 is recorded on ${nice(st.first_record_day)}. Changing this moves every date in the plan.`),
        field('Publish day', h('select', { onchange: (e) => save({ publish_offset: Number(e.target.value) }, 'Plan dates updated.') },
          PUBLISH_DAYS.map((d) => h('option', { value: d.v, selected: d.v === st.publish_offset }, d.label)))),
        field('Recording method', h('select', { onchange: (e) => save({ recording_method: e.target.value }) },
          h('option', { value: 'live', selected: st.recording_method === 'live' }, 'Live narration while recording the screen'),
          h('option', { value: 'voiceover', selected: st.recording_method === 'voiceover' }, 'Voice-over recorded after the screen'))),),
      h('div', { class: 'stack-l' },
        googlePanel(rerender),
        emailPanel(rerender),
        h('section', { class: 'panel stack' }, h('h2', null, 'Appearance'),
          h('div', { class: 'seg-ctl', role: 'group', 'aria-label': 'Theme' },
            [['dark', 'Dark', 'moon'], ['light', 'Light', 'sun']].map(([t, label, ic]) => h('button', { class: currentTheme() === t ? 'on' : '', 'aria-pressed': currentTheme() === t ? 'true' : 'false', onclick: () => { setTheme(t); rerender(); } }, icon(ic), label)))),
        h('section', { class: 'panel stack' }, h('h2', null, 'Export'),
          h('p', { class: 'muted small' }, 'The calendar file has four all-day events per video: script, record, edit and publish. Import it into Google Calendar.'),
          h('div', { class: 'row gap wrap' },
            h('button', { class: 'btn', onclick: () => exp('/export/calendar.ics', 'zolaxtech-schedule.ics') }, icon('download'), 'Calendar (.ics)'),
            h('button', { class: 'btn', onclick: () => exp('/export/videos.csv', 'zolaxtech-videos.csv') }, icon('download'), 'Videos (.csv)')),
          h('p', { class: 'muted small' }, 'A full backup holds everything: settings, every video with its script and checklist, ideas, tasks, ticks and reviews. Keep a copy somewhere safe, for example once a month.'),
          h('div', { class: 'row gap wrap' },
            h('button', { class: 'btn primary', onclick: () => exp('/export/backup.json', `zolaxtech-backup-${state.today}.json`) }, icon('download'), 'Full backup (.json)'),
            h('button', { class: 'btn', onclick: () => restoreBackup(rerender) }, icon('upload'), 'Restore from backup')),
          h('p', { class: 'muted small' }, 'Restoring is safe: it only fills in what is missing (empty scripts and notes, missing ideas, to-dos and reviews). It never overwrites or deletes anything you have now.')),
        h('section', { class: 'panel stack' }, h('h2', null, 'Account'),
          h('p', { class: 'muted small' }, `Signed in as ${state.email}.`),
          h('div', null, h('button', { class: 'btn danger', onclick: () => signOut() }, icon('logout'), 'Sign out'))))));
}

function restoreBackup(rerender) {
  const input = h('input', { type: 'file', accept: '.json,application/json' });
  input.addEventListener('change', async () => {
    const file = input.files && input.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const r = await api.post('/restore', data);
      const total = r.videos_filled + r.ideas_added + r.todos_added + r.reviews_added;
      toast(total ? `Restored: ${r.videos_filled} videos filled in, ${r.ideas_added} ideas, ${r.todos_added} to-dos, ${r.reviews_added} reviews added.` : 'Nothing to restore: everything in that file is already here.', 'success');
      if (total) { await refresh(); rerender(); }
    } catch (e) { toast(e instanceof SyntaxError ? 'That file is not a valid backup.' : errorText(e), 'error'); }
  });
  input.click();
}
