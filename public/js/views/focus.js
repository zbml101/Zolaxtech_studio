import { h, s, reducedMotion } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { toast, confetti } from '../lib/ui.js';
import { sundayOf } from '../lib/dates.js';
import { state, tasksFor, isTicked, tick, dayKeyOf } from '../store.js';

const mmss = (n) => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination); o.frequency.value = 880; g.gain.setValueAtTime(0.15, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.8); o.start(); o.stop(ctx.currentTime + 0.8);
  } catch (_) { /* sound is optional */ }
}

// A full-screen run through today's tasks, one at a time, each with its own countdown.
export function openFocus() {
  if (document.querySelector('.focus-mode')) return;
  const week = sundayOf(state.today);
  const key = dayKeyOf(state.today);
  const queue = tasksFor(key).filter((t) => !isTicked(week, t.id));
  if (!queue.length) { toast('Nothing left on today\'s routine. Nice work.', 'success'); return; }

  let i = 0, left = 0, total = 0, running = false, id = 0, finished = false;
  const prev = document.activeElement;
  const R = 92, C = 2 * Math.PI * R;
  const ring = s('circle', { cx: 100, cy: 100, r: R, class: 'f-ring-fg', transform: 'rotate(-90 100 100)', style: { strokeDasharray: String(C) } });
  const time = h('div', { class: 'f-time', role: 'timer' });
  const step = h('div', { class: 'f-step' });
  const text = h('p', { class: 'f-text' });
  const meta = h('div', { class: 'f-meta' });
  const go = h('button', { class: 'btn primary lg', onclick: () => toggle() });
  const done = h('button', { class: 'btn lg', onclick: () => complete(true) }, icon('check'), 'Done, next');
  const skip = h('button', { class: 'btn ghost', onclick: () => complete(false) }, 'Skip');
  const body = h('div', { class: 'f-body' });
  const root = h('div', { class: 'focus-mode', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Focus mode' },
    h('button', { class: 'icon-btn f-x', 'aria-label': 'Leave focus mode', onclick: () => close() }, icon('x')),
    body);

  function paint() {
    time.textContent = mmss(Math.max(0, left));
    ring.style.strokeDashoffset = String(C * (1 - (total ? (total - left) / total : 0)));
    go.replaceChildren(icon(running ? 'pause' : 'play'), running ? 'Pause' : 'Start');
    document.title = running ? `${mmss(left)} · Focus` : document.title.replace(/^\d\d:\d\d · Focus$/, 'Studio');
  }
  function load() {
    const t = queue[i];
    total = left = t.minutes * 60; running = false; clearInterval(id);
    step.textContent = `Task ${i + 1} of ${queue.length}`;
    text.textContent = t.text;
    meta.replaceChildren(h('span', { class: 'pill' }, `${t.minutes} min`), t.tool ? h('span', { class: 'muted' }, t.tool) : null);
    body.replaceChildren(step, h('div', { class: 'f-dial' }, s('svg', { viewBox: '0 0 200 200', 'aria-hidden': 'true' }, s('circle', { cx: 100, cy: 100, r: R, class: 'f-ring-bg' }), ring), time), text, meta, h('div', { class: 'row gap wrap f-actions' }, go, done, skip));
    paint();
  }
  function toggle() {
    if (finished) return;
    if (running) { running = false; clearInterval(id); paint(); return; }
    running = true;
    id = setInterval(() => {
      left -= 1;
      if (left <= 0) { running = false; clearInterval(id); left = 0; beep(); toast('Time is up for this task. Mark it done or take a few more minutes.', 'success'); }
      paint();
    }, 1000);
    paint();
  }
  async function complete(markDone) {
    clearInterval(id); running = false;
    if (markDone) { try { await tick(week, queue[i].id, true); } catch (_) { /* the store already showed the error */ } }
    if (i < queue.length - 1) { i += 1; load(); return; }
    finished = true;
    confetti();
    body.replaceChildren(h('div', { class: 'f-finish' }, h('h2', null, 'That is today done.'), h('p', { class: 'muted' }, 'Close this screen, rest, and come back tomorrow.'), h('button', { class: 'btn primary lg', onclick: () => close() }, 'Finish')));
    document.title = document.title.replace(/^\d\d:\d\d · Focus$/, 'Studio');
  }
  function close() {
    clearInterval(id); document.removeEventListener('keydown', onKey, true); root.classList.add('out');
    setTimeout(() => root.remove(), reducedMotion() ? 0 : 200);
    if (prev && prev.focus) prev.focus();
    document.title = document.title.replace(/^\d\d:\d\d · Focus$/, 'Studio');
  }
  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === ' ' && !finished && e.target.tagName !== 'BUTTON') { e.preventDefault(); toggle(); }
  }
  document.addEventListener('keydown', onKey, true);
  document.body.appendChild(root);
  load();
  go.focus();
}
