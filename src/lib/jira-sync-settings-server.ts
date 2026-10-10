import 'server-only';
import {workAdmin} from './work-server';
export async function jiraAutoFetch(org:string){const r=await workAdmin().from('jira_sync_settings').select('auto_fetch').eq('organization_id',org).maybeSingle();return {ready:!r.error,enabled:!r.error&&(r.data?.auto_fetch??true)};}
