// Starts the server. On Render, set SUPABASE_URL and SUPABASE_ANON_KEY as environment variables.
const fs = require('fs');
const path = require('path');

// Tiny .env reader for local use (Render uses real environment variables instead).
try {
  const file = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
  for (const line of file.split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i.exec(line);
    if (m && !line.trim().startsWith('#') && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
} catch (_) { /* no .env file: fine */ }

const { createClient } = require('@supabase/supabase-js');
const { createApp } = require('./src/app');

const config = {
  supabaseUrl: (process.env.SUPABASE_URL || '').trim(),
  supabaseAnonKey: (process.env.SUPABASE_ANON_KEY || '').trim(),
};

if (!/^https:\/\/.+\.supabase\.co\/?$/.test(config.supabaseUrl) || !config.supabaseAnonKey) {
  console.error(
    '\nMissing Supabase settings.\n' +
    'Set SUPABASE_URL (like https://abcdxyz.supabase.co) and SUPABASE_ANON_KEY (the "anon public" key)\n' +
    'in the Render dashboard (Environment) or in a local .env file. See README.md.\n',
  );
  process.exit(1);
}
config.supabaseUrl = config.supabaseUrl.replace(/\/$/, '');

const app = createApp({
  createClient,
  config,
  supabaseBrowserBundle: path.join(__dirname, 'node_modules', '@supabase', 'supabase-js', 'dist', 'umd', 'supabase.js'),
});

const port = Number(process.env.PORT) || 3000;
app.listen(port, '0.0.0.0', () => console.log(`ZolaxTech Studio is running on port ${port}`));
