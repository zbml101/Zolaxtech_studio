// Cloudflare Pages build step: copy the Supabase browser library next to the site files.
const fs = require('fs');
const path = require('path');
const src = path.join(__dirname, '..', 'node_modules', '@supabase', 'supabase-js', 'dist', 'umd', 'supabase.js');
const dest = path.join(__dirname, '..', 'public', 'vendor', 'supabase.js');
if (!fs.existsSync(src)) {
  console.error('Missing ' + src + '. Run "npm install" first.');
  process.exit(1);
}
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.copyFileSync(src, dest);
console.log('Copied supabase.js to public/vendor/');
