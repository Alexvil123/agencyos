// Sanitize ignored generated artifacts; runtime credentials come from Netlify env.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve('.netlify/functions-internal');
if (!fs.existsSync(root)) throw Error('Build the Netlify server function first');
const privateName = name => name.startsWith('.env') || name.includes('.local.json');
let removed = 0;
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.resolve(dir, entry.name);
    if (!file.startsWith(root + path.sep)) throw Error('Generated artifact outside package root');
    if (entry.isDirectory()) walk(file);
    else if (entry.isFile() && privateName(entry.name)) { fs.unlinkSync(file); removed++; }
    else if (entry.isFile() && entry.name.endsWith('.nft.json')) {
      const trace = JSON.parse(fs.readFileSync(file, 'utf8'));
      const files = (trace.files || []).filter(value => !privateName(path.basename(value)) && !value.includes('test-results'));
      if (files.length !== trace.files?.length) fs.writeFileSync(file, JSON.stringify({ ...trace, files }));
    }
  }
}
walk(root);
// Invalidate the previous archive so the CLI rebuilds it from the clean folder.
const zip = path.resolve('.netlify/functions/___netlify-server-handler.zip');
if (fs.existsSync(zip)) fs.unlinkSync(zip);
console.log(`Generated server package sanitized; private files removed: ${removed}. Rebundle with --skip-functions-cache.`);
