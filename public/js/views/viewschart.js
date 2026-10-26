import { h, s } from '../lib/dom.js';
import { emptyState } from '../lib/ui.js';
import { sum } from '../lib/format.js';
import { isPublished } from '../store.js';

let mode = 'chart'; // 'chart' or 'table', remembered while the app is open
const compact = (n) => (n >= 1000 ? `${+(n / 1000).toFixed(n % 1000 === 0 || n >= 10000 ? 0 : 1)}K` : String(n));

// Smallest "round" maximum (1, 2, 5 times a power of ten) that fits the biggest value.
function niceMax(v) {
  const p = Math.pow(10, Math.floor(Math.log10(Math.max(v, 1))));
  return ([1, 2, 5, 10].find((m) => m * p >= v) || 10) * p;
}

// A column has a 4px rounded top and a square foot that sits on the baseline.
function columnPath(x, y, w, hgt) {
  const r = Math.min(4, w / 2, hgt);
  return `M${x} ${y + hgt}V${y + r}a${r} ${r} 0 0 1 ${r} ${-r}h${w - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}V${y + hgt}z`;
}

export function viewsChart(videos, rerender) {
  const data = videos.filter((v) => isPublished(v) && v.views_7d != null).sort((a, b) => a.position - b.position);
  if (!data.length) return emptyState('No results yet', 'Open a published video, go to Results and add its views after 7 days.');
  const avg = Math.round(sum(data.map((v) => v.views_7d)) / data.length);
  const vs = (n) => (avg ? Math.round(((n - avg) / avg) * 100) : 0);

  const toggle = h('div', { class: 'seg-ctl sm', role: 'group', 'aria-label': 'View as' },
    [['chart', 'Chart'], ['table', 'Table']].map(([k, label]) => h('button', { class: mode === k ? 'on' : '', 'aria-pressed': mode === k ? 'true' : 'false', onclick: () => { mode = k; rerender(); } }, label)));
  const summary = h('p', { class: 'muted small' }, `${data.length} ${data.length === 1 ? 'video' : 'videos'}, ${avg.toLocaleString()} views on average in the first 7 days.`);
  const head = h('div', { class: 'row between wrap gap' }, summary, toggle);

  if (mode === 'table') {
    return h('div', { class: 'stack' }, head, h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
      h('thead', null, h('tr', null, ['Week', 'Video', 'Views', 'Compared with average'].map((t) => h('th', null, t)))),
      h('tbody', null, data.map((v) => h('tr', null, h('td', null, v.position), h('td', null, v.title), h('td', null, v.views_7d.toLocaleString()), h('td', { class: 'muted' }, `${vs(v.views_7d) >= 0 ? '+' : ''}${vs(v.views_7d)}%`)))))));
  }

  const W = 720, H = 260, L = 46, R = 14, T = 18, B = 30;
  const top = niceMax(Math.max(...data.map((v) => v.views_7d)));
  const slot = (W - L - R) / data.length;
  const bw = Math.min(24, slot - 8);
  const y = (n) => T + (H - T - B) * (1 - n / top);
  const x = (i) => L + slot * i + (slot - bw) / 2;
  const ticks = [0, top / 2, top];
  const maxI = data.reduce((m, v, i) => (v.views_7d > data[m].views_7d ? i : m), 0);
  const labelAt = new Set([maxI, data.length - 1]);
  const every = data.length > 24 ? 3 : data.length > 12 ? 2 : 1;

  const tip = h('div', { class: 'vc-tip', hidden: true, role: 'status' });
  const wrap = h('div', { class: 'vc-wrap' });
  const show = (i) => {
    const v = data[i], d = vs(v.views_7d);
    tip.replaceChildren(h('strong', null, `${v.views_7d.toLocaleString()} views`), h('span', null, `Week ${v.position}: ${v.title}`), h('small', null, avg ? `${d >= 0 ? '+' : ''}${d}% compared with average` : ''));
    tip.hidden = false;
    const box = wrap.getBoundingClientRect();
    const px = ((x(i) + bw / 2) / W) * box.width, py = (y(v.views_7d) / H) * box.height;
    tip.style.left = `${Math.min(Math.max(px, 110), box.width - 110)}px`;
    tip.style.top = `${Math.max(py - 6, 8)}px`;
  };
  const hide = () => { tip.hidden = true; };

  const svg = s('svg', { class: 'chart vc', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `Views in the first 7 days for ${data.length} videos. Average ${avg}.` },
    ticks.map((t) => [s('line', { class: 'vc-grid', x1: L, x2: W - R, y1: y(t), y2: y(t) }), s('text', { class: 'vc-tick', x: L - 8, y: y(t) + 4, 'text-anchor': 'end' }, compact(Math.round(t)))]),
    s('line', { class: 'vc-avg', x1: L, x2: W - R, y1: y(avg), y2: y(avg) }),
    s('text', { class: 'vc-avgt', x: L + 4, y: y(avg) - 5, 'text-anchor': 'start' }, `Average ${avg.toLocaleString()}`),
    data.map((v, i) => {
      const hgt = Math.max(3, y(0) - y(v.views_7d));
      return s('g', { class: 'vc-col', tabindex: '0', role: 'img', 'aria-label': `Week ${v.position}: ${v.views_7d.toLocaleString()} views`, onpointerenter: () => show(i), onfocus: () => show(i), onpointerleave: hide, onblur: hide },
        s('rect', { class: 'vc-hit', x: L + slot * i, y: T, width: slot, height: H - T - B }),
        s('path', { class: 'vc-bar', d: columnPath(x(i), y(0) - hgt, bw, hgt), style: `animation-delay:${Math.min(i * 40, 600)}ms` }),
        labelAt.has(i) ? s('text', { class: 'vc-val', x: x(i) + bw / 2, y: y(v.views_7d) - 6, 'text-anchor': 'middle' }, v.views_7d.toLocaleString()) : null,
        i % every === 0 ? s('text', { class: 'vc-tick', x: x(i) + bw / 2, y: H - 10, 'text-anchor': 'middle' }, `W${v.position}`) : null);
    }));
  wrap.append(svg, tip);
  return h('div', { class: 'stack' }, head, wrap);
}
