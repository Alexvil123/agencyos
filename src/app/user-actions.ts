'use server';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requirePermission } from '@/lib/access';
import { serverClient } from '@/lib/supabase/server';
import type { ActionResult } from './actions';
const inviteSchema = z.object({ email: z.email().max(254), kind: z.literal('employee'), confirmed: z.literal('yes') });
const memberSchema = z.object({ membership_id: z.uuid(), action: z.enum(['grant', 'revoke', 'activate', 'deactivate', 'transfer']), role_key: z.string().max(80).optional(), confirmed: z.literal('yes') });
export async function inviteMember(form: FormData): Promise<ActionResult> {
  try {
    const ctx = await requirePermission('users.manage');
    const parsed = inviteSchema.safeParse(Object.fromEntries(form));
    if (!parsed.success) return { ok: false, message: 'Enter a valid email and confirm this invitation.' };
    if (!process.env.SUPABASE_SECRET_KEY || !process.env.APP_URL) return { ok: false, message: 'Invitation delivery is not configured. Ask the owner to complete server setup.' };
    const db = await serverClient();
    const { data: invitationId, error: reserveError } = await db.rpc('reserve_invitation', { org_id: ctx.organizationId, recipient: parsed.data.email, account_kind: parsed.data.kind });
    if (reserveError || !invitationId) return { ok: false, message: 'Invitation could not be created. Check for an existing account, pending invitation, or rate limit.' };
    const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await admin.auth.admin.inviteUserByEmail(parsed.data.email, { redirectTo: `${process.env.APP_URL}/auth/confirm` });
    const { error: completionError } = await admin.rpc('complete_invitation', { invitation_id: invitationId, invited_user_id: error ? null : data.user?.id || null });
    if (completionError) return { ok: false, message: 'Invitation delivery requires administrator review. Do not retry until its audit record is checked.' };
    if (error) return { ok: false, message: 'Email invitation could not be delivered. Check your authentication email configuration.' };
    revalidatePath('/', 'layout');
    return { ok: true, message: 'Invitation sent. This account has no roles until an authorized administrator assigns them.' };
  } catch { return { ok: false, message: 'This action requires an authorized account administrator.' }; }
}
export async function changeMember(form: FormData): Promise<ActionResult> {
  try {
    const ctx = await requirePermission('users.manage');
    const parsed = memberSchema.safeParse(Object.fromEntries(form));
    if (!parsed.success) return { ok: false, message: 'Choose a valid account action and explicitly confirm the change.' };
    const db = await serverClient();
    const { error } = await db.rpc('change_member_access', { org_id: ctx.organizationId, target_id: parsed.data.membership_id, operation: parsed.data.action, requested_role: parsed.data.role_key || null, confirmed: true });
    if (error) return { ok: false, message: 'Change denied. Check sensitive-role authority, account scope, and owner protections.' };
    revalidatePath('/', 'layout');
    return { ok: true, message: 'Account access updated and recorded in the audit log.' };
  } catch { return { ok: false, message: 'This action requires an authorized account administrator.' }; }
}
