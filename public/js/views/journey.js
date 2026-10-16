import { h, s } from '../lib/dom.js';
import { reducedMotion } from '../lib/dom.js';
import { seriesColor } from '../lib/constants.js';
import { state, isPublished, nextUp, datesOf } from '../store.js';
import { nice } from '../lib/dates.js';

const PER_ROW = 10, W = 1000, PAD = 46, ROW_H = 74;

// The whole plan as one winding road. Published videos light up along it.
export function journeyPanel() {
  const vids = state.videos;
  const n = vids.length;
  if (!n) return null;
  const done = vids.filter(isPublished).length;
  const cur = nextUp();
  const curIdx = cur ? vids.findIndex((v) => v.id === cur.id) : n - 1;
  const rows = Math.ceil(n / PER_ROW);
  const H = PAD + (rows - 1) * ROW_H + PAD;
  const xs = (c, r) => (r % 2 === 0 ? PAD + c * ((W - 2 * PAD) / (PER_ROW - 1)) : W - PAD - c * ((W - 2 * PAD) / (PER_ROW - 1)));

  let d = '';
  for (let r = 0; r < rows; r++) {
    const y = PAD / 1 + r * ROW_H - (PAD - 28);
    const x0 = xs(0, r), x1 = xs(r === rows - 1 ? (n - 1) % PER_ROW : PER_ROW - 1, r);
    d += r === 0 ? `M${x0} ${y}` : '';
    d += ` L${x1} ${y}`;
    if (r < rows - 1) {
      const y2 = y + ROW_H, bulge = r % 2 === 0 ? 38 : -38;
      d += ` C${x1 + bulge} ${y} ${x1 + bulge} ${y2} ${x1} ${y2}`;
    }
  }
  const VH = H - (PAD - 28) + 0;

  const base = s('path', { d, class: 'j-base' });
  const prog = s('path', { d, class: 'j-prog' });
  const nodes = s('g', { class: 'j-nodes' });
  const svg = s('svg', { viewBox: `0 0 ${W} ${VH}`, role: 'img', 'aria-label': `${done} of ${n} videos published`, class: 'journey-svg' }, base, prog, nodes);
  const tip = h('div', { class: 'j-tip', hidden: true });
  const wrap = h('div', { class: 'journey-wrap' }, svg, tip);

  // Needs real geometry, so place the dots once the SVG is on the page.
  const place = () => {
    if (!svg.isConnected) return requestAnimationFrame(place);
    let L = 0;
    try { L = base.getTotalLength(); } catch (_) { return; }
    const pos = (i) => ({ x: xs(i % PER_ROW, Math.floor(i / PER_ROW)), y: 28 + Math.floor(i / PER_ROW) * ROW_H });
    // Length along the road at which node i sits: scan the path for the closest point.
    const lenAt = (i) => {
      const t = pos(i); let best = 0, bd = Infinity;
      for (let k = 0; k <= 600; k++) { const q = base.getPointAtLength((k / 600) * L); const dd = (q.x - t.x) ** 2 + (q.y - t.y) ** 2; if (dd < bd) { bd = dd; best = (k / 600) * L; } }
      return best;
    };
    const reach = done ? lenAt(Math.min(n - 1, Math.max(curIdx, done - 1))) : 0;
    prog.style.strokeDasharray = `${L}`;
    prog.style.setProperty('--len', `${L}`);
    prog.style.setProperty('--to', `${L - reach}`);
    prog.classList.add('go');
    vids.forEach((v, i) => {
      const p = pos(i);
      const pub = isPublished(v), isCur = cur && v.id === cur.id;
      const g = s('g', { class: `j-node${pub ? ' pub' : ''}${isCur ? ' cur' : ''}`, transform: `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`, tabindex: '0', role: 'link', 'aria-label': `Week ${v.position}: ${v.title}${pub ? ', published' : ''}` },
        isCur ? s('circle', { r: 15, class: 'j-pulse' }) : null,
        s('circle', { r: 9, class: 'j-dot', style: { '--sc': seriesColor(v.series), animationDelay: reducedMotion() ? '0ms' : `${Math.min(i * 22, 900)}ms` } }),
        pub ? s('path', { d: 'M-3.6 0.4 L-1 3 L3.8 -2.6', class: 'j-tick' }) : s('text', { class: 'j-num', y: 3 }, String(v.position)));
      const show = () => {
        tip.hidden = false;
        tip.innerHTML = '';
        tip.append(h('strong', null, `Week ${v.position}`), h('span', null, v.title), h('small', null, pub ? 'Published' : `Records ${nice(datesOf(v).record)}`));
        const box = wrap.getBoundingClientRect(), r = g.getBoundingClientRect();
        tip.style.left = `${Math.min(Math.max(r.left - box.left + r.width / 2, 90), box.width - 90)}px`;
        tip.style.top = `${r.top - box.top - 8}px`;
      };
      g.addEventListener('pointerenter', show);
      g.addEventListener('focus', show);
      g.addEventListener('pointerleave', () => { tip.hidden = true; });
      g.addEventListener('blur', () => { tip.hidden = true; });
      g.addEventListener('click', () => { location.hash = `#/video/${v.id}`; });
      g.addEventListener('keydown', (e) => { if (e.key === 'Enter') location.hash = `#/video/${v.id}`; });
      nodes.appendChild(g);
    });
  };
  requestAnimationFrame(place);

  const pct = Math.round((done / n) * 100);
  const R = 34, C = 2 * Math.PI * R;
  const ring = s('svg', { viewBox: '0 0 84 84', class: 'ring', 'aria-hidden': 'true' },
    s('circle', { cx: 42, cy: 42, r: R, class: 'ring-bg' }),
    s('circle', { cx: 42, cy: 42, r: R, class: 'ring-fg', style: { '--c': `${C}`, '--off': `${C * (1 - done / n)}` }, transform: 'rotate(-90 42 42)' }));

  return h('section', { class: 'panel journey', 'aria-label': 'The whole plan' },
    h('div', { class: 'journey-head' },
      h('div', { class: 'ring-box' }, ring, h('span', { class: 'ring-n' }, `${pct}%`)),
      h('div', null, h('h2', null, 'The road to video ' + n), h('p', { class: 'muted small' }, done === n ? 'Every video is published.' : `${done} published, ${n - done} to go. Hover a dot for the title, click it to open.`))),
    wrap);
}
