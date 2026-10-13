'use server';
import {z} from 'zod';
import {workspaceContext} from '@/lib/access';
import {serverClient} from '@/lib/supabase/server';
import {GRANTABLE_MODULES} from '@/lib/modules';
import {salesTeamMembers} from '@/lib/sales-team-server';

// Settings → Module access. Only the Owner can read or change who may open Sales, Calendar, Campaigns, Finance and Analytics;
// the database functions enforce the same rule.
export type AccessPerson={membershipId:string;name:string};
export type ModuleAccessResult={ok:boolean;message:string;people:AccessPerson[];granted:Record<string,string[]>};
const none={people:[] as AccessPerson[],granted:{} as Record<string,string[]>};
async function ownerContext(){const ctx=await workspaceContext();if(ctx.preview||ctx.kind!=='employee'||!ctx.roles.includes('Owner'))throw new Error('Only the Owner can manage module access.');return ctx;}

export async function loadModuleAccess():Promise<ModuleAccessResult>{
  try{
    const ctx=await ownerContext(),db=await serverClient();
    const [employees,list]=await Promise.all([
      db.from('employees').select('membership_id,display_name').eq('organization_id',ctx.organizationId).not('membership_id','is',null).order('display_name').limit(500),
      db.rpc('module_access_list',{org_id:ctx.organizationId})]);
    if(employees.error||list.error)throw new Error('Load failed');
    const people=employees.data.filter(e=>e.membership_id!==ctx.membershipId).map(e=>({membershipId:e.membership_id as string,name:e.display_name as string}));
    const granted:Record<string,string[]>=Object.fromEntries(GRANTABLE_MODULES.map(m=>[m,[]]));
    granted.sales=await salesTeamMembers(ctx.organizationId);
    for(const row of (list.data||[]) as {module:string;membership_id:string}[])granted[row.module]?.push(row.membership_id);
    return {ok:true,message:'',people,granted};
  }catch(error){return {ok:false,message:error instanceof Error&&error.message.startsWith('Only the Owner')?error.message:'Module access could not be loaded. Apply the latest database migration and try again.',...none};}
}
const save=z.object({module:z.enum([...GRANTABLE_MODULES,'sales']),members:z.array(z.uuid()).max(500)});
export async function saveModuleAccess(input:{module:string;members:string[]}):Promise<{ok:boolean;message:string}>{
  try{
    const parsed=save.parse(input),ctx=await ownerContext(),db=await serverClient();
    // Sales keeps its own table and audited function (the Sales team); the other modules use module_access.
    const {error}=parsed.module==='sales'
      ?await db.rpc('sales_team_save',{org_id:ctx.organizationId,member_ids:[...new Set(parsed.members)]})
      :await db.rpc('module_access_save',{org_id:ctx.organizationId,module_name:parsed.module,member_ids:parsed.members});
    if(error)throw new Error('Save failed');
    return {ok:true,message:'Access saved.'};
  }catch(error){return {ok:false,message:error instanceof Error&&error.message.startsWith('Only the Owner')?error.message:'Access could not be saved. Try again.'};}
}
