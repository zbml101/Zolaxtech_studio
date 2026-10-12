import { h } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { field, toast } from '../lib/ui.js';
import { seriesTag } from '../lib/ui.js';
import { seriesColor } from '../lib/constants.js';
import { addDays, sundayOf, niceLong, nice, weekday } from '../lib/dates.js';
import { state, DAY_KEYS, tasksFor, videoForWeek, weekProgress, dayProgress, saveSettings, addTodo, patchTodo, deleteTodo, datesOf } from '../store.js';
import { rundown, taskRow } from './shared.js';

// ---------------------------------------------------------------- focus timer (keeps running while you move between screens)
const timer = { total: 25 * 60, left: 25 * 60, running: false, id: null };
const baseTitle = document.title;
function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination); o.frequency.value = 880; g.gain.setValueAtTime(0.15, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.8); o.start(); o.stop(ctx.currentTime + 0.8);
  } catch (_) { /* sound is optional */ }
}
const mmss = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
function paintTimer() {
  document.querySelectorAll('[data-timer]').forEach((el) => { el.textContent = mmss(timer.left); });
  document.title = timer.running ? `${mmss(timer.left)} · Focus` : baseTitle;
}
function startTimer() {
  if (timer.running) return;
  timer.running = true;
  timer.id = setInterval(() => {
    timer.left -= 1;
    if (timer.left <= 0) { stopTimer(); timer.left = timer.total; beep(); toast('Focus session finished. Take a short break.', 'success'); }
    paintTimer();
  }, 1000);
  paintTimer();
}
function stopTimer() { timer.running = false; clearInterval(timer.id); paintTimer(); }

function timerPanel(rerender) {
  const set = (min) => { stopTimer(); timer.total = timer.left = min * 60; rerender(); };
  return h('section', { class: 'panel timer', 'aria-label': 'Focus timer' },
    h('div', { class: 'panel-h', style: { width: '100%' } }, h('h2', null, 'Focus timer')),
    h('div', { class: 'time', 'data-timer': '', role: 'timer' }, mmss(timer.left)),
    h('div', { class: 'row gap wrap' },
      h('button', { class: 'btn primary', onclick: () => { timer.running ? stopTimer() : startTimer(); rerender(); } }, icon(timer.running ? 'pause' : 'play'), timer.running ? 'Pause' : 'Start'),
      h('button', { class: 'btn ghost', onclick: () => { stopTimer(); timer.left = timer.total; rerender(); } }, 'Reset')),
    h('div', { class: 'chips' }, [25, 45, 90].map((m) => h('button', { class: `chip${timer.total === m * 60 ? ' on' : ''}`, onclick: () => set(m) }, `${m} min`))));
}

// ---------------------------------------------------------------- to-dos
function todosPanel() {
  const open = state.todos.filter((t) => !t.done);
  const done = state.todos.filter((t) => t.done).slice(0, 5);
  const form = h('form', { class: 'row gap', onsubmit: async (e) => {
    e.preventDefault();
    const input = e.target.elements.title;
    const title = input.value.trim();
    if (!title) return;
    input.value = '';
    try { await addTodo({ title }); } catch (err) { toast(err.message, 'error'); input.value = title; }
  } },
    h('input', { type: 'text', name: 'title', placeholder: 'Add a task, like “Buy a pop filter”', maxlength: 200, 'aria-label': 'New task' }),
    h('button', { class: 'btn', type: 'submit' }, icon('plus'), 'Add'));
  const row = (t) => h('div', { class: 'todo' },
    h('label', { class: 'check' },
      h('input', { type: 'checkbox', checked: t.done, onchange: (e) => patchTodo(t.id, { done: e.target.checked }) }),
      h('span', { class: 'box' }, icon('check')),
      h('span', { class: 't' }, h('span', { class: 'tt' }, t.title))),
    h('button', { class: 'icon-btn', 'aria-label': `Delete ${t.title}`, onclick: () => deleteTodo(t.id) }, icon('trash')));
  return h('section', { class: 'panel', 'aria-label': 'Other tasks' },
    h('div', { class: 'panel-h' }, h('h2', null, 'Other tasks')),
    form,
    h('div', { style: { marginTop: '8px' } }, open.length ? open.map(row) : h('p', { class: 'muted small', style: { padding: '8px 10px' } }, 'Nothing here. Tasks that are not part of the weekly routine go in this list.'),
      done.length ? h('div', { class: 'muted small', style: { padding: '10px 10px 2px' } }, 'Done recently') : null, done.map(row)));
}

