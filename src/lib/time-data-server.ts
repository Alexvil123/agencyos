import 'server-only';
import type {WorkspaceContext} from './access';
import type {serverClient} from './supabase/server';
import type {TimeData,TimeTask} from './time-types';
import {hydrateJiraMetadata} from './work-jira-sync';
export async function readTimeData(ctx:WorkspaceContext,db:Awaited<ReturnType<typeof serverClient>>){
 try{
 const tables=['time_shifts','time_managers','time_attendance','time_breaks','time_tasks','time_logs','time_segments','time_corrections'] as const;
 const tableReads=Promise.all(tables.map(async t=>{
 const order=t==='time_shifts'||t==='time_managers'?'membership_id':t==='time_attendance'?'clock_in':t==='time_breaks'||t==='time_segments'?'start_at':'created_at';
 let rows:Record<string,unknown>[]=[];let limited=false;
 for(let page=0;page<20;page++){const r=await db.from(t).select('*').eq('organization_id',ctx.organizationId).order(order,{ascending:false}).range(page*1000,page*1000+999);if(r.error)return {data:rows,error:r.error,limited:false};rows=rows.concat(r.data);if(r.data.length<1000)break;if(page===19)limited=true;}
 return {data:rows,error:null,limited};
 }));
 const [results,people,clients]=await Promise.all([tableReads,db.rpc('time_people',{org_id:ctx.organizationId}),db.rpc('time_clients',{org_id:ctx.organizationId})]);
 if(results.some(r=>r.error)||people.error||clients.error)throw new Error('Time database setup not applied');
 const [shifts,managers,attendance,breaks,tasks,logs,segments,corrections]=results.map(r=>r.data);
 const data={self:ctx.membershipId,owner:ctx.roles.includes('Owner'),manager:ctx.roles.includes('Owner')||managers!.some(m=>m.membership_id===ctx.membershipId),serverNow:new Date().toISOString(),people:people.data,clients:clients.data,shifts,managers,attendance,breaks,tasks:tasks.map(t=>hydrateJiraMetadata(t as unknown as TimeTask)),logs,segments,corrections,limited:results.some(r=>r.limited)} as unknown as TimeData;
 return {ok:true,message:'',data};
 }catch{return {ok:false,message:'Time management database is not ready, or team access could not be verified.',data:null};}
}
