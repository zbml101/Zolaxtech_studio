// Starts the real app against the in-memory Supabase stand-in so the screens can be tried with no Supabase project.
//   node test/dev.js   then open http://localhost:3100
const path = require('path');
const { createApp } = require('../src/app');
const { createFake } = require('./fake-supabase');

const fake = createFake();
const app = createApp({
  createClient: fake.createClient,
  config: { supabaseUrl: 'https://fake.supabase.co', supabaseAnonKey: 'anon' },
  supabaseBrowserBundle: path.join(__dirname, 'stub-supabase-browser.js'),
});
const port = Number(process.env.PORT) || 3100;
app.listen(port, () => console.log(`Dev server with fake Supabase on http://localhost:${port}`));
