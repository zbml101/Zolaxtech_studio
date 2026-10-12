// Talks to the Render server. Every request carries the Supabase sign-in token.
let tokenProvider = async () => null;
let onSignedOut = () => {};

export const setTokenProvider = (fn) => { tokenProvider = fn; };
export const setSignedOutHandler = (fn) => { onSignedOut = fn; };

export class ApiError extends Error {
  constructor(message, status, detail) { super(message); this.status = status; this.detail = detail; }
}

async function request(method, path, body, raw) {
  const token = await tokenProvider();
  let res;
  try {
    res = await fetch('/api' + path, {
      method,
      headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (_) {
    throw new ApiError('Cannot reach the server. Check your internet connection and try again.', 0);
  }
  if (res.status === 401) {
    onSignedOut();
    throw new ApiError('Your session has ended. Sign in again.', 401);
  }
  if (raw && res.ok) return res;
  let data = null;
  try { data = await res.json(); } catch (_) { /* no body */ }
  if (!res.ok) throw new ApiError((data && data.error) || 'Something went wrong. Try again in a moment.', res.status, data && data.detail);
  return data;
}

export const api = {
  get: (p) => request('GET', p),
  post: (p, b) => request('POST', p, b === undefined ? {} : b),
  patch: (p, b) => request('PATCH', p, b),
  put: (p, b) => request('PUT', p, b),
  del: (p) => request('DELETE', p),
};

export async function download(path, filename) {
  const res = await request('GET', path, undefined, true);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function publicGet(path) {
  const res = await fetch('/api' + path);
  if (!res.ok) throw new ApiError('Could not load the app settings.', res.status);
  return res.json();
}
