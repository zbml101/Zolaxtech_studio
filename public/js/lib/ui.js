import { h, reducedMotion } from './dom.js';
import { icon } from './icons.js';

// ---------------------------------------------------------------- toasts
export function toast(message, kind = 'info', action) {
  const host = document.getElementById('toasts');
  const el = h('div', { class: `toast ${kind}`, role: kind === 'error' ? 'alert' : 'status' },
    h('span', null, message),
    action ? h('button', { class: 'toast-act', onclick: () => { action.run(); el.remove(); } }, action.label) : null);
  host.appendChild(el);
  const ms = kind === 'error' ? 7000 : 3600;
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 250); }, ms);
}

// ---------------------------------------------------------------- confirm dialog
export function confirmDialog({ title, body, confirm = 'Delete', danger = true }) {
  return new Promise((resolve) => {
    const prev = document.activeElement;
    const close = (v) => { scrim.remove(); document.removeEventListener('keydown', onKey, true); if (prev && prev.focus) prev.focus(); resolve(v); };
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(false); } };
    const yes = h('button', { class: `btn ${danger ? 'danger' : 'primary'}`, onclick: () => close(true) }, confirm);
    const scrim = h('div', { class: 'scrim center', onclick: (e) => { if (e.target === scrim) close(false); } },
      h('div', { class: 'dialog', role: 'alertdialog', 'aria-modal': 'true', 'aria-label': title },
        h('h3', null, title), body ? h('p', { class: 'muted' }, body) : null,
        h('div', { class: 'row end gap' }, h('button', { class: 'btn ghost', onclick: () => close(false) }, 'Cancel'), yes)));
    document.body.appendChild(scrim);
    document.addEventListener('keydown', onKey, true);
    yes.focus();
  });
}

// ---------------------------------------------------------------- generic modal with a form
export function modal({ title, content, onClose }) {
  const prev = document.activeElement;
  const close = () => { scrim.remove(); document.removeEventListener('keydown', onKey, true); if (prev && prev.focus) prev.focus(); if (onClose) onClose(); };
  const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  const scrim = h('div', { class: 'scrim center', onclick: (e) => { if (e.target === scrim) close(); } },
    h('div', { class: 'dialog wide', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      h('div', { class: 'row between' }, h('h3', null, title), h('button', { class: 'icon-btn', 'aria-label': 'Close', onclick: close }, icon('x'))),
      content(close)));
  document.body.appendChild(scrim);
  document.addEventListener('keydown', onKey, true);
  const first = scrim.querySelector('input,textarea,select');
  if (first) first.focus();
  return close;
}

// ---------------------------------------------------------------- confetti (skipped for people who prefer reduced motion)
export function confetti() {
  if (reducedMotion()) return;
  const canvas = h('canvas', { class: 'confetti', 'aria-hidden': 'true' });
  const W = (canvas.width = innerWidth), H = (canvas.height = innerHeight);
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  const colors = ['#F4C430', '#34C27A', '#FF6B5B', '#8B7BFF', '#3FB6C9', '#E8EEF3'];
  const bits = Array.from({ length: 110 }, () => ({
    x: W / 2 + (Math.random() - 0.5) * 120, y: H * 0.35,
    vx: (Math.random() - 0.5) * 14, vy: -Math.random() * 12 - 4,
    w: 5 + Math.random() * 6, hgt: 3 + Math.random() * 5,
    r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, c: colors[(Math.random() * colors.length) | 0],
  }));
  let frames = 0;
  (function tick() {
    ctx.clearRect(0, 0, W, H);
    for (const b of bits) {
      b.vy += 0.38; b.x += b.vx; b.y += b.vy; b.r += b.vr; b.vx *= 0.99;
      ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.r); ctx.fillStyle = b.c; ctx.fillRect(-b.w / 2, -b.hgt / 2, b.w, b.hgt); ctx.restore();
    }
    if (++frames < 110) requestAnimationFrame(tick); else canvas.remove();
  })();
}

// ---------------------------------------------------------------- shared small pieces
export function seriesTag(series, color) {
  return h('span', { class: 'tag' }, h('i', { class: 'dot', style: { background: color } }), series);
}

export function emptyState(title, text, action) {
  return h('div', { class: 'empty' }, h('strong', null, title), text ? h('p', { class: 'muted' }, text) : null, action || null);
}

export function field(label, control, hint) {
  return h('label', { class: 'field' }, h('span', { class: 'lab' }, label), control, hint ? h('span', { class: 'hint' }, hint) : null);
}

export function errorText(e) { return e && e.message ? e.message : 'Something went wrong. Try again.'; }
