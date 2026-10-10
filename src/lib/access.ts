import 'server-only';
import { redirect } from 'next/navigation';
import { serverClient } from './supabase/server';
import { hasBackend, isSetupPreview } from './config';
export type WorkspaceContext = {
  preview: boolean; userId: string; membershipId: string; organizationId: string;
  name: string; company: string; kind: string; permissions: string[]; roles: string[]; employeeLoginReady: boolean;
};
export async function workspaceContext(): Promise<WorkspaceContext> {
  if (isSetupPreview()) return { preview: true, userId: '', membershipId: '', organizationId: '', name: 'Alex', company: 'Agency workspace', kind: 'employee', permissions: [], roles: ['Setup preview'], employeeLoginReady: false };
  if (!hasBackend()) redirect('/login');
  const db = await serverClient();
  const { data: { user }, error: authError } = await db.auth.getUser();
  if (authError || !user) redirect('/login');
  const { data: membership, error } = await db.from('memberships').select('id,organization_id,kind,organizations(display_name)').eq('user_id', user.id).eq('active', true).maybeSingle();
  if (error) throw new Error('Unable to verify workspace access.');
  if (!membership || membership.kind==='client') redirect('/access-pending');
  const [{ data: profile, error: profileError }, { data: grants, error: grantsError }, {data: policy, error: policyError}] = await Promise.all([
    db.from('profiles').select('display_name').eq('id', user.id).maybeSingle(),
    db.from('membership_roles').select('roles(name,sensitivity,role_permissions(permission_key))').eq('membership_id', membership.id),
    db.from('organizations').select('require_mfa').eq('id',membership.organization_id).maybeSingle(),
  ]);
  if (profileError || grantsError) throw new Error('Unable to verify account permissions.');
  const typedGrants = grants as unknown as { roles: { name: string; sensitivity: string; role_permissions: { permission_key: string }[] } }[] | null;
  const org = membership.organizations as unknown as { display_name: string };
  if (policyError && !['42703','PGRST204'].includes(policyError.code)) throw new Error('Unable to verify sign-in policy.');
  // Fail closed while the reviewed migration has not yet been deployed.
  if ((policyError || policy?.require_mfa !== false) && typedGrants?.some(g => g.roles.sensitivity !== 'standard')) {
    const { data: assurance, error: assuranceError } = await db.auth.mfa.getAuthenticatorAssuranceLevel();
    if (assuranceError || assurance?.currentLevel !== 'aal2') redirect('/auth/mfa');
  }
  return { preview: false, userId: user.id, membershipId: membership.id, organizationId: membership.organization_id, name: profile?.display_name || 'Your workspace', company: org.display_name, kind: membership.kind, roles: typedGrants?.map(g => g.roles.name) || [], permissions: [...new Set(typedGrants?.flatMap(g => g.roles.role_permissions.map(p => p.permission_key)) || [])], employeeLoginReady: Boolean(process.env.SUPABASE_SECRET_KEY) };
}
export async function requirePermission(permission: string) {
  const context = await workspaceContext();
  if (context.preview || !context.permissions.includes(permission)) throw new Error('You do not have permission to perform this action.');
  return context;
}
