import 'server-only';
import {reconcileConnectedJira,connectionOrganizations} from './jira-reconciliation-server';
export type ScheduledJob='jira';
// One job per call so each invocation fits a serverless time limit. The Jira job keeps its own lease, honours the Owner's
// Automatic Fetch switch and never retries an uncertain write.
export async function runScheduledJob(job:ScheduledJob){
  const started=Date.now();
  let ok=true;const organizations=await connectionOrganizations();
  for(const org of organizations){if(!(await reconcileConnectedJira(org)).ok)ok=false;}
  return {ok,job,organizations:organizations.length,ms:Date.now()-started};
}
