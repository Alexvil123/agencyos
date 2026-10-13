import {z} from 'zod';
import {JIRA_KEY} from '@/lib/jira-types';
import {validWorkWebhook} from '@/lib/work-webhook';
import {readWorkIssue,workAdmin} from '@/lib/work-server';
import {jiraAutoFetch} from '@/lib/jira-sync-settings-server';
import {retireJiraTask} from '@/lib/jira-availability-server';
export const runtime='nodejs';
export async function POST(request:Request){
 const secret=process.env.JIRA_WEBHOOK_SECRET,organization=process.env.JIRA_WEBHOOK_ORGANIZATION_ID;
 if(!secret||!organization)return Response.json({error:'Webhook not configured'},{status:503});
 const length=Number(request.headers.get('content-length')||0);if(length>1024*1024)return Response.json({error:'Payload too large'},{status:413});
 const text=await request.text();if(Buffer.byteLength(text)>1024*1024)return Response.json({error:'Payload too large'},{status:413});
 if(!validWorkWebhook(text,request.headers.get('x-hub-signature'),secret))return Response.json({error:'Invalid signature'},{status:401});
 try{const payload=z.object({webhookEvent:z.string(),issue:z.object({key:z.string().regex(JIRA_KEY)})}).parse(JSON.parse(text));if(!['jira:issue_created','jira:issue_updated','jira:issue_deleted'].includes(payload.webhookEvent))return Response.json({ignored:true});
 // Use only a signed issue key, then fetch authoritative data from the fixed Jira tenant.
 if(!(await jiraAutoFetch(organization)).enabled)return Response.json({ignored:true,reason:'Automatic fetch disabled'});
 if(payload.webhookEvent==='jira:issue_deleted'){await retireJiraTask(organization,payload.issue.key);return Response.json({received:true,retired:true,timersChanged:false});}
 const current=await readWorkIssue(organization,payload.issue.key);const {error}=await workAdmin().rpc('work_import',{org_id:organization,actor_user:null,issues:[current.issue],system_event:true});if(error)throw new Error('Import failed');return Response.json({received:true,timersChanged:false});
 }catch{return Response.json({error:'Webhook import could not be confirmed'},{status:500});}
}
