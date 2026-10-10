import { redirect } from 'next/navigation';
import { hasBackend } from '@/lib/config';
import { serverClient } from '@/lib/supabase/server';
import { SetPassword } from '@/components/set-password';
export const dynamic = 'force-dynamic';
export default async function PasswordPage() {
  if (!hasBackend()) redirect('/login');
  const db = await serverClient(); const { data: { user } } = await db.auth.getUser();
  if (!user) redirect('/login');
  return <main className="auth-page"><section className="auth-card"><span className="eyebrow">YOUR WORKSPACE ACCOUNT</span><h2>Set your password</h2><p>Choose a strong password to finish setting up your account.</p><SetPassword/></section></main>;
}
