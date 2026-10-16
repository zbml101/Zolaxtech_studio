import { h } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { seriesTag, emptyState } from '../lib/ui.js';
import { STAGES, stageIndex, seriesColor } from '../lib/constants.js';
import { plural, sum } from '../lib/format.js';
import { nice, niceLong, diffDays, nextTuesday, addDays, sundayOf, relative } from '../lib/dates.js';
import { state, datesOf, isOverdue, nextUp, isPublished, setStage, saveSettings, tasksFor, dayKeyOf, videoForWeek } from '../store.js';
import { rundown, taskRow, stageBar } from './shared.js';
import { openNewVideo } from './pipeline.js';
import { journeyPanel } from './journey.js';

const greeting = () => { const hr = new Date().getHours(); return hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening'; };

// Each milestone is "late" when its date has passed and the video has not reached the stage it needs.
const MILESTONES = [['script', 'Script', 1], ['record', 'Record', 2], ['edit', 'Edit', 4], ['publish', 'Publish', 6]];

export function milestones(video) {
  const d = datesOf(video);
  const idx = stageIndex(video.stage);
  return h('div', { class: 'milestones' }, MILESTONES.map(([k, label, need]) => {
    const done = idx >= need;
    const cls = done ? '' : d[k] < state.today ? 'late' : d[k] === state.today ? 'now' : '';
    return h('div', { class: cls }, h('div', { class: 'k' }, done ? `${label} · done` : label), h('div', { class: 'v' }, nice(d[k])));
  }));
}

function shiftBanner(v) {
  const rec = datesOf(v).record;
  const target = nextTuesday(state.today);
  const k = Math.max(0, Math.ceil(diffDays(target, rec) / 7));
  const pub = datesOf(v).publish;
  return h('div', { class: 'alert', role: 'status' },
    h('div', { class: 'row gap' }, icon('alert'),
      h('div', null, h('strong', null, `Week ${v.position} is behind.`), h('div', { class: 'muted small' },
        `It was due ${nice(pub)}. ${k ? `Shifting the plan by ${plural(k, 'week')} puts its recording day on ${nice(addDays(rec, k * 7))} and moves every later video too.` : ''}`))),
    k ? h('button', { class: 'btn', onclick: () => saveSettings({ first_record_day: addDays(state.settings.first_record_day, k * 7) }) }, `Shift plan by ${plural(k, 'week')}`) : null);
}

function nextUpPanel(v) {
  if (!v) {
    return h('div', { class: 'panel' }, emptyState('Every video is published', 'Add the next one to keep the weekly habit going.',
      h('button', { class: 'btn primary', onclick: () => openNewVideo() }, icon('plus'), 'Add a video')));
  }
  const idx = stageIndex(v.stage);
  const next = STAGES[idx + 1];
  return h('section', { class: 'panel nextup', 'data-tilt': '', 'aria-label': 'Next video' },
    h('div', { class: 'row between wrap gap' },
      h('span', { class: 'wk' }, `Up next · week ${v.position} of ${state.videos.length}`),
      seriesTag(v.series, seriesColor(v.series))),
    h('div', null, h('h2', null, v.title), v.title_am ? h('p', { class: 'am muted', lang: 'am' }, v.title_am) : null),
    v.key_points ? h('p', { class: 'muted small' }, v.key_points) : null,
    milestones(v),
    stageBar(v),
    h('div', { class: 'row gap wrap' },
      h('a', { class: 'btn primary', href: `#/video/${v.id}` }, 'Open video'),
      h('a', { class: 'btn', href: `#/video/${v.id}/script` }, 'Write script'),
      next ? h('button', { class: 'btn ghost', onclick: () => setStage(v.id, next.id) }, icon('check'), `Mark ${next.label.toLowerCase()}`) : null));
}

function todayPanel() {
  const key = dayKeyOf(state.today);
  const info = state.templates.routine.days[key];
  const week = sundayOf(state.today);
  const list = tasksFor(key);
  return h('section', { class: 'panel', 'aria-label': 'Today' },
    h('div', { class: 'panel-h' }, h('h2', null, `Today · ${info.role}`), h('a', { class: 'btn ghost sm', href: '#/today' }, 'Open')),
    list.length ? h('div', null, list.map((t) => taskRow(t, week)))
      : h('p', { class: 'muted' }, key === 'wed' ? 'No channel work today. Rest keeps the habit going.' : 'Nothing scheduled today.'));
}

function seriesPanel() {
  const groups = new Map();
  for (const v of state.videos) {
    const g = groups.get(v.series) || { total: 0, done: 0 };
    g.total++; if (isPublished(v)) g.done++;
    groups.set(v.series, g);
  }
  return h('section', { class: 'panel', 'aria-label': 'Progress by series' },
    h('div', { class: 'panel-h' }, h('h2', null, 'Series progress')),
    h('div', { class: 'stack' }, [...groups].map(([name, g]) =>
      h('div', { class: 'series-row' }, seriesTag(name, seriesColor(name)),
        h('div', { class: 'bar', role: 'img', 'aria-label': `${g.done} of ${g.total} published` }, h('i', { style: { width: `${(g.done / g.total) * 100}%`, background: seriesColor(name) } })),
        h('span', { class: 'muted' }, `${g.done}/${g.total}`)))));
}

function upcomingPanel(skipId) {
  const list = state.videos.filter((v) => !isPublished(v) && v.id !== skipId).slice(0, 5);
  if (!list.length) return null;
  return h('section', { class: 'panel', 'aria-label': 'Coming up' },
    h('div', { class: 'panel-h' }, h('h2', null, 'Coming up'), h('a', { class: 'btn ghost sm', href: '#/pipeline' }, 'Pipeline')),
    h('div', { class: 'upcoming' }, list.map((v) => h('button', { onclick: () => { location.hash = `#/video/${v.id}`; } },
      h('span', { class: 'n' }, v.position), h('span', { class: 'tt' }, v.title), h('span', { class: 'muted small' }, `Records ${nice(datesOf(v).record)}`)))));
}

export function renderDashboard() {
  const v = nextUp();
  const published = state.videos.filter(isPublished);
  const behind = state.videos.filter(isOverdue).length;
  const withViews = published.filter((x) => x.views_7d != null);
  const avg = withViews.length ? Math.round(sum(withViews.map((x) => x.views_7d)) / withViews.length) : null;
  const last = state.videos[state.videos.length - 1];
  const left = state.videos.length - published.length;

  return h('div', { class: 'stack-l' },
    h('div', { class: 'page-head' },
      h('div', null, h('h1', null, `${greeting()}.`), h('p', null, `${niceLong(state.today)} · ${state.settings.channel_name}`)),
      h('div', { class: 'row gap' }, h('button', { class: 'btn', onclick: () => openNewVideo() }, icon('plus'), 'New video'), h('a', { class: 'btn primary', href: '#/today' }, 'Open today'))),
    rundown({ large: true }),
    v && isOverdue(v) ? shiftBanner(v) : null,
    h('dl', { class: 'ledger' },
      h('div', null, h('dt', null, 'Published'), h('dd', null, h('span', { 'data-count': published.length, 'data-key': 'pub' }, published.length), h('small', null, ` of ${state.videos.length}`))),
      h('div', null, h('dt', null, 'Videos left'), h('dd', null, h('span', { 'data-count': left, 'data-key': 'left' }, left))),
      h('div', { class: behind ? 'late' : '' }, h('dt', null, 'Behind schedule'), h('dd', null, h('span', { 'data-count': behind, 'data-key': 'behind' }, behind))),
      h('div', null, h('dt', null, 'Average views, first 7 days'), h('dd', null, avg == null ? '–' : h('span', { 'data-count': avg, 'data-key': 'avg' }, avg.toLocaleString()))),
      h('div', null, h('dt', null, 'Plan ends'), h('dd', null, last ? nice(datesOf(last).publish) : '–'))),
    journeyPanel(),
    h('div', { class: 'cols' },
      h('div', { class: 'stack-l' }, nextUpPanel(v), upcomingPanel(v && v.id)),
      h('div', { class: 'stack-l' }, todayPanel(), seriesPanel())));
}
