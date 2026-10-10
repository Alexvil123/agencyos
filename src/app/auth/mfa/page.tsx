import { redirect } from 'next/navigation';
import { hasBackend } from '@/lib/config';
import { serverClient } from '@/lib/supabase/server';
import { MfaForm } from '@/components/mfa-form';
export const dynamic = 'force-dynamic';
export default async function MfaPage() {
  if (!hasBackend()) redirect('/login');
  // workspaceContext redirects here only while the workspace still requires MFA.
  const context = await workspaceContextForMfa();
  if (!context) redirect('/');
  const db = await serverClient(); const { data: { user } } = await db.auth.getUser();
  if (!user) redirect('/login');
  const { data, error } = await db.auth.mfa.listFactors();
  if (error) throw new Error('Unable to verify authentication factors.');
  return <main className="auth-page"><section className="auth-card"><span className="eyebrow">PROTECT YOUR WORKSPACE</span><h2>Two-step verification</h2><p>Owner, system administration, finance, and private HR access require an authenticator code.</p><MfaForm factorId={data.totp.find(f => f.status === 'verified')?.id}/></section></main>;
}
async function workspaceContextForMfa() {
  const db = await serverClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect('/login');
  const { data, error } = await db.from('memberships').select('organizations(require_mfa)').eq('user_id',user.id).eq('active',true).maybeSingle();
  if (error && ['42703','PGRST204'].includes(error.code)) return true;
  if (error) throw new Error('Unable to verify sign-in policy.');
  return (data?.organizations as unknown as { require_mfa: boolean } | null)?.require_mfa;
}
