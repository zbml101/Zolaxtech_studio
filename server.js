// Starts the server. On SnapDeploy, set SUPABASE_URL and SUPABASE_ANON_KEY as environment variables.
const fs = require('fs');
const path = require('path');

// Tiny .env reader for local use (SnapDeploy uses real environment variables instead).
try {
  const file = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
  for (const line of file.split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i.exec(line);
    if (m && !line.trim().startsWith('#') && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
} catch (_) { /* no .env file: fine */ }

const { createClient: baseCreateClient } = require('@supabase/supabase-js');

// supabase-js wants a WebSocket for its realtime feature, which this app never uses. Node 20 has none built in,
// so creating a client fails with "native WebSocket not found" unless it is given a transport.
// A do-nothing stand-in is enough, and it keeps the project free of any real WebSocket code (some hosts, like
// SnapDeploy, then treat the app as plain web and let it run on the free plan).
class NoRealtime { constructor() { throw new Error('Realtime is not used by this app'); } }
const createClient = (url, key, options = {}) => baseCreateClient(url, key, { ...options, realtime: { transport: NoRealtime } });
const { createApp } = require('./src/app');

const config = {
  supabaseUrl: (process.env.SUPABASE_URL || '').trim(),
  supabaseAnonKey: (process.env.SUPABASE_ANON_KEY || '').trim(),
  publicUrl: (process.env.PUBLIC_URL || '').trim(),
  // Only these people may use the app (comma-separated emails). Anyone else who signs up is turned away.
  allowedEmails: (process.env.ALLOWED_EMAILS || '').split(/[,;\s]+/).map((e) => e.trim().toLowerCase()).filter(Boolean),
  // Optional: Google Workspace connection. Without these three the app works the same, minus the Google buttons.
  google: {
    clientId: (process.env.GOOGLE_CLIENT_ID || '').trim(),
    clientSecret: (process.env.GOOGLE_CLIENT_SECRET || '').trim(),
    tokenKey: (process.env.TOKEN_KEY || '').trim(),
  },
};

if (!/^https:\/\/.+\.supabase\.co\/?$/.test(config.supabaseUrl) || !config.supabaseAnonKey) {
  console.error(
    '\nMissing Supabase settings.\n' +
    'Set SUPABASE_URL (like https://abcdxyz.supabase.co) and SUPABASE_ANON_KEY (the "anon public" key)\n' +
    'in the SnapDeploy dashboard (environment variables) or in a local .env file. See README.md.\n',
  );
  process.exit(1);
}
config.supabaseUrl = config.supabaseUrl.replace(/\/$/, '');

// Closed by default: without a list of approved emails the app refuses to start, so it can never be left open by mistake.
if (!config.allowedEmails.length && process.env.ALLOW_ANY_SIGNED_IN !== 'true') {
  console.error(
    '\nNo approved people are set.\n' +
    'Set ALLOWED_EMAILS to the email addresses that may use this app, separated by commas,\n' +
    'for example  ALLOWED_EMAILS=you@gmail.com,editor@gmail.com  (see README.md, "Who can sign in").\n',
  );
  process.exit(1);
}

const app = createApp({
  createClient,
  config,
  supabaseBrowserBundle: path.join(__dirname, 'node_modules', '@supabase', 'supabase-js', 'dist', 'umd', 'supabase.js'),
});

const port = Number(process.env.PORT) || 3000;
app.listen(port, '0.0.0.0', () => console.log(`ZolaxTech Studio is running on port ${port}`));
