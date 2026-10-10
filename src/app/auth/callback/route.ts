import { NextResponse, type NextRequest } from 'next/server';
import { serverClient } from '@/lib/supabase/server';
import { hasBackend } from '@/lib/config';
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  if (hasBackend() && code) {
    const db = await serverClient();
    const { error } = await db.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL('/', request.url));
  }
  return NextResponse.redirect(new URL('/login?error=callback', request.url));
}
