// Read-only checks of the published app, optionally using isolated fixture users.
const fs = require('node:fs');
const assert = require('node:assert/strict');
require('@next/env').loadEnvConfig(process.cwd());
const { createServerClient } = require('@supabase/ssr');
const origin = process.argv.find(arg => arg.startsWith('--origin='))?.slice('--origin='.length) || 'https://vilpower-agency-crm.netlify.app';
const allowedOrigin = new URL(origin);
if (allowedOrigin.protocol !== 'https:' || !(allowedOrigin.hostname === 'vilpower-agency-crm.netlify.app' || allowedOrigin.hostname.endsWith('--vilpower-agency-crm.netlify.app'))) throw Error('Only this CRM production/preview host is allowed');
const results = [];
async function request(route, cookie) {
  const response = await fetch(new URL(route, origin), {
    redirect: 'manual', headers: cookie ? { Cookie: cookie } : {},
    signal: AbortSignal.timeout(60000),
  });
  const body = await response.text();
  return { response, body };
}
async function run() {
  const login = await request('/login');
  assert.equal(login.response.status, 200, 'Login page must load');
  assert(login.body.includes('Sign in to your workspace'), 'Expected CRM login');
  assert(!login.body.includes('Explore the empty setup preview'), 'Production backend must be configured');
  assert.equal(login.response.headers.get('x-content-type-options'), 'nosniff');
  results.push({ route: '/login', status: 200, configured: true });
  const asset = login.body.match(/href="([^\"]+\.css[^\"]*)"/);
  assert(asset, 'Login stylesheet exists');
  const css = await request(asset[1]);
  assert.equal(css.response.status, 200, 'Published stylesheet loads');
  results.push({ stylesheet: 'loaded', status: 200 });
  for (const route of ['/', '/sales', '/clients', '/work', '/source', '/me', '/attendance', '/communication', '/chat', '/campaigns', '/analytics', '/finance', '/team', '/reports', '/settings']) {
    const { response } = await request(route);
    assert([302, 303, 307, 308].includes(response.status), `Anonymous ${route} must redirect`);
    assert(new URL(response.headers.get('location'), origin).pathname === '/login');
    results.push({ route, anonymous: 'login required', status: response.status });
  }
  if (process.argv.includes('--fixture')) {
    const fixture = JSON.parse(fs.readFileSync('test-results/verification-private.json', 'utf8'));
    for (const [index, user] of fixture.users.entries()) {
      const jar = new Map();
      const auth = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
          cookies: { getAll: () => [...jar].map(([name, value]) => ({ name, value })),
            setAll: cookies => cookies.forEach(c => jar.set(c.name, c.value)) },
        });
      const signed = await auth.auth.signInWithPassword({ email: user.email, password: user.password });
      assert.ifError(signed.error);
      const cookie = [...jar].map(([name, value]) => `${name}=${value}`).join('; ');
      for (const route of ['/', '/work', '/reports', '/chat', '/api/work']) {
        const { response, body } = await request(route, cookie);
        assert.equal(response.status, 200, `${index === 0 ? 'Owner' : 'Employee'} ${route}`);
        if (route === '/api/work') assert.doesNotThrow(() => JSON.parse(body));
        else assert(!body.includes('Application error: a server-side exception'));
        results.push({ role: index === 0 ? 'isolated owner' : 'isolated employee', route, status: 200 });
      }
      await auth.auth.signOut();
    }
  }
  fs.mkdirSync('test-results/live-hosting', { recursive: true });
  fs.writeFileSync('test-results/live-hosting/read-checks.json', JSON.stringify({ origin, at: new Date().toISOString(), results }, null, 2));
  console.log(JSON.stringify({ origin, passed: results.length, results }, null, 2));
}
run().catch(error => { console.error(error.message); process.exitCode = 1; });
