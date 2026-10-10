'use server';
import {z} from 'zod';
import {workspaceContext} from '@/lib/access';
import {serverClient} from '@/lib/supabase/server';

import {readTimeData} from '@/lib/time-data-server';
import {workAdmin,readWorkIssue,importWorkIssues} from '@/lib/work-server';
async function access(){const ctx=await workspaceContext();if(ctx.preview||ctx.kind!=='employee')throw new Error('Active team account required');return {ctx,db:await serverClient()};}
export async function loadTimeData(){try{const {ctx,db}=await access();return await readTimeData(ctx,db);}catch{return {ok:false,message:'Time management access could not be verified.',data:null};}}
const optionalUuid=z.preprocess(v=>v===''?null:v,z.uuid().nullable());
const stamp=z.iso.datetime({offset:true});
const base=z.object({operation:z.enum(['clock_in','clock_out','break_start','break_end','timer_start','timer_pause','timer_resume','timer_stop','setup','task_create','task_complete','request','continue_request','approve','reject'])});
export async function timeAction(form:FormData){
 try{
 const {ctx,db}=await access();const raw=Object.fromEntries(form);const {operation}=base.parse(raw);let rpc:string,args:Record<string,unknown>={org_id:ctx.organizationId};
 if(operation==='break_end'){
  const {data:br,error:breakError}=await db.from('time_breaks').select('id,paused_log_id').eq('organization_id',ctx.organizationId).eq('membership_id',ctx.membershipId).is('end_at',null).maybeSingle();
  if(breakError)throw new Error('Break check failed');if(!br)return {ok:false,message:'No active break'};
  let verified:string|null=null,warning='';
  if(br.paused_log_id){
   const {data:log}=await db.from('time_logs').select('task_id').eq('id',br.paused_log_id).eq('membership_id',ctx.membershipId).eq('state','paused').maybeSingle();
   if(log){const {data:task}=await db.from('time_tasks').select('source,jira_key').eq('id',log.task_id).eq('membership_id',ctx.membershipId).maybeSingle();
    if(task?.source==='jira'){try{const {issue}=await readWorkIssue(ctx.organizationId,task.jira_key);const {data:link}=await db.from('jira_account_links').select('account_id').eq('organization_id',ctx.organizationId).eq('membership_id',ctx.membershipId).maybeSingle();await importWorkIssues(ctx.organizationId,ctx.userId,[issue]);if(link&&issue.assignee_id===link.account_id)verified=br.paused_log_id;else warning=' Jira assignment changed; the task remains held.';}catch{warning=' Jira assignment could not be verified; the task remains held. Retry Resume after Jira reconnects.';}}
   }
  }
  const {data:resumed,error}=await workAdmin().rpc('work_break_end',{org_id:ctx.organizationId,actor_user:ctx.userId,expected_break:br.id,verified_log:verified});
  if(error)return {ok:false,message:'End break could not be confirmed. Refresh before retrying.'};
  return {ok:true,message:`Break ended.${resumed?' Your break-paused task resumed automatically.':' No task was automatically resumed.'}${warning}`};
 }
 if(['clock_in','clock_out','break_start','break_end','timer_start','timer_pause','timer_resume','timer_stop'].includes(operation)) {rpc='time_event';args={...args,operation,task:optionalUuid.parse(raw.task||null)};}
 else if(operation==='setup') {const p=z.object({target:z.uuid(),confirmed:z.literal('yes')}).parse(raw);rpc='time_owner_setup';args={...args,target:p.target,shift_name:null,manager_access:raw.manager==='yes'};}
 else if(operation==='task_create') {const p=z.object({target:z.uuid(),title:z.string().trim().min(1).max(255),client:optionalUuid,due:z.union([stamp,z.literal('')]),confirmed:z.literal('yes')}).parse(raw);rpc='time_task_save';args={...args,target:p.target,title_value:p.title,client:p.client,due:p.due||null};}
 else if(operation==='task_complete') {rpc='time_task_complete';args={...args,task:z.uuid().parse(raw.task)};}
 else if(operation==='continue_request'){const p=z.object({work_date:z.iso.date()}).parse(raw);rpc='time_continue_request';args={...args,work_day:p.work_date};}
 else if(operation==='request'){const p=z.object({kind:z.enum(['attendance','manual_task']),target:z.uuid(),start:stamp,end:stamp,break_seconds:z.coerce.number().int().min(0).max(86400),reason:z.string().trim().min(5).max(1000),confirmed:z.literal('yes')}).parse(raw);rpc='time_correction_request';args={...args,correction_kind:p.kind,target:p.target,start_value:p.start,end_value:p.end,break_value:p.break_seconds,reason_value:p.reason};}
 else {z.literal('yes').parse(raw.confirmed);rpc='time_correction_review';args={...args,request_id:z.uuid().parse(raw.request_id),approve:operation==='approve'};}
 const {error}=await db.rpc(rpc,args);if(error)return {ok:false,message:knownError(error.message)};
 return {ok:true,message:(operation==='request'||operation==='continue_request')?'Request submitted for approval. It does not change recorded time yet.':'Saved to the agency database and audit history.'};
 }catch{return {ok:false,message:'Action could not be completed. Check required fields and team access. Refresh before retrying.'};}
}
function knownError(value:string){const allowed=['Owner required','Active employee required','Cannot increase own permissions','Already clocked in','Sunday is a non-working day','Owner must assign a shift','Clock in first','Break already started','No active break','End break before starting work','Stop current timer first','Assigned active task required','No paused timer','No current timer','Timer already paused','Owner or authorized manager required','Task access denied','Stop the task timer first','Invalid time interval','Attendance access denied','Authorized approver required','Pending request required','Cannot approve own request','Employee inactive','Attendance changed; request again','Stop timer and end break before approval','Correction must stay on its work date','Attendance overlap','Time overlaps an existing task segment'];return allowed.find(s=>value.includes(s))||'The database rejected this change. Refresh and check the current record before retrying.';}
