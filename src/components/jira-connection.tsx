'use client';
import { useEffect, useRef, useState, useTransition } from 'react';
import { Layers3 } from 'lucide-react';
import { connectJira, configureJiraOAuthApp, jiraConnectionState } from '@/app/jira-actions';
type Result={ok:boolean;message:string};
export function JiraConnection({owner,preview}:{owner:boolean;preview:boolean}) {
  const tokenInput=useRef<HTMLInputElement>(null);
  const appSecretInput=useRef<HTMLInputElement>(null);
  const [state,setState]=useState<Awaited<ReturnType<typeof jiraConnectionState>>>();
  const [result,setResult]=useState<Result>();const [busy,start]=useTransition();
  useEffect(()=>{if(!preview) start(async()=>{
    setState(await jiraConnectionState());
    const outcome=new URL(window.location.href).searchParams.get('jira_oauth');
    if(outcome) setResult({ok:outcome==='connected',message:outcome==='connected'?'Jira OAuth connected. Open Work and refresh your tasks.':outcome==='denied'?'Jira access was declined. Connect again when ready.':outcome==='site_or_scopes'?'Select vilpowerdigitalmarketing.atlassian.net and grant the required Jira read/write/user permissions.':'OAuth connection was not completed. Check Client ID/Secret, callback URL, permissions and try Connect Jira again.'});
  });},[preview]);
  return <div className="jira-connection"><div className="integration-row"><span className="activity-icon"><Layers3 size={19}/></span><div><strong>Jira · Two-way task updates</strong><p>OCT · SEP · SOURCE · Same Jira statuses</p></div><span className="neutral-pill">{state?.configured ? 'CREDENTIAL CONFIGURED' : 'SETUP REQUIRED'}</span></div>
    <p className="subtle">Employees access assigned tasks. Owner creates tasks and links employee accounts. Jira permissions and valid transitions still apply.</p>
    {state && !state.databaseReady && <div className="notice">Jira database migration has not been applied yet.</div>}
    {owner && !preview && <>
      <h3>Connect with Atlassian OAuth</h3><p className="subtle">Sign in to Atlassian and approve Jira access. CRM sign-in stays email/password.</p>
      <p className="subtle">Atlassian callback URL: <code>{state?.callback||'http://127.0.0.1:3000/integrations/jira/callback'}</code></p>
      {state?.oauthConnected && <div className="notice">Jira OAuth connection saved. Open Work → Refresh tasks to verify current project access.</div>}
      <details open={!state?.oauthAppReady}><summary>OAuth app credentials · Owner setup</summary><form className="stack settings-form" action={form=>start(async()=>{setResult(await configureJiraOAuthApp(form));if(appSecretInput.current)appSecretInput.current.value='';setState(await jiraConnectionState());})}>
        <label>OAuth Client ID<input name="client_id" required autoComplete="off" maxLength={512}/></label>
        <label>OAuth Client Secret<input ref={appSecretInput} name="client_secret" type="password" required autoComplete="new-password" minLength={10} maxLength={4096}/></label>
        <p className="subtle">Copied from your Atlassian app Settings. Saved only in an ignored local server file; authorization tokens are encrypted in the database. Do not send the secret in chat.</p>
        <label className="checkbox-label"><input type="checkbox" name="confirmed" value="yes" required/>Save this OAuth app configuration on the CRM server.</label>
        <button className="primary" disabled={busy||!state?.databaseReady||state?.oauthConnected}>Save OAuth app</button>
      </form></details>
      <form className="stack settings-form" action="/integrations/jira/connect" method="post"><label className="checkbox-label"><input type="checkbox" name="confirmed" value="yes" required/>Authorize Jira issue read/write and user-profile access for this agency connection.</label><button className="primary" disabled={busy||!state?.oauthAppReady}>{state?.oauthConnected?'Reconnect Jira':'Connect Jira'}</button></form>
      {result&&<p role="status" className={`form-message ${result.ok?'success':'error'}`}>{result.message}</p>}
    </>}
    {owner && !preview && <details><summary>Advanced · API token fallback</summary><form className="stack settings-form" action={form=>start(async()=>{setResult(await connectJira(form));if(tokenInput.current)tokenInput.current.value='';setState(await jiraConnectionState());})}>
      <label>Jira account email<input name="email" type="email" required autoComplete="off" placeholder="Email of the account that created the token"/></label>
      <label>Jira API token<input ref={tokenInput} name="token" type="password" required autoComplete="new-password" minLength={10} maxLength={4096}/></label>
      <p className="subtle">Normal and scoped tokens are supported automatically. Your observed Jira login was digitalmarketing@vilpower.com; use that email if it created the token. Scoped tokens need Jira read/write and user-read scopes.</p>
      <p className="subtle">For this local agency CRM, the token is saved in an ignored server file on this computer. Production hosting requires server environment secrets. Never paste tokens into chat.</p>
      <label className="checkbox-label"><input type="checkbox" name="confirmed" value="yes" required/>I authorize this CRM server to read and update tasks in my Jira site.</label>
      <button className="primary" disabled={busy || !state?.databaseReady}>{busy?'Checking…':state?.configured?'Replace connection':'Verify & connect Jira'}</button>
      {result && <p role="status" className={`form-message ${result.ok?'success':'error'}`}>{result.message}</p>}
    </form></details>}
  </div>;
}
