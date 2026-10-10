'use server';
import {z} from 'zod';
import {workAccess,workAdmin,readWorkIssue,importWorkIssues} from '@/lib/work-server';
import {jiraCredentials} from '@/lib/jira-server';
import {jiraRequest,JiraError} from '@/lib/jira-http';
import {calendarCreateSchema,calendarUpdateSchema} from '@/lib/calendar-input';
import {createIssue,assignIssue,setIssueDueDate,unsupportedRequiredFields,type JiraCall} from '@/lib/calendar-jira';

// Calendar writes go to Jira first, are read back from Jira, then saved in the CRM. Only the Owner may create or assign
// Jira tasks (the database audit function enforces the same rule).
export type CalendarResult={ok:boolean;message:string;key?:string};
export type CalendarSetup={ok:boolean;message:string;assignees:{id:string;name:string}[];issueTypes:Record<'OCT'|'SEP',{id:string;name:string}[]>};
class CalendarError extends Error{}
type Context=Awaited<ReturnType<typeof workAccess>>['ctx'];

async function ownerAccess(){
  const {ctx,db}=await workAccess();
  if(!ctx.roles.includes('Owner'))throw new CalendarError('Only the Owner can create or assign Jira tasks from the Calendar.');
  return {ctx,db};
}
function reason(error:unknown,fallback:string){
  if(error instanceof CalendarError||error instanceof JiraError)return error.message;
  if(error instanceof z.ZodError)return error.issues[0]?.message||'Check the form fields.';
  return fallback;
}
async function jira(organizationId:string){
  const credentials=await jiraCredentials(organizationId);
  if(!credentials)throw new CalendarError('Connect Jira in Settings first.');
  return ((path:string,body?:unknown,method?:string)=>jiraRequest(credentials,path,body,method)) as JiraCall;
}
async function audit(ctx:Context,assignee:string|null,operation:string,key:string){
  const {error}=await workAdmin().rpc('jira_audit',{org_id:ctx.organizationId,actor:ctx.userId,issue_assignee:assignee,operation,issue_key:key});
  if(error)throw new CalendarError('The change could not be recorded in the audit log, so nothing was changed.');
}
async function issueTypes(call:JiraCall,project:string){
  const result=await call<{issueTypes?:{id:string;name:string;subtask?:boolean}[]}>(`/rest/api/3/issue/createmeta/${project}/issuetypes?maxResults=100`);
  return (result.issueTypes||[]).filter(t=>!t.subtask).map(t=>({id:t.id,name:t.name}));
}
async function accountFor(db:Awaited<ReturnType<typeof ownerAccess>>['db'],organizationId:string,membershipId:string){
  const link=await db.from('jira_account_links').select('account_id').eq('organization_id',organizationId).eq('membership_id',membershipId).maybeSingle();
  if(link.error||!link.data)throw new CalendarError('This employee is not linked to a Jira account yet. Link them in Team first.');
  return link.data.account_id as string;
}

export async function calendarSetup():Promise<CalendarSetup>{
  try{
    const {ctx,db}=await ownerAccess(),call=await jira(ctx.organizationId);
    const [links,people,oct,sep]=await Promise.all([
      db.from('jira_account_links').select('membership_id').eq('organization_id',ctx.organizationId),
      db.from('employees').select('membership_id,display_name').eq('organization_id',ctx.organizationId).not('membership_id','is',null).order('display_name'),
      issueTypes(call,'OCT'),issueTypes(call,'SEP'),
    ]);
    if(links.error||people.error)throw new CalendarError('Employee Jira links could not be read.');
    const linked=new Set(links.data.map(l=>l.membership_id));
    return {ok:true,message:'',assignees:people.data.filter(p=>linked.has(p.membership_id)).map(p=>({id:p.membership_id as string,name:p.display_name as string})),issueTypes:{OCT:oct,SEP:sep}};
  }catch(error){
    return {ok:false,message:reason(error,'The calendar setup could not be loaded. Check the Jira connection in Settings.'),assignees:[],issueTypes:{OCT:[],SEP:[]}};
  }
}

// Read-only check: does this project/issue type need Jira fields the form cannot fill?
export async function calendarRequirements(project:string,issueType:string):Promise<{ok:boolean;message:string;missing:string[]}>{
  try{
    const {ctx}=await ownerAccess();
    if(!/^(OCT|SEP)$/.test(project)||!/^\d+$/.test(issueType))throw new CalendarError('Choose a project and issue type.');
    const call=await jira(ctx.organizationId);
    const meta=await call<{fields?:unknown[];values?:unknown[]}>(`/rest/api/3/issue/createmeta/${project}/issuetypes/${issueType}?maxResults=200`);
    return {ok:true,message:'',missing:unsupportedRequiredFields(meta)};
  }catch(error){return {ok:false,message:reason(error,'Jira field requirements could not be checked.'),missing:[]};}
}

const used=new Map<string,number>();
function claimTicket(ticket:string){
  const now=Date.now();for(const [key,expires] of used)if(expires<now)used.delete(key);
  if(used.has(ticket))return false;used.set(ticket,now+3600000);return true;
}

