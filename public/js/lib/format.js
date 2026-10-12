export const words = (t) => (t.trim() ? t.trim().split(/\s+/).length : 0);
// Amharic is written with spaces between words, so the same count works. Speaking pace ~130 words a minute for a tutorial.
export const speakMinutes = (w) => w / 130;
export const plural = (n, one, many) => `${n} ${n === 1 ? one : many || one + 's'}`;
export const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
export const sum = (a) => a.reduce((x, y) => x + y, 0);
export const initial = (t) => (t || '?').trim().charAt(0).toUpperCase();
