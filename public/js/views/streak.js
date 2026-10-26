import { h } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { toast, confetti } from '../lib/ui.js';
import { addDays } from '../lib/dates.js';
import { state, isPublished, datesOf } from '../store.js';

// A video counts as "on time" when it went live by its planned publish day (two days of slack).
function onTime(v) {
  if (!v.published_at) return true;
  return String(v.published_at).slice(0, 10) <= addDays(datesOf(v).publish, 2);
}

export function streaks() {
  const list = state.videos.slice().sort((a, b) => a.position - b.position);
  let best = 0, run = 0, current = 0, ended = false;
  for (const v of list) {
    if (isPublished(v) && onTime(v)) { run++; best = Math.max(best, run); } else {
      if (!ended && !isPublished(v)) { current = run; ended = true; } // the run up to the first unpublished video is the current one
      run = 0;
    }
  }
  if (!ended) current = run; // everything published: the run at the end of the plan
  return { current, best };
}

const BADGES = [
  { id: 'first', label: 'First video', hint: 'Publish your first video', ic: 'play', need: (s) => [s.done, 1] },
  { id: 'three', label: 'Three videos', hint: 'Publish 3 videos', ic: 'check', need: (s) => [s.done, 3] },
  { id: 'five', label: 'High five', hint: 'Publish 5 videos', ic: 'star', need: (s) => [s.done, 5] },
  { id: 'ten', label: 'Ten videos', hint: 'Publish 10 videos', ic: 'chart', need: (s) => [s.done, 10] },
  { id: 'streak4', label: 'One month on time', hint: '4 videos in a row on time', ic: 'flame', need: (s) => [s.best, 4] },
  { id: 'streak8', label: 'Two months on time', hint: '8 videos in a row on time', ic: 'flame', need: (s) => [s.best, 8] },
  { id: 'half', label: 'Halfway', hint: 'Publish half of the plan', ic: 'pipeline', need: (s) => [s.done, Math.ceil(s.total / 2)] },
  { id: 'all', label: 'Whole plan', hint: 'Publish every video', ic: 'book', need: (s) => [s.done, s.total] },
];

export function streakPanel() {
  const total = state.videos.length;
  if (!total) return null;
  const done = state.videos.filter(isPublished).length;
  const { current, best } = streaks();
  const s = { done, total, best };
  const rows = BADGES.map((b) => { const [have, want] = b.need(s); return { ...b, have: Math.min(have, want), want, got: want > 0 && have >= want }; });

  // Celebrate badges earned since the last visit (the first visit just records what you already have).
  let seen = null;
  try { seen = JSON.parse(localStorage.getItem('zx-badges') || 'null'); } catch (_) { seen = null; }
  const earned = rows.filter((r) => r.got).map((r) => r.id);
  const fresh = seen ? earned.filter((id) => !seen.includes(id)) : [];
  if (!seen || fresh.length) {
    try { localStorage.setItem('zx-badges', JSON.stringify(earned)); } catch (_) { /* fine */ }
  }
  if (fresh.length) {
    setTimeout(() => { confetti(); toast(`New badge: ${rows.find((r) => r.id === fresh[0]).label}`, 'success'); }, 700);
  }

  return h('section', { class: 'panel streak', 'aria-label': 'Streak and badges' },
    h('div', { class: 'streak-head' },
      h('div', { class: `flame${current ? ' lit' : ''}`, 'aria-hidden': 'true' }, icon('flame')),
      h('div', null,
        h('div', { class: 'streak-n' }, h('span', { 'data-count': current, 'data-key': 'streak' }, String(current)), h('small', null, current === 1 ? ' video in a row' : ' videos in a row')),
        h('p', { class: 'muted small' }, current ? `On time, every week. Your best run is ${best}.` : (done ? `Publish the next video on time to start a run. Your best is ${best}.` : 'Publish your first video to light the flame.')))),
    h('div', { class: 'badges' }, rows.map((r, i) => h('div', { class: `badge${r.got ? ' got' : ''}${fresh.includes(r.id) ? ' fresh' : ''}`, style: { '--i': String(i) }, title: r.got ? r.label : `${r.hint} (${r.have} of ${r.want})`, role: 'img', 'aria-label': `${r.label}: ${r.got ? 'earned' : `${r.have} of ${r.want}`}` },
      h('span', { class: 'bd' }, icon(r.got ? r.ic : 'lock')),
      h('span', { class: 'bl' }, r.label),
      r.got ? null : h('span', { class: 'bp' }, `${r.have}/${r.want}`)))));
}
