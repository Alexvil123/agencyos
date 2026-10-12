'use server';
import {z} from 'zod';
import {workspaceContext} from '@/lib/access';
import {serverClient} from '@/lib/supabase/server';
import {AUDIT_CATEGORIES,describeAudit,type AuditLine,type AuditRow} from '@/lib/audit-view';
import {csvCell} from '@/lib/work-report';

// Settings → Audit history. Read-only; the database policy already limits audit_logs to people with audit.read.
const PAGE=25,EXPORT_LIMIT=2000;
const filters=z.object({
  category:z.enum(Object.keys(AUDIT_CATEGORIES) as [keyof typeof AUDIT_CATEGORIES,...(keyof typeof AUDIT_CATEGORIES)[]]).default('all'),
  actor:z.union([z.uuid(),z.literal('')]).default(''),
  from:z.union([z.iso.date(),z.literal('')]).default(''),
  to:z.union([z.iso.date(),z.literal('')]).default(''),
  system:z.boolean().default(false),
  offset:z.number().int().min(0).max(100000).default(0),
});
export type AuditFilters=z.input<typeof filters>;
export type AuditResult={ok:boolean;message:string;lines:AuditLine[];hasMore:boolean;people:{id:string;name:string}[]};
const nextDay=(day:string)=>{const d=new Date(day+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+1);return d.toISOString().slice(0,10);};

async function context(){
  const ctx=await workspaceContext();
  if(ctx.preview||ctx.kind!=='employee'||!ctx.permissions.includes('audit.read'))throw new Error('You do not have access to the audit history.');
  return {ctx,db:await serverClient()};
}
async function people(db:Awaited<ReturnType<typeof serverClient>>,org:string){
  const [members,employees]=await Promise.all([db.from('memberships').select('id,user_id,email').eq('organization_id',org).limit(1000),db.from('employees').select('membership_id,display_name').eq('organization_id',org).not('membership_id','is',null).limit(1000)]);
  if(members.error||employees.error)return {} as Record<string,string>;
  const names=new Map(employees.data.map(e=>[e.membership_id as string,e.display_name as string]));
  return Object.fromEntries(members.data.filter(m=>m.user_id).map(m=>[m.user_id as string,names.get(m.id as string)||(m.email as string)||'Team member']));
}
function query(db:Awaited<ReturnType<typeof serverClient>>,org:string,f:z.output<typeof filters>){
  let q=db.from('audit_logs').select('id,action,entity_type,entity_id,actor_id,old_value,new_value,created_at').eq('organization_id',org);
  const types=AUDIT_CATEGORIES[f.category].types;if(types)q=q.in('entity_type',[...types]);
  if(f.actor)q=q.eq('actor_id',f.actor);
  // Dates are India days.
  if(f.from)q=q.gte('created_at',`${f.from}T00:00:00+05:30`);
  if(f.to)q=q.lt('created_at',`${nextDay(f.to)}T00:00:00+05:30`);
  if(!f.system)q=q.or('entity_type.neq.time_tasks,new_value->>source.is.null,new_value->>source.neq.jira');
  return q.order('created_at',{ascending:false}).order('id');
}
export async function loadAudit(input:AuditFilters):Promise<AuditResult>{
  try{
    const f=filters.parse(input),{ctx,db}=await context();
    const [names,rows]=await Promise.all([people(db,ctx.organizationId),query(db,ctx.organizationId,f).range(f.offset,f.offset+PAGE)]);
    if(rows.error)throw new Error('Audit read failed');
    const data=rows.data as unknown as AuditRow[];
    return {ok:true,message:'',lines:data.slice(0,PAGE).map(r=>describeAudit(r,names)),hasMore:data.length>PAGE,people:Object.entries(names).map(([id,name])=>({id,name})).sort((a,b)=>a.name.localeCompare(b.name))};
  }catch(error){return {ok:false,message:error instanceof z.ZodError?'Choose valid filters.':error instanceof Error&&error.message.startsWith('You do not')?error.message:'The audit history could not be loaded. Try again.',lines:[],hasMore:false,people:[]};}
}
/** CSV of the current filters (newest first, up to 2,000 rows). */
export async function exportAudit(input:AuditFilters):Promise<{ok:boolean;message:string;csv:string}>{
  try{
    const f=filters.parse({...input,offset:0}),{ctx,db}=await context();
    const [names,rows]=await Promise.all([people(db,ctx.organizationId),query(db,ctx.organizationId,f).range(0,EXPORT_LIMIT-1)]);
    if(rows.error)throw new Error('Audit read failed');
    const time=new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',dateStyle:'medium',timeStyle:'medium'});
    const lines=(rows.data as unknown as AuditRow[]).map(r=>describeAudit(r,names));
    const csv=['When (IST),Who,What,Item,Details',...lines.map(l=>[time.format(new Date(l.at)),l.who,l.title,l.entity,l.details.join('; ')].map(csvCell).join(','))].join('\r\n');
    return {ok:true,message:lines.length>=EXPORT_LIMIT?`Exported the newest ${EXPORT_LIMIT} entries.`:`Exported ${lines.length} entries.`,csv};
  }catch(error){return {ok:false,message:error instanceof z.ZodError?'Choose valid filters.':error instanceof Error&&error.message.startsWith('You do not')?error.message:'The export could not be created. Try again.',csv:''};}
}
