// Small, optional motion effects. Everything here is skipped for people who prefer reduced motion.
import { reducedMotion } from './dom.js';

// Ripple that spreads from the pointer on buttons.
document.addEventListener('pointerdown', (e) => {
  if (reducedMotion()) return;
  const b = e.target.closest && e.target.closest('.btn, .icon-btn');
  if (!b || b.disabled) return;
  const r = b.getBoundingClientRect(), size = Math.max(r.width, r.height) * 2;
  const dot = document.createElement('span');
  dot.className = 'ripple';
  dot.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - r.left - size / 2}px;top:${e.clientY - r.top - size / 2}px`;
  b.appendChild(dot);
  dot.addEventListener('animationend', () => dot.remove());
}, { passive: true });

// Cards lean toward the pointer.
let raf = 0;
document.addEventListener('pointermove', (e) => {
  if (reducedMotion() || e.pointerType === 'touch' || raf) return;
  raf = requestAnimationFrame(() => {
    raf = 0;
    const el = e.target.closest && e.target.closest('[data-tilt]');
    document.querySelectorAll('[data-tilt].tilting').forEach((n) => { if (n !== el) { n.classList.remove('tilting'); n.style.transform = ''; } });
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
    el.classList.add('tilting');
    el.style.transform = `perspective(900px) rotateX(${(-y * 4).toFixed(2)}deg) rotateY(${(x * 5).toFixed(2)}deg) translateZ(0)`;
  });
}, { passive: true });
document.addEventListener('pointerleave', () => document.querySelectorAll('[data-tilt].tilting').forEach((n) => { n.classList.remove('tilting'); n.style.transform = ''; }), true);

// A small burst of sparks when a task is ticked.
document.addEventListener('click', (e) => {
  if (reducedMotion()) return;
  if (e.target.tagName === 'INPUT') return; // the label forwards a second click to its checkbox
  const c = e.target.closest && e.target.closest('.check');
  if (!c) return;
  const r = (c.querySelector('.box') || c).getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  for (let i = 0; i < 8; i++) {
    const p = document.createElement('i');
    const a = (Math.PI * 2 * i) / 8, d = 16 + Math.random() * 10;
    p.className = 'spark';
    p.style.cssText = `left:${cx}px;top:${cy}px;--dx:${Math.cos(a) * d}px;--dy:${Math.sin(a) * d}px`;
    document.body.appendChild(p);
    p.addEventListener('animationend', () => p.remove());
  }
});
