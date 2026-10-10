'use server';
import { revalidatePath } from 'next/cache';
import {uploadProfilePhoto,discardUnreferencedPhoto} from '@/lib/profile-photo-server';
import { requirePermission } from '@/lib/access';
import { serverClient } from '@/lib/supabase/server';
import { employeeSchema, employeeLoginSchema, departmentSchema, companySchema } from '@/lib/validation';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { provisionEmployeeLogin } from '@/lib/employee-provisioning';
export type ActionResult = { ok: boolean; message: string; employeeId?: string; loginCreated?: boolean };
export async function createEmployee(form: FormData): Promise<ActionResult> {
  try {
    const ctx = await requirePermission('directory.manage');
    if (form.get('create_login') === 'yes') {
      if (!ctx.roles.includes('Owner')) return { ok: false, message: 'Only the Owner can create an employee password login.' };
      const login = employeeLoginSchema.safeParse(Object.fromEntries(form));
      if (!login.success) return { ok: false, message: login.error.issues[0].message };
      if (!process.env.SUPABASE_SECRET_KEY) return { ok: false, message: 'Employee login setup is not activated yet. Owner must complete the server connection first.' };
      const { password, login_confirmed: confirmed, ...directory } = login.data;
      const photo=await uploadProfilePhoto(form,ctx.organizationId);const profilePayload={...directory,...(photo?{photo_path:photo}:{})};
      void confirmed;
      const admin = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
      const outcome = await provisionEmployeeLogin({
        createAuth: async () => {
          const { data, error } = await admin.auth.admin.createUser({ email: directory.email.toLowerCase(), password, email_confirm: true });
          return error ? {} : { id: data.user?.id };
        },
        completeDirectory: async id => {
          const { data, error } = await admin.rpc('complete_employee_login',{ org_id: ctx.organizationId, owner_actor: ctx.userId, new_user_id: id, payload: profilePayload });
          if (error || typeof data !== 'string') throw new Error('Directory provisioning failed');
          return data;
        },
        removeNewAuth: async id => { const { error } = await admin.auth.admin.deleteUser(id); if (error) throw new Error('Provisioning cleanup failed'); },
      });
      if (outcome.ok) revalidatePath('/', 'layout');else if(outcome.message.includes('was removed')||outcome.message.startsWith('Account could not be created.'))await discardUnreferencedPhoto(photo);
      return outcome;
    }
    const parsed = employeeSchema.safeParse(Object.fromEntries(form));
    if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
    const photo=await uploadProfilePhoto(form,ctx.organizationId);const profilePayload={...parsed.data,...(photo?{photo_path:photo}:{})};
    const db = await serverClient();
    const { data: employeeId, error } = await db.rpc('create_employee', { org_id: ctx.organizationId, payload: profilePayload });
    if (error){await discardUnreferencedPhoto(photo);return { ok: false, message: error.code === '23505' ? 'An employee with this email or Employee ID already exists.' : 'Could not save employee. Check access and department selection.' };}
    revalidatePath('/', 'layout');
    if (typeof employeeId !== 'string') return { ok: false, message: 'Save could not be confirmed. Refresh the directory before trying again.' };
    return { ok: true, message: 'Employee saved to your agency database. The directory is up to date.', employeeId };
  } catch { return { ok: false, message: 'This action requires an authorized workspace account.' }; }
}
export async function createDepartment(form: FormData): Promise<ActionResult> {
  try {
    const ctx = await requirePermission('directory.manage');
    const parsed = departmentSchema.safeParse(Object.fromEntries(form));
    if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
    const db = await serverClient();
    const { error } = await db.rpc('create_department', { org_id: ctx.organizationId, department_name: parsed.data.name });
    if (error) return { ok: false, message: error.code === '23505' ? 'This department already exists.' : 'Could not save department.' };
    revalidatePath('/', 'layout');
    return { ok: true, message: 'Department created.' };
  } catch { return { ok: false, message: 'This action requires an authorized workspace account.' }; }
}
export async function saveCompany(form: FormData): Promise<ActionResult> {
  try {
    const ctx = await requirePermission('settings.manage');
    const parsed = companySchema.safeParse(Object.fromEntries(form));
    if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
    const db = await serverClient();
    const { error } = await db.rpc('update_company', { org_id: ctx.organizationId, company_name: parsed.data.display_name });
    if (error) return { ok: false, message: 'Could not update company settings.' };
    revalidatePath('/', 'layout');
    return { ok: true, message: 'Company name updated.' };
  } catch { return { ok: false, message: 'This action requires an authorized workspace account.' }; }
}

