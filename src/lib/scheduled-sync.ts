import 'server-only';
import {oauthDb} from './jira-oauth-server';
import {runSalesConversions} from './sales-conversion-server';
import {reconcileConnectedJira,connectionOrganizations} from './jira-reconciliation-server';
export type ScheduledJob='sales'|'jira';
// One job per call so each invocation fits a serverless time limit. Both jobs keep their own leases, settings
// (Jira honours the Owner's Automatic Fetch switch) and never retry an uncertain write.
export async function runScheduledJob(job:ScheduledJob){
  const started=Date.now();
  if(job==='sales'){
    const {data,error}=await oauthDb().from('sales_conversion_settings').select('organization_id').eq('enabled',true);
    if(error)return {ok:false,job,organizations:0,ms:Date.now()-started};
    for(const row of data||[])await runSalesConversions(row.organization_id);
    return {ok:true,job,organizations:(data||[]).length,ms:Date.now()-started};
  }
  let ok=true;const organizations=await connectionOrganizations();
  for(const org of organizations){if(!(await reconcileConnectedJira(org)).ok)ok=false;}
  return {ok,job,organizations:organizations.length,ms:Date.now()-started};
}
