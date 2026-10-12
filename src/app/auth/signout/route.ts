import { NextResponse, type NextRequest } from 'next/server';
import { serverClient } from '@/lib/supabase/server';
import { hasBackend } from '@/lib/config';
// Same-origin check against the host the browser actually used (behind a proxy or when opened as localhost vs 127.0.0.1,
// request.url can carry a different host than the page the person is on).
function sameOrigin(request: NextRequest) {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try {
    const host = request.headers.get('x-forwarded-host')?.split(',')[0].trim() || request.headers.get('host') || new URL(request.url).host;
    return new URL(origin).host === host;
  } catch { return false; }
}
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return new NextResponse('Forbidden', { status: 403 });
  if (hasBackend()) { const db = await serverClient(); await db.auth.signOut(); }
  const host = request.headers.get('x-forwarded-host')?.split(',')[0].trim() || request.headers.get('host') || new URL(request.url).host;
  const proto = request.headers.get('x-forwarded-proto')?.split(',')[0].trim() || new URL(request.url).protocol.replace(':', '');
  return NextResponse.redirect(`${proto}://${host}/login`, 303);
}
