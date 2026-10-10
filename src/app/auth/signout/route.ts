import { NextResponse, type NextRequest } from 'next/server';
import { serverClient } from '@/lib/supabase/server';
import { hasBackend } from '@/lib/config';
export async function POST(request: NextRequest) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return new NextResponse('Forbidden', { status: 403 });
  if (hasBackend()) { const db = await serverClient(); await db.auth.signOut(); }
  return NextResponse.redirect(new URL('/login', request.url), 303);
}
