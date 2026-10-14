import type { NextConfig } from 'next';
const config: NextConfig = {
  // Development credentials are never part of a deployable server trace.
  outputFileTracingExcludes:{'/*':['./.env*','./.*.local.json*','./test-results/**/*']},
  experimental:{serverActions:{bodySizeLimit:'6mb'}},
  distDir: process.env.CRM_DESIGN_PREVIEW === '1' && process.env.NODE_ENV === 'development' ? '.next-preview' : '.next',
  poweredByHeader: false,
  logging: {serverFunctions:false,incomingRequests:{ignore:[/\/integrations\/jira\/callback/]}},
  async redirects() {
    // "My account & time" was merged into Attendance; keep old links and bookmarks working.
    return [{ source: '/me', destination: '/attendance', permanent: true }];
  },
  async headers() {
    return [{ source: '/:path*', headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      { key: 'Content-Security-Policy', value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'" },
    ] }];
  },
};
export default config;
