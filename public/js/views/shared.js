// Pieces used by more than one screen.
import { h } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { STAGES, stageIndex } from '../lib/constants.js';
import { state, DAY_KEYS, dayProgress, isTicked, tick } from '../store.js';
import { addDays, sundayOf, nice } from '../lib/dates.js';

export function rundown({ large = false, weekOf } = {}) {
  const weekStart = sundayOf(weekOf || state.today);
  const days = state.templates.routine.days;
  return h('nav', { class: `rundown${large ? ' large' : ''}`, 'aria-label': 'This week' },
    DAY_KEYS.map((key, i) => {
      const date = addDays(weekStart, i);
      const info = days[key];
      const p = dayProgress(weekStart, key);
      const cls = ['day', date === state.today ? 'today' : '', date < state.today ? 'past' : '', key === 'wed' ? 'off' : ''].join(' ');
      return h('a', { class: cls, href: `#/today/${date}`, 'aria-label': `${info.label}: ${info.role}`, 'aria-current': date === state.today ? 'date' : null },
        h('span', { class: 'dow' }, large ? info.label : info.label.slice(0, 3)),
        h('span', { class: 'role' }, info.role),
        large ? h('span', { class: 'blurb' }, info.blurb) : null,
        p.total ? h('span', { class: 'prog', 'aria-hidden': 'true' }, h('i', { style: { width: `${(p.done / p.total) * 100}%` } })) : null);
    }));
}

export function taskRow(task, weekStart, { showDay = false } = {}) {
  const on = isTicked(weekStart, task.id);
  const tools = task.tool ? h('span', null, task.tool) : null;
  return h('label', { class: 'check' },
    h('input', { type: 'checkbox', checked: on, onchange: (e) => tick(weekStart, task.id, e.target.checked) }),
    h('span', { class: 'box' }, icon('check')),
    h('span', { class: 't' }, h('span', { class: 'tt' }, task.text),
      h('span', { class: 'meta' }, h('span', null, `${task.minutes} min`), tools,
        task.applies !== 'both' ? h('span', null, task.applies === 'live' ? 'Live narration' : 'Voice-over') : null)));
}

export function stageBar(video, { onPick, labels = true } = {}) {
  const idx = stageIndex(video.stage);
  return h('div', null,
    h('div', { class: 'stagebar', role: onPick ? 'group' : 'img', 'aria-label': `Stage: ${STAGES[idx].label}` },
      STAGES.map((s, i) => {
        const cls = i < idx ? 'done' : i === idx ? 'on' : '';
        return onPick
          ? h('button', { class: cls, title: s.label, 'aria-label': `Set stage to ${s.label}`, 'aria-pressed': i === idx ? 'true' : 'false', onclick: () => onPick(s.id) })
          : h('span', { class: cls });
      })),
    labels ? h('div', { class: 'stagelabels', 'aria-hidden': 'true' }, STAGES.map((s, i) => h('span', { class: i === idx ? 'on' : '' }, s.label))) : null);
}

export { nice };
