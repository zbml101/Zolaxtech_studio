// Sign-in with Supabase (email and password). The Supabase URL and public key come from the server.
import { publicGet } from './api.js';

let client = null;
let session = null;
let recovering = false;
const listeners = new Set();

export const getSession = () => session;
export const isRecovering = () => recovering;
export const onAuth = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const notify = (event) => listeners.forEach((fn) => fn(event, session));

export async function initAuth() {
  const cfg = await publicGet('/config');
  if (!window.supabase) throw new Error('The sign-in library did not load.');
  client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  const { data } = await client.auth.getSession();
  session = data.session;
  recovering = /type=recovery/.test(location.hash) || /type=recovery/.test(location.search);
  client.auth.onAuthStateChange((event, next) => {
    session = next;
    if (event === 'PASSWORD_RECOVERY') recovering = true;
    if (event === 'SIGNED_OUT') recovering = false;
    // TOKEN_REFRESHED and INITIAL_SESSION only update the token; the app does not need to redraw.
    if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'PASSWORD_RECOVERY') notify(event);
  });
}

export async function accessToken() {
  if (!client) return null;
  const { data } = await client.auth.getSession();
  session = data.session;
  return session ? session.access_token : null;
}

const friendly = (error) => {
  const m = (error && error.message) || 'Something went wrong.';
  if (/invalid login/i.test(m)) return 'The email or password is not right.';
  if (/email not confirmed/i.test(m)) return 'Confirm your email first: open the link we sent you, then sign in.';
  if (/already registered|already been registered/i.test(m)) return 'That email already has an account. Sign in instead.';
  if (/password/i.test(m) && /(6|characters|short|weak)/i.test(m)) return 'Use a password with at least 8 characters.';
  if (/rate limit|too many/i.test(m)) return 'Too many attempts. Wait a minute and try again.';
  if (/fetch|network/i.test(m)) return 'Cannot reach Supabase. Check your internet connection.';
  return m;
};

export async function signIn(email, password) {
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(friendly(error));
}

// Returns true when a session started right away, false when Supabase wants the email confirmed first.
export async function signUp(email, password) {
  const { data, error } = await client.auth.signUp({ email, password, options: { emailRedirectTo: location.origin } });
  if (error) throw new Error(friendly(error));
  return Boolean(data.session);
}

export async function sendReset(email) {
  const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: location.origin });
  if (error) throw new Error(friendly(error));
}

export async function setNewPassword(password) {
  const { error } = await client.auth.updateUser({ password });
  if (error) throw new Error(friendly(error));
  recovering = false;
  history.replaceState(null, '', location.pathname + '#/');
}

export async function signOut() {
  await client.auth.signOut();
}
