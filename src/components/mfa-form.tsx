'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { createBrowserClient } from '@supabase/ssr';
export function MfaForm({ factorId }: { factorId?: string }) {
 const [factor,setFactor]=useState(factorId || ''); const [qr,setQr]=useState(''); const [busy,setBusy]=useState(false); const [message,setMessage]=useState(''); const router=useRouter();
 function db() {return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);}
 async function enroll() {
  setBusy(true);setMessage('');
  try {
   const client=db(); const {data:factors,error:factorError}=await client.auth.mfa.listFactors();
   if(factorError) throw factorError;
   for(const old of factors.all.filter(f=>f.factor_type==='totp' && f.status==='unverified')) await client.auth.mfa.unenroll({factorId:old.id});
   const {data,error}=await client.auth.mfa.enroll({factorType:'totp',friendlyName:'Agency OS authenticator'});
   if(error) throw error;
   setFactor(data.id);setQr(data.totp.qr_code);
  } catch {setMessage('Authenticator setup failed. Please try again.');} finally {setBusy(false);}
 }
 return <div className="stack">{!factor && <button className="primary" onClick={enroll} disabled={busy}>{busy?'Preparing…':'Set up authenticator'}</button>}{qr && <><p className="subtle">Scan this QR code with your authenticator app. Do not share it.</p><Image src={qr.startsWith('data:')?qr:`data:image/svg+xml;charset=utf-8,${encodeURIComponent(qr)}`} width={210} height={210} alt="Authenticator enrollment QR code" unoptimized/></>}{factor && <form className="stack" onSubmit={async e=>{
  e.preventDefault();setBusy(true);setMessage('');const code=String(new FormData(e.currentTarget).get('code'));
  try {const {error}=await db().auth.mfa.challengeAndVerify({factorId:factor,code});if(error) setMessage('Code could not be verified. Try the current authenticator code.');else {router.replace('/');router.refresh();}}
  catch {setMessage('Unable to verify the code. Please try again.');}finally {setBusy(false);}
 }}><label>Authenticator code<input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} required/></label><button className="primary" disabled={busy}>{busy?'Verifying…':'Verify and continue'}</button></form>}{message && <p role="alert" className="form-message error">{message}</p>}<form action="/auth/signout" method="post"><button className="secondary small">Sign out</button></form></div>;
}
