import 'server-only';
import {oauthDb} from './jira-oauth-server';
export async function recordSyncHealth(org:string,scope:string,integration:'jira'|'google_read'|'google_write',success:boolean){
 // Telemetry failure must never turn a successful external write into a retry.
 try{await oauthDb().rpc('workspace_sync_health_record',{org_id:org,scope_value:scope,integration_value:integration,success_value:success});}catch{}
}
