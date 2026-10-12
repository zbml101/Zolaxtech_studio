import { h } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { field, toast, errorText } from '../lib/ui.js';
import { PUBLISH_DAYS } from '../lib/constants.js';
import { weekday, nice, addDays } from '../lib/dates.js';
import { state, saveSettings } from '../store.js';
import { download } from '../api.js';
import { signOut } from '../auth.js';

export function currentTheme() { return document.documentElement.getAttribute('data-theme'); }
export function setTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  try { localStorage.setItem('zx-theme', t); } catch (_) { /* fine */ }
  const meta = document.querySelector('meta[name=theme-color]');
  if (meta) meta.setAttribute('content', t === 'dark' ? '#0B1722' : '#F3F6F9');
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
        h('section', { class: 'panel stack' }, h('h2', null, 'Appearance'),
          h('div', { class: 'seg-ctl', role: 'group', 'aria-label': 'Theme' },
            [['dark', 'Dark', 'moon'], ['light', 'Light', 'sun']].map(([t, label, ic]) => h('button', { class: currentTheme() === t ? 'on' : '', 'aria-pressed': currentTheme() === t ? 'true' : 'false', onclick: () => { setTheme(t); rerender(); } }, icon(ic), label)))),
        h('section', { class: 'panel stack' }, h('h2', null, 'Export'),
          h('p', { class: 'muted small' }, 'The calendar file has four all-day events per video: script, record, edit and publish. Import it into Google Calendar.'),
          h('div', { class: 'row gap wrap' },
            h('button', { class: 'btn', onclick: () => exp('/export/calendar.ics', 'zolaxtech-schedule.ics') }, icon('download'), 'Calendar (.ics)'),
            h('button', { class: 'btn', onclick: () => exp('/export/videos.csv', 'zolaxtech-videos.csv') }, icon('download'), 'Videos (.csv)'))),
        h('section', { class: 'panel stack' }, h('h2', null, 'Account'),
          h('p', { class: 'muted small' }, `Signed in as ${state.email}.`),
          h('div', null, h('button', { class: 'btn danger', onclick: () => signOut() }, icon('logout'), 'Sign out'))))));
}
