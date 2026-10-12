// Tiny helpers for building the page. Text is always added as text, never as HTML, so nothing a user types can inject markup.
const SVG_NS = 'http://www.w3.org/2000/svg';

function append(el, kids) {
  for (const k of kids) {
    if (k == null || k === false || k === true) continue;
    if (Array.isArray(k)) append(el, k);
    else if (k instanceof Node) el.appendChild(k);
    else el.appendChild(document.createTextNode(String(k)));
  }
}

function setProps(el, props, isSvg) {
  if (!props) return;
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.setAttribute('class', v);
    else if (k === 'style' && typeof v === 'object') { for (const [name, val] of Object.entries(v)) { if (name.startsWith('--')) el.style.setProperty(name, val); else el.style[name] = val; } }
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (!isSvg && (k === 'value' || k === 'checked' || k === 'disabled' || k === 'selected' || k === 'textContent')) el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
}

export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  setProps(el, props, false);
  append(el, kids);
  return el;
}

export function s(tag, props, ...kids) {
  const el = document.createElementNS(SVG_NS, tag);
  setProps(el, props, true);
  append(el, kids);
  return el;
}

export function mount(parent, ...kids) {
  parent.replaceChildren();
  append(parent, kids);
  return parent;
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function debounce(fn, ms) {
  let t;
  const wrapped = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  wrapped.flush = (...a) => { clearTimeout(t); fn(...a); };
  wrapped.cancel = () => clearTimeout(t);
  return wrapped;
}

export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function lsGet(key, fallback) {
  try { const v = localStorage.getItem(key); return v === null ? fallback : v; } catch (_) { return fallback; }
}
export function lsSet(key, value) {
  try { localStorage.setItem(key, value); } catch (_) { /* storage can be blocked; the app still works */ }
}
