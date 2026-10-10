'use client';
import { createBrowserClient } from '@supabase/ssr';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { passwordSchema } from '@/lib/validation';
export function SetPassword() {
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState('');
  const router = useRouter();
  return <form className="stack" onSubmit={async e => {
    e.preventDefault(); const form = new FormData(e.currentTarget); const password = String(form.get('password'));
    if (password !== form.get('confirm')) { setMessage('Passwords do not match.'); return; }
    const validation = passwordSchema.safeParse(password);
    if (!validation.success) { setMessage(validation.error.issues[0].message); return; }
    setBusy(true); setMessage('');
    try {
      const db = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
      const { error } = await db.auth.updateUser({ password });
      if (error) setMessage('Password could not be updated. Check your password requirements or request a new invitation.');
      else { router.replace('/'); router.refresh(); }
    } catch { setMessage('Unable to connect. Please try again.'); } finally { setBusy(false); }
  }}><label>New password<input type="password" name="password" autoComplete="new-password" minLength={6} maxLength={72} required/></label><label>Confirm password<input type="password" name="confirm" autoComplete="new-password" minLength={6} maxLength={72} required/></label><button className="primary" disabled={busy}>{busy ? 'Saving…' : 'Set password'}</button>{message && <p role="alert" className="form-message error">{message}</p>}</form>;
}
