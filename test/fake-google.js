// A stand-in for Google's token, Calendar and Drive endpoints, used by the tests and by test/dev.js.
const SCOPE = 'openid email https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/drive.file';

function createFakeGoogle({ scope = SCOPE, refreshToken = 'rt-1' } = {}) {
  const events = new Map();   // id -> event (including cancelled ones)
  const files = new Map();    // id -> { name, mimeType, media, parents }
  const log = [];
  let n = 0;
  const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const state = { revoked: false, scope, refreshToken, deniedRefresh: false };

  async function fetchImpl(url, opts = {}) {
    const u = new URL(url);
    const method = opts.method || 'GET';
    const body = opts.body;
    log.push(`${method} ${u.host}${u.pathname}`);

    if (u.host === 'oauth2.googleapis.com' && u.pathname === '/token') {
      const f = new URLSearchParams(body);
      if (f.get('grant_type') === 'authorization_code') {
        if (f.get('code') !== 'good-code') return json(400, { error: 'invalid_grant' });
        return json(200, { access_token: 'at-1', refresh_token: state.noRefresh ? undefined : state.refreshToken, expires_in: 3600, scope: state.scope });
      }
      if (state.deniedRefresh || f.get('refresh_token') !== state.refreshToken) return json(400, { error: 'invalid_grant' });
      return json(200, { access_token: 'at-2', expires_in: 3600 });
    }
    if (u.host === 'oauth2.googleapis.com' && u.pathname === '/revoke') { state.revoked = true; return json(200, {}); }
    if (u.host === 'openidconnect.googleapis.com') return json(200, { email: 'ada@gmail.com' });

    if (u.pathname.startsWith('/calendar/v3/calendars/primary/events')) {
      const id = u.pathname.split('/')[6];
      if (method === 'GET') return json(200, { items: [...events.values()].filter((e) => e.status !== 'cancelled' && e.extendedProperties?.private?.zxApp === 'studio') });
      if (method === 'POST') {
        const ev = JSON.parse(body);
        if (events.has(ev.id)) return json(409, { error: { message: 'The requested identifier already exists.' } });
        events.set(ev.id, { ...ev, status: 'confirmed' });
        return json(200, events.get(ev.id));
      }
      if (method === 'PATCH') { if (!events.has(id)) return json(404, { error: { message: 'Not Found' } }); Object.assign(events.get(id), JSON.parse(body)); return json(200, events.get(id)); }
      if (method === 'DELETE') { if (!events.has(id)) return json(404, { error: { message: 'Not Found' } }); events.get(id).status = 'cancelled'; return new Response(null, { status: 204 }); }
    }

    if (u.pathname.startsWith('/upload/drive/v3/files')) {
      if (method === 'POST') {
        const m = /boundary=(\S+)/.exec(opts.headers['Content-Type'])[1];
        const parts = body.split(`--${m}`).filter((p) => p.includes('Content-Type'));
        const meta = JSON.parse(parts[0].split('\r\n\r\n')[1].trim());
        const media = parts[1].split('\r\n\r\n').slice(1).join('\r\n\r\n').replace(/\r\n$/, '');
        const id = `file${++n}`;
        files.set(id, { ...meta, media });
        return json(200, { id, webViewLink: `https://docs.google.com/d/${id}` });
      }
      if (method === 'PATCH') {
        const id = u.pathname.split('/').pop();
        if (!files.has(id)) return json(404, { error: { message: 'File not found' } });
        files.get(id).media = body;
        return json(200, { id, webViewLink: `https://docs.google.com/d/${id}` });
      }
    }
    if (u.pathname.startsWith('/drive/v3/files')) {
      const id = u.pathname.split('/')[4];
      if (method === 'POST') { const nid = `folder${++n}`; files.set(nid, { ...JSON.parse(body), folder: true }); return json(200, { id: nid }); }
      if (method === 'GET') return files.has(id) ? json(200, { id, trashed: false }) : json(404, { error: { message: 'File not found' } });
    }
    return json(500, { error: { message: `fake Google has no route for ${method} ${url}` } });
  }
  return { fetchImpl, events, files, log, state };
}

module.exports = { createFakeGoogle, SCOPE };
