'use client';
import { createBrowserClient } from '@supabase/ssr';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
export function LoginForm({ configured, google, microsoft }: { configured: boolean; google: boolean; microsoft: boolean }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const router = useRouter();
  function client() { return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!); }
  async function login(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage('');
    const data = new FormData(event.currentTarget);
    try {
      const { error } = await client().auth.signInWithPassword({ email: String(data.get('email')), password: String(data.get('password')) });
      if (error) setMessage('Sign-in failed. Check your credentials or contact your workspace owner.');
      else { router.replace('/'); router.refresh(); }
    } catch { setMessage('Unable to reach sign-in. Please try again.'); }
    finally { setBusy(false); }
  }
  async function oauth(provider: 'google' | 'azure') {
    setBusy(true); setMessage('');
    try {
      const { error } = await client().auth.signInWithOAuth({ provider, options: { redirectTo: `${window.location.origin}/auth/callback`, ...(provider === 'azure' ? { scopes: 'email' } : {}) } });
      if (error) { setMessage('Work-account sign-in is unavailable. Contact your workspace owner.'); setBusy(false); }
    } catch { setMessage('Unable to connect to your sign-in provider.'); setBusy(false); }
  }
  return <><form onSubmit={login} className="stack"><label>Email address<input name="email" type="email" autoComplete="username" placeholder="you@agency.com" required disabled={!configured}/></label><label>Password<input name="password" type="password" autoComplete="current-password" required disabled={!configured}/></label><button className="primary" disabled={!configured || busy}>{busy ? 'Signing in…' : 'Sign in →'}</button></form>{!configured && <div className="notice">Workspace connection is pending. Sign-in becomes available after Supabase is configured.</div>}{(google || microsoft) && <><div className="divider">or use your work account</div><div className="stack">{google && <button className="secondary" disabled={!configured || busy} onClick={() => oauth('google')}>Continue with Google</button>}{microsoft && <button className="secondary" disabled={!configured || busy} onClick={() => oauth('azure')}>Continue with Microsoft</button>}</div></>}{message && <p role="alert" className="form-message error">{message}</p>}</>;
}
