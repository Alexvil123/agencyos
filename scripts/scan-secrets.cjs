// Fails when build output contains something that looks like a server secret. Prints file names only, never contents.
const fs = require('node:fs');
const path = require('node:path');
const patterns = [
  ['Supabase secret key', /sb_secret_[A-Za-z0-9_-]{20,}/],
  ['Private key block', /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/],
  ['Atlassian API token', /ATATT[A-Za-z0-9_=-]{30,}/],
  ['Service role JWT', /"role"\s*:\s*"service_role"/],
];
const roots = process.argv.slice(2).length ? process.argv.slice(2) : ['.next/static', '.netlify'];
const found = [];
let scanned = 0;
function walk(dir) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { if (entry.name !== 'node_modules') walk(full); continue; }
    if (!/\.(js|mjs|cjs|json|html|txt|map|css)$/.test(entry.name)) continue;
    let size = 0;
    try { size = fs.statSync(full).size; } catch { continue; }
    if (size > 12 * 1024 * 1024) continue;
    scanned++;
    const text = fs.readFileSync(full, 'utf8');
    for (const [label, re] of patterns) if (re.test(text)) found.push(`${label}: ${full}`);
  }
}
for (const root of roots) walk(root);
console.log(`Scanned ${scanned} build files in ${roots.join(', ')}.`);
if (found.length) { console.error('Possible secrets found:\n' + found.join('\n')); process.exit(1); }
console.log('No secret patterns found.');
