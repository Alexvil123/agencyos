import 'server-only';
import {profilePhotoUrl} from './profile-photo-server';
import { serverClient } from './supabase/server';
import type { WorkspaceContext } from './access';
export type Employee = { phone?:string;employee_code?:string|null;birthday?:string|null;photo_path?:string|null;photo_url?:string|null; id: string; display_name: string; email: string; job_title: string; department_id: string | null; membership_id: string | null; created_at: string };
export type Department = { id: string; name: string };
export type Member = { id: string; user_id: string; email: string; active: boolean; kind: string; display_name: string; roles: string[] };
export type Client = { id: string; display_name: string; created_at: string };
export type WorkspaceData = { employees: Employee[]; departments: Department[]; members: Member[]; roles: { key: string; name: string; sensitivity: string }[]; clients: Client[] };
export async function workspaceData(ctx: WorkspaceContext): Promise<WorkspaceData> {
  const empty: WorkspaceData = { employees: [], departments: [], members: [], roles: [], clients: [] };
  if (ctx.preview) return empty;
  const db = await serverClient();
  const results = await Promise.all([
    db.from('employees').select('id,display_name,email,job_title,department_id,membership_id,created_at,phone,employee_code,birthday,photo_path').eq('organization_id', ctx.organizationId).order('display_name').limit(500),
    db.from('departments').select('id,name').eq('organization_id', ctx.organizationId).order('name').limit(200),
    ctx.permissions.includes('users.manage') ? db.rpc('list_workspace_members', { org_id: ctx.organizationId }) : Promise.resolve({ data: [], error: null }),
    db.from('roles').select('key,name,sensitivity').order('name'),
    Promise.resolve({data:[],error:null}),
  ]);
  if (results.some(r => r.error)) throw new Error('Unable to load workspace data. Check the database migration and your access.');
  return { employees: await Promise.all((results[0].data as Employee[]).map(async e=>({...e,photo_url:await profilePhotoUrl(e.photo_path)}))), departments: results[1].data as Department[], members: results[2].data as Member[], roles: results[3].data as WorkspaceData['roles'], clients: results[4].data as Client[] };
}
