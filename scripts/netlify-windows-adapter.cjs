// Apply to the generated, ignored adapter only; never change application runtime.
// Netlify Runtime 5.16.2 uses privileged Windows symlinks and copies local env files.
const fs = require('node:fs');
const path = require('node:path');
if (process.platform !== 'win32') throw Error('This helper is for local Windows builds only');
const adapter = path.resolve('.netlify/plugins/node_modules/@netlify/plugin-nextjs');
const pkg = JSON.parse(fs.readFileSync(path.join(adapter, 'package.json'), 'utf8'));
if (!['5.16.2', '5.16.3'].includes(pkg.version)) throw Error('Review the new adapter version before applying compatibility changes');
const contentPath = path.join(adapter, 'dist/build/content/server.js');
const content = fs.readFileSync(contentPath, 'utf8');
fs.writeFileSync(contentPath, content.replaceAll('verbatimSymlinks: true', 'dereference: true')
  .replace('await symlink(symlinkTarget, symlinkSrc);',
    'await cp(symlinkDest, symlinkSrc, { recursive: true, dereference: true, force: true });'));
const serverPath = path.join(adapter, 'dist/build/functions/server.js');
const server = fs.readFileSync(serverPath, 'utf8');
const block = `    includedFiles.push(
      posixJoin(ctx.relativeAppDir, ".env"),
      posixJoin(ctx.relativeAppDir, ".env.production"),
      posixJoin(ctx.relativeAppDir, ".env.local"),
      posixJoin(ctx.relativeAppDir, ".env.production.local")
    );`;
const replacement = '    // Local environment files are intentionally excluded from deployment artifacts.';
if (!server.includes(block) && !server.includes(replacement)) throw Error('Adapter environment-copy code changed; review before deploying');
fs.writeFileSync(serverPath, server.replace(block, replacement));
// Deno's Windows CJS loader needs native drive-letter file URL conversion.
// Native conversion preserves POSIX behavior when these files run on Netlify.
const cjsPath = path.join(adapter, 'edge-runtime/lib/cjs.ts');
const cjs = fs.readFileSync(cjsPath, 'utf8');
fs.writeFileSync(cjsPath, cjs.replace('fileURLToPath(baseUrl, { windows: false })', 'fileURLToPath(baseUrl)')
  .replace('pathToFileURL(filepath, { windows: false })', 'pathToFileURL(filepath)')
  .replace('let target = args[0]', 'let target = toPosixPath(args[0])'));
console.log('Generated Windows adapter prepared: native file URLs, ordinary copies, no local environment files.');