export async function calendarCreateTask(form:FormData):Promise<CalendarResult>{
  let requested:{ctx:Context;project:string}|undefined,createdKey='';
  try{
    const {ctx,db}=await ownerAccess(),input=calendarCreateSchema.parse(Object.fromEntries(form));
    if(!claimTicket(input.ticket))throw new CalendarError('This request was already submitted. Refresh the calendar to see the task.');
    const call=await jira(ctx.organizationId);
    if(!(await issueTypes(call,input.project)).some(t=>t.id===input.issue_type))throw new CalendarError('This issue type is not available in the selected Jira project.');
    const account=input.assignee?await accountFor(db,ctx.organizationId,input.assignee):null;
    await audit(ctx,null,'create_requested',input.project);requested={ctx,project:input.project};
    createdKey=await createIssue(call,input);
    let warning='';
    if(account){try{await assignIssue(call,createdKey,account);}catch{warning=`${createdKey} was created in Jira, but Jira did not accept the assignee. Assign it again from the calendar.`;}}
    const latest=await readWorkIssue(ctx.organizationId,createdKey);
    await importWorkIssues(ctx.organizationId,ctx.userId,[latest.issue]);
    await audit(ctx,null,'create_completed',createdKey);
    return warning?{ok:false,message:warning,key:createdKey}:{ok:true,message:`${createdKey} was created in Jira${account?' and assigned':''}. It now appears on the calendar.`,key:createdKey};
  }catch(error){
    if(requested){
      await audit(requested.ctx,null,'create_uncertain',createdKey||requested.project).catch(()=>undefined);
      if(createdKey)return {ok:false,message:`${createdKey} was created in Jira, but the CRM could not refresh it. Use Sync Jira in Work to bring it in.`,key:createdKey};
      if(error instanceof JiraError&&!error.uncertain)return {ok:false,message:error.message};
      return {ok:false,message:'Jira did not confirm the new task. Check Jira before trying again so a duplicate is not created.'};
    }
    return {ok:false,message:reason(error,'The task could not be created.')};
  }
}

export async function calendarUpdateTask(form:FormData):Promise<CalendarResult>{
  let requested:{ctx:Context;assignee:string|null;key:string}|undefined;
  try{
    const {ctx,db}=await ownerAccess(),input=calendarUpdateSchema.parse(Object.fromEntries(form));
    const task=await db.from('time_tasks').select('jira_key,source').eq('organization_id',ctx.organizationId).eq('id',input.task).maybeSingle();
    const key=task.data?.jira_key;
    if(task.error||!key||task.data?.source!=='jira'||!/^(OCT|SEP)-[1-9][0-9]*$/.test(key))throw new CalendarError('Only Jira tasks in OCT or SEP can be rescheduled or reassigned here.');
    const call=await jira(ctx.organizationId),before=await readWorkIssue(ctx.organizationId,key);
    if(input.expected&&before.issue.jira_updated!==input.expected){
      await importWorkIssues(ctx.organizationId,ctx.userId,[before.issue]);
      return {ok:false,message:'This task changed in Jira. The calendar now shows the latest version; review it and try again.',key};
    }
    const nextDue=input.change_due==='yes'?(input.due_date||null):undefined;
    const nextAccount=input.change_assignee==='yes'?(input.assignee?await accountFor(db,ctx.organizationId,input.assignee):null):undefined;
    const dueChanges=nextDue!==undefined&&nextDue!==(before.issue.due_date||null),whoChanges=nextAccount!==undefined&&nextAccount!==before.issue.assignee_id;
    if(!dueChanges&&!whoChanges)return {ok:true,message:'Nothing changed.',key};
    await audit(ctx,before.issue.assignee_id,'edit_requested',key);requested={ctx,assignee:before.issue.assignee_id,key};
    if(dueChanges)await setIssueDueDate(call,key,nextDue!);
    if(whoChanges)await assignIssue(call,key,nextAccount!);
    const after=await readWorkIssue(ctx.organizationId,key);
    await importWorkIssues(ctx.organizationId,ctx.userId,[after.issue]);
    await audit(ctx,after.issue.assignee_id,'edit_completed',key);
    const dueOk=!dueChanges||(nextDue??null)===(after.issue.due_date||null),whoOk=!whoChanges||nextAccount===after.issue.assignee_id;
    if(!dueOk||!whoOk)return {ok:false,message:'Jira kept different values. The calendar shows what Jira has now.',key};
    return {ok:true,message:`${key} updated in Jira${whoChanges?' and reassigned':''}${dueChanges?(nextDue?` for ${nextDue}`:' with no due date'):''}.`,key};
  }catch(error){
    if(requested){
      await audit(requested.ctx,requested.assignee,'edit_uncertain',requested.key).catch(()=>undefined);
      if(error instanceof JiraError&&!error.uncertain)return {ok:false,message:error.message,key:requested.key};
      return {ok:false,message:'Jira did not confirm the change. Refresh the calendar and check the task before trying again.',key:requested.key};
    }
    return {ok:false,message:reason(error,'The task could not be updated.')};
  }
}
