'use client';
import '../app/jira-connection.css';
import { useEffect, useRef, useState, useTransition } from 'react';
import { CheckCircle2, Layers3 } from 'lucide-react';
import { connectJira, jiraConnectionState } from '@/app/jira-actions';
type Result={ok:boolean;message:string};
const outcomes:Record<string,string>={
  connected:'Jira OAuth connected. Open Work and refresh your tasks.',
  denied:'Jira access was declined. Connect again when ready.',
  site_or_scopes:'Select vilpowerdigitalmarketing.atlassian.net and grant the required Jira read, write and user permissions.',
};
/** Connect the CRM to Jira. The OAuth app credentials themselves are entered in the Integrations list above. */
export function JiraConnection({owner,preview}:{owner:boolean;preview:boolean}) {
  const tokenInput=useRef<HTMLInputElement>(null);
  const [state,setState]=useState<Awaited<ReturnType<typeof jiraConnectionState>>>();
  const [result,setResult]=useState<Result>();const [busy,start]=useTransition();
  useEffect(()=>{if(!preview) start(async()=>{
    setState(await jiraConnectionState());
    const outcome=new URL(window.location.href).searchParams.get('jira_oauth');
    if(outcome) setResult({ok:outcome==='connected',message:outcomes[outcome]||'OAuth connection was not completed. Check the Client ID and secret in Integrations, the callback URL and permissions, then try Connect Jira again.'});
  });},[preview]);
  const checking=!preview&&!state,connected=Boolean(state?.configured);
  return <section className="panel jira-connection" aria-label="Jira connection">
    <header>
      <span className="activity-icon"><Layers3 size={19}/></span>
      <div><h3>Jira · Two-way task updates</h3><p>Month projects (JAN–DEC) · SOURCE · same Jira statuses</p></div>
      <span className={`jira-status ${checking?'checking':connected?'on':'off'}`}>{checking?'Checking…':connected?<><CheckCircle2 size={13}/> Connected</>:'Not connected'}</span>
    </header>
    <p className="jira-help">Employees see their assigned tasks. The Owner creates tasks and links employee accounts. Jira permissions and valid transitions still apply.</p>
    {state && !state.databaseReady && <div className="notice">The Jira database migration has not been applied yet.</div>}
    {checking&&<p role="status" className="jira-help">Checking the Jira connection…</p>}
    {owner && state && !preview && <>
      {!state.oauthAppReady&&<p role="alert" className="notice">Add the Jira OAuth app (Client ID and Client secret) in the <b>Jira OAuth app</b> card above, then connect here.</p>}
      {state.oauthConnected && <p role="status" className="notice">Jira OAuth connection saved. Open Work → Sync Jira to verify current project access.</p>}
      <p className="jira-help">Register this callback URL in your Atlassian OAuth app: <code>{state.callback}</code></p>
      <form className="jira-connect" action="/integrations/jira/connect" method="post">
        <label className="checkbox-label"><input type="checkbox" name="confirmed" value="yes" required/>Authorize Jira issue read/write and user-profile access for this agency connection.</label>
        <button className="primary" disabled={busy||!state.oauthAppReady}>{state.oauthConnected?'Reconnect Jira':'Connect Jira'}</button>
      </form>
      {result&&<p role="status" className={`form-message ${result.ok?'success':'error'}`}>{result.message}</p>}
      <details className="jira-advanced"><summary>Advanced · API token fallback</summary>
        <form className="stack settings-form" action={form=>start(async()=>{setResult(await connectJira(form));if(tokenInput.current)tokenInput.current.value='';setState(await jiraConnectionState());})}>
          <label>Jira account email<input name="email" type="email" required autoComplete="off" placeholder="Email of the account that created the token"/></label>
          <label>Jira API token<input ref={tokenInput} name="token" type="password" required autoComplete="new-password" minLength={10} maxLength={4096}/></label>
          <p className="jira-help">Only for a local setup: the token is kept in an ignored file on this computer. Hosted sites use the OAuth app above. Never paste tokens into chat.</p>
          <label className="checkbox-label"><input type="checkbox" name="confirmed" value="yes" required/>I authorize this CRM server to read and update tasks in my Jira site.</label>
          <button className="primary" disabled={busy || !state.databaseReady}>{busy?'Checking…':connected?'Replace connection':'Verify & connect Jira'}</button>
        </form>
      </details>
    </>}
  </section>;
}
