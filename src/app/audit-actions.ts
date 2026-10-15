'use server';
import {workspaceContext} from '@/lib/access';
import {serverClient} from '@/lib/supabase/server';
import {AUDIT_ACTIONS,describeAudit,type AuditLine,type AuditNames,type AuditRow} from '@/lib/audit-view';

// Settings → Audit history. Read-only; the database policy already limits audit_logs to people with audit.read.
const LIMIT=50;
type AuditResult={ok:boolean;message:string;lines:AuditLine[]};

async function names(db:Awaited<ReturnType<typeof serverClient>>,org:string):Promise<AuditNames>{
  const [members,employees]=await Promise.all([db.from('memberships').select('id,user_id,email').eq('organization_id',org).limit(1000),db.from('employees').select('membership_id,display_name').eq('organization_id',org).not('membership_id','is',null).limit(1000)]);
  if(members.error||employees.error)return {users:{},members:{}};
  const byMember=new Map(employees.data.map(e=>[e.membership_id as string,e.display_name as string]));
  const label=(m:{id:unknown;email:unknown})=>byMember.get(m.id as string)||(m.email as string)||'Team member';
  return {users:Object.fromEntries(members.data.filter(m=>m.user_id).map(m=>[m.user_id as string,label(m)])),members:Object.fromEntries(members.data.map(m=>[m.id as string,label(m)]))};
}
/** The latest 50 entries, newest first. */
export async function loadAudit():Promise<AuditResult>{
  try{
    const ctx=await workspaceContext();
    if(ctx.preview||ctx.kind!=='employee'||!ctx.permissions.includes('audit.read'))return {ok:false,message:'You do not have access to the audit history.',lines:[]};
    const db=await serverClient();
    const [n,rows]=await Promise.all([names(db,ctx.organizationId),db.from('audit_logs').select('id,action,entity_type,entity_id,actor_id,old_value,new_value,created_at').eq('organization_id',ctx.organizationId).in('action',AUDIT_ACTIONS).order('created_at',{ascending:false}).order('id').limit(LIMIT)]);
    if(rows.error)throw new Error('Audit read failed');
    return {ok:true,message:'',lines:(rows.data as unknown as AuditRow[]).map(r=>describeAudit(r,n)).filter((l):l is AuditLine=>l!==null)};
  }catch{return {ok:false,message:'The audit history could not be loaded. Try again.',lines:[]};}
}
