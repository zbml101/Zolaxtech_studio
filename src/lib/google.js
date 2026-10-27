// Talks to Google (sign-in consent, Calendar, Drive) with plain fetch, so there is no extra library.
// Only two sensitive permissions are asked for:
//   calendar.events  create and edit events on the person's calendar
//   drive.file       create and edit only the files this app made (Docs and Sheets are made through Drive)
const crypto = require('crypto');
const { HttpError } = require('./http');

const SCOPES = ['openid', 'email', 'https://www.googleapis.com/auth/calendar.events', 'https://www.googleapis.com/auth/drive.file'];
const REQUIRED = ['https://www.googleapis.com/auth/calendar.events', 'https://www.googleapis.com/auth/drive.file'];

function createGoogle({ config = {}, fetchImpl = fetch } = {}) {
  const enabled = Boolean(config.clientId && config.clientSecret && config.tokenKey);
  const key = enabled ? crypto.createHash('sha256').update(config.tokenKey).digest() : null;
  const authEndpoint = config.authEndpoint || 'https://accounts.google.com/o/oauth2/v2/auth';
  const tokens = new Map(); // userId -> { token, expires }

  // ---------------------------------------------------------------- encryption of the refresh token
  function seal(text) {
    const iv = crypto.randomBytes(12);
    const c = crypto.createCipheriv('aes-256-gcm', key, iv);
    const enc = Buffer.concat([c.update(text, 'utf8'), c.final()]);
    return Buffer.concat([iv, c.getAuthTag(), enc]).toString('base64');
  }
  function open(blob) {
    const raw = Buffer.from(blob, 'base64');
    const d = crypto.createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12));
    d.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8');
  }

  // ---------------------------------------------------------------- the "state" value that ties a consent screen to the person who started it
  const hmac = (s) => crypto.createHmac('sha256', key).update(s).digest('base64url');
  function signState(userId) {
    const body = `${userId}.${Date.now() + 15 * 60_000}.${crypto.randomBytes(8).toString('hex')}`;
    return `${body}.${hmac(body)}`;
  }
  function verifyState(state, userId) {
    const parts = String(state || '').split('.');
    if (parts.length !== 4) return false;
    const body = parts.slice(0, 3).join('.');
    const a = Buffer.from(parts[3]); const b = Buffer.from(hmac(body));
    return a.length === b.length && crypto.timingSafeEqual(a, b) && parts[0] === userId && Number(parts[1]) > Date.now();
  }

  function authUrl(userId, redirectUri) {
    const q = new URLSearchParams({
      client_id: config.clientId, redirect_uri: redirectUri, response_type: 'code', scope: SCOPES.join(' '),
      access_type: 'offline', prompt: 'consent', state: signState(userId),
    });
    return `${authEndpoint}?${q}`;
  }

  // ---------------------------------------------------------------- low-level request
  async function call(method, url, { token, json, body, headers = {}, form } = {}) {
    const h = { ...headers };
    if (token) h.Authorization = `Bearer ${token}`;
    let payload = body;
    if (json !== undefined) { h['Content-Type'] = 'application/json'; payload = JSON.stringify(json); }
    if (form) { h['Content-Type'] = 'application/x-www-form-urlencoded'; payload = new URLSearchParams(form).toString(); }
    let res;
    try { res = await fetchImpl(url, { method, headers: h, body: payload }); } catch (_) { throw new HttpError(502, 'Cannot reach Google right now. Try again in a moment.'); }
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (_) { data = null; }
    if (!res.ok) {
      const e = new HttpError(res.status === 401 || res.status === 403 ? 502 : res.status >= 500 ? 502 : res.status, (data && data.error && (data.error.message || data.error_description || data.error)) || `Google returned ${res.status}.`);
      e.google = { status: res.status, data };
      throw e;
    }
    return data;
  }

  // ---------------------------------------------------------------- sign-in flow
  async function exchangeCode(code, redirectUri) {
    const t = await call('POST', 'https://oauth2.googleapis.com/token', {
      form: { code, client_id: config.clientId, client_secret: config.clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' },
    }).catch((e) => {
      const code = e.google && e.google.data && typeof e.google.data.error === 'string' ? e.google.data.error : '';
      const hints = {
        invalid_client: 'The Google client ID or secret on the server is wrong. Check GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET (no spaces, copied from the same OAuth client), then redeploy.',
        redirect_uri_mismatch: `The redirect address does not match. In Google Cloud, add exactly ${redirectUri} under Authorized redirect URIs.`,
        invalid_grant: 'That sign-in code was already used or expired. Press Connect Google once and finish it without reloading the page.',
      };
      throw new HttpError(400, `Google did not accept that sign-in${code ? ` (${code})` : ''}. ${hints[code] || 'Start the connection again.'}`);
    });
    const granted = String(t.scope || '').split(' ');
    const missing = REQUIRED.filter((s) => !granted.includes(s));
    if (missing.length) throw new HttpError(400, 'Allow both Calendar and Drive access on the Google screen, then try again.');
    if (!t.refresh_token) throw new HttpError(400, 'Google did not allow lasting access. Remove ZolaxTech Studio at myaccount.google.com/permissions, then connect again.');
    let email = '';
    try { email = (await call('GET', 'https://openidconnect.googleapis.com/v1/userinfo', { token: t.access_token })).email || ''; } catch (_) { /* the email is only for display */ }
    return { refreshToken: t.refresh_token, email };
  }

  async function accessToken(userId, refreshToken) {
    const hit = tokens.get(userId);
    if (hit && hit.expires > Date.now()) return hit.token;
    let t;
    try {
      t = await call('POST', 'https://oauth2.googleapis.com/token', {
        form: { refresh_token: refreshToken, client_id: config.clientId, client_secret: config.clientSecret, grant_type: 'refresh_token' },
      });
    } catch (e) {
      if (e.google && e.google.status === 400) { const err = new HttpError(409, 'Google access was removed. Connect Google again in Settings.'); err.revoked = true; throw err; }
      throw e;
    }
    tokens.set(userId, { token: t.access_token, expires: Date.now() + (Math.max(60, (t.expires_in || 3600) - 120)) * 1000 });
    return t.access_token;
  }

  const forget = (userId) => tokens.delete(userId);
  const revoke = (token) => call('POST', 'https://oauth2.googleapis.com/revoke', { form: { token } }).catch(() => {});

  // ---------------------------------------------------------------- Calendar
  const CAL = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
  async function listStudioEvents(token) {
    const out = [];
    let page = '';
    do {
      const q = new URLSearchParams({ privateExtendedProperty: 'zxApp=studio', maxResults: '2500', showDeleted: 'false' });
      if (page) q.set('pageToken', page);
      const r = await call('GET', `${CAL}?${q}`, { token });
      out.push(...(r.items || []));
      page = r.nextPageToken || '';
    } while (page);
    return out;
  }
  const insertEvent = (token, ev) => call('POST', `${CAL}?sendUpdates=none`, { token, json: ev });
  const patchEvent = (token, id, ev) => call('PATCH', `${CAL}/${id}?sendUpdates=none`, { token, json: ev });
  const deleteEvent = (token, id) => call('DELETE', `${CAL}/${id}?sendUpdates=none`, { token }).catch((e) => { if (!(e.google && [404, 410].includes(e.google.status))) throw e; });

  // ---------------------------------------------------------------- Drive
  const FILES = 'https://www.googleapis.com/drive/v3/files';
  const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
  async function ensureFolder(token, folderId) {
    if (folderId) {
      try {
        const f = await call('GET', `${FILES}/${folderId}?fields=id,trashed`, { token });
        if (!f.trashed) return folderId;
      } catch (e) { if (!(e.google && e.google.status === 404)) throw e; }
    }
    const f = await call('POST', `${FILES}?fields=id`, { token, json: { name: 'ZolaxTech Studio', mimeType: 'application/vnd.google-apps.folder' } });
    return f.id;
  }
  // Uploads text and lets Google convert it to a Doc or Sheet. Returns { id, url }.
  async function uploadConverted(token, { name, mimeType, media, mediaType, folderId, existingId }) {
    if (existingId) {
      try {
        const f = await call('PATCH', `${UPLOAD}/${existingId}?uploadType=media&fields=id,webViewLink`, { token, headers: { 'Content-Type': mediaType }, body: media });
        return { id: f.id, url: f.webViewLink, replaced: true };
      } catch (e) { if (!(e.google && [404, 400].includes(e.google.status))) throw e; }
    }
    const boundary = `zx${crypto.randomBytes(8).toString('hex')}`;
    const meta = JSON.stringify({ name, mimeType, parents: folderId ? [folderId] : undefined });
    const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: ${mediaType}\r\n\r\n${media}\r\n--${boundary}--`;
    const f = await call('POST', `${UPLOAD}?uploadType=multipart&fields=id,webViewLink`, { token, headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body });
    return { id: f.id, url: f.webViewLink, replaced: false };
  }

  return { enabled, SCOPES, authUrl, verifyState, exchangeCode, accessToken, forget, revoke, seal, open,
    listStudioEvents, insertEvent, patchEvent, deleteEvent, ensureFolder, uploadConverted };
}

module.exports = { createGoogle };
