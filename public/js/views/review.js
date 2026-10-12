import { h, s, debounce } from '../lib/dom.js';
import { field, toast, errorText, emptyState } from '../lib/ui.js';
import { seriesColor } from '../lib/constants.js';
import { sum } from '../lib/format.js';
import { state, saveReview, isPublished } from '../store.js';
import { nice } from '../lib/dates.js';
import { datesOf } from '../store.js';

function viewsChart(videos) {
  const data = videos.filter((v) => isPublished(v) && v.views_7d != null);
  if (!data.length) return emptyState('No results yet', 'Open a published video, go to Results and add its views after 7 days.');
  const W = 720, H = 240, L = 44, B = 28, T = 12;
  const max = Math.max(10, ...data.map((v) => v.views_7d));
  const nice10 = Math.pow(10, Math.floor(Math.log10(max)));
  const top = Math.ceil(max / nice10) * nice10;
  const bw = Math.min(46, (W - L) / data.length - 10);
  const x = (i) => L + ((W - L) / data.length) * i + ((W - L) / data.length - bw) / 2;
  const y = (n) => T + (H - T - B) * (1 - n / top);
  const ticks = [0, 0.5, 1].map((f) => Math.round(top * f));
  return s('svg', { class: 'chart', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `Views in the first 7 days for ${data.length} videos` },
    ticks.map((t) => [s('line', { class: 'grid', x1: L, x2: W, y1: y(t), y2: y(t) }), s('text', { x: L - 8, y: y(t) + 4, 'text-anchor': 'end' }, t.toLocaleString())]),
    data.map((v, i) => [
      s('rect', { class: 'barv', x: x(i), y: y(v.views_7d), width: bw, height: Math.max(2, y(0) - y(v.views_7d)), rx: 4, style: `fill:${seriesColor(v.series)}` }, s('title', null, `Week ${v.position}: ${v.title}, ${v.views_7d.toLocaleString()} views`)),
      s('text', { x: x(i) + bw / 2, y: H - 8, 'text-anchor': 'middle' }, `W${v.position}`),
      bw > 26 ? s('text', { x: x(i) + bw / 2, y: y(v.views_7d) - 5, 'text-anchor': 'middle' }, v.views_7d.toLocaleString()) : null]));
}

function blockPanel(block, videos) {
  const slice = videos.slice((block - 1) * 4, block * 4);
  if (!slice.length) return null;
  const pub = slice.filter(isPublished);
  const withViews = pub.filter((v) => v.views_7d != null);
  const avg = withViews.length ? Math.round(sum(withViews.map((v) => v.views_7d)) / withViews.length) : null;
  const saved = state.reviews[block] || { worked: '', change_next: '' };
  const status = h('span', { class: 'muted small', role: 'status' });
  const draft = { worked: saved.worked, change_next: saved.change_next };
  const save = debounce(async () => {
    status.textContent = 'Saving…';
    try { await saveReview(block, draft); status.textContent = 'Saved'; } catch (e) { status.textContent = errorText(e); }
  }, 1000);
  const ta = (key, label, ph) => field(label, h('textarea', { rows: 3, maxlength: 5000, placeholder: ph, oninput: (e) => { draft[key] = e.target.value; status.textContent = 'Unsaved changes…'; save(); } }, draft[key]));
  return h('section', { class: 'panel stack' },
    h('div', { class: 'panel-h', style: { marginBottom: 0 } }, h('div', null, h('h2', null, `Weeks ${slice[0].position} to ${slice[slice.length - 1].position}`), h('p', { class: 'muted small' }, `${nice(datesOf(slice[0]).publish)} to ${nice(datesOf(slice[slice.length - 1]).publish)}`)), status),
    h('div', { class: 'row gap-l wrap small' }, h('span', null, `${pub.length} of ${slice.length} published`), h('span', null, avg == null ? 'No view counts yet' : `${avg.toLocaleString()} views on average`)),
    ta('worked', 'What worked', 'Which videos did people finish? What was easy to make?'),
    ta('change_next', 'What I will change next', 'One or two specific changes for the next four weeks'));
}

export function renderReview() {
  const blocks = Math.ceil(state.videos.length / 4);
  const pubCount = state.videos.filter(isPublished).length;
  const current = Math.min(blocks, Math.floor(pubCount / 4) + 1);
  const panels = [];
  for (let b = 1; b <= blocks; b++) if (b <= current + 0) panels.push(b);
  panels.reverse();
  return h('div', { class: 'stack-l' },
    h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'Review'), h('p', null, 'Look back every four videos: keep what works, change one thing.'))),
    h('section', { class: 'panel' }, h('div', { class: 'panel-h' }, h('h2', null, 'Views in the first 7 days')), viewsChart(state.videos)),
    panels.map((b) => blockPanel(b, state.videos)));
}
