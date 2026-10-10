import 'server-only';
import {workAdmin} from './work-server';
import {missingJiraTasks} from './jira-availability';
import type {TimeTask} from './time-types';
export async function reconcileJiraAvailability(org:string,keys:string[],startedAt:string,account:string|null){
 const db=workAdmin();const tasks:TimeTask[]=[];
 for(let page=0;page<100;page++){let query=db.from('time_tasks').select('*').eq('organization_id',org).eq('source','jira').is('canonical_id',null).order('id').range(page*1000,page*1000+999);if(account)query=query.eq('jira_assignee_account_id',account);const r=await query;if(r.error)throw new Error('Jira availability read failed');tasks.push(...r.data);if(r.data.length<1000)break;if(page===99)throw new Error('Jira availability limit reached');}
 for(const task of missingJiraTasks(tasks,new Set(keys),startedAt,account)){const r=await db.from('time_tasks').update({jira_metadata:{...task.jira_metadata,available:false}}).eq('organization_id',org).eq('id',task.id).eq('jira_updated_at',task.jira_updated_at!);if(r.error)throw new Error('Jira availability reconciliation failed');}
}