// ---------------------------------------------------------------- the screen
let selected = null;

export function renderToday(param, rerender) {
  const date = param && /^\d{4}-\d{2}-\d{2}$/.test(param) ? param : selected || state.today;
  selected = date === state.today ? null : date;
  const week = sundayOf(date);
  const key = DAY_KEYS[weekday(date)];
  const info = state.templates.routine.days[key];
  const list = tasksFor(key);
  const minutes = list.reduce((a, t) => a + t.minutes, 0);
  const vid = videoForWeek(week);
  const wp = weekProgress(week);
  const method = state.settings.recording_method;

  return h('div', { class: 'stack-l' },
    h('div', { class: 'page-head' },
      h('div', null, h('h1', null, date === state.today ? 'Today' : info.label), h('p', null, `${niceLong(date)} · ${info.role}`)),
      h('div', { class: 'seg-ctl', role: 'group', 'aria-label': 'Recording method' },
        [['live', 'Live narration', 'mic'], ['voiceover', 'Voice-over', 'screen']].map(([v, label, ic]) =>
          h('button', { class: method === v ? 'on' : '', 'aria-pressed': method === v ? 'true' : 'false', onclick: () => saveSettings({ recording_method: v }) }, icon(ic), label)))),
    rundown({ weekOf: date }),
    h('div', { class: 'cols' },
      h('div', { class: 'stack-l' },
        h('section', { class: 'panel', 'aria-label': `${info.label} routine` },
          h('div', { class: 'panel-h' }, h('div', null, h('h2', null, `${info.label}: ${info.role}`), h('p', { class: 'muted small' }, info.blurb)),
            list.length ? h('span', { class: 'pill' }, `${minutes} min`) : null),
          vid && ['sun', 'mon', 'tue', 'thu'].includes(key) ? h('a', { class: 'row gap-s small', href: `#/video/${vid.id}`, style: { textDecoration: 'none', marginBottom: '10px' } },
            h('span', { class: 'muted' }, `Week ${vid.position}:`), h('strong', null, vid.title)) : null,
          list.length ? h('div', null, list.map((t) => taskRow(t, week)))
            : h('p', { class: 'muted' }, 'No routine tasks on this day.')),
        todosPanel()),
      h('div', { class: 'stack-l' },
        h('section', { class: 'panel', 'aria-label': 'Week progress' },
          h('div', { class: 'panel-h' }, h('h2', null, 'This week'), h('span', { class: 'muted small' }, `${wp.done} of ${wp.total} tasks`)),
          h('div', { class: 'bar' }, h('i', { style: { width: `${wp.total ? (wp.done / wp.total) * 100 : 0}%`, background: 'var(--fern)' } })),
          h('div', { class: 'stack', style: { marginTop: '14px' } }, DAY_KEYS.filter((k) => tasksFor(k).length).map((k, i) => {
            const d = dayProgress(week, k);
            const dd = addDays(week, DAY_KEYS.indexOf(k));
            return h('a', { class: 'row between small', href: `#/today/${dd}`, style: { textDecoration: 'none' } },
              h('span', null, `${state.templates.routine.days[k].label} · ${state.templates.routine.days[k].short}`),
              h('span', { class: d.done === d.total ? 'pill ok' : 'pill' }, `${d.done}/${d.total}`));
          }))),
        timerPanel(rerender))));
}
