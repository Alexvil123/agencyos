'use server';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { revalidatePath } from 'next/cache';
import {uploadProfilePhoto,discardUnreferencedPhoto} from '@/lib/profile-photo-server';
import { requirePermission } from '@/lib/access';
import { serverClient } from '@/lib/supabase/server';
import { employeeSchema,clientSchema,departmentSchema,passwordSchema } from '@/lib/validation';
import type { ActionResult } from './actions';
export async function updateRecord(form:FormData):Promise<ActionResult>{
 try {
  const ctx=await requirePermission('directory.manage');if(!ctx.roles.includes('Owner')) throw Error();
  const id=z.uuid().parse(form.get('id'));const kind=z.enum(['employee','department','client']).parse(form.get('kind'));
  const payload=(kind==='employee'?employeeSchema:kind==='client'?clientSchema:departmentSchema).parse(Object.fromEntries(form));
  // Validate and upload the photo before making any login identity change.
  const photo=kind==='employee'?await uploadProfilePhoto(form,ctx.organizationId):null;const profilePayload={...payload,...(photo?{photo_path:photo}:{})};
  const db=await serverClient();let changedIdentity:{userId:string;oldEmail:string}|null=null;
  const admin=process.env.SUPABASE_SECRET_KEY?createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}}):null;
  if(kind==='employee'&&'email' in payload&&typeof payload.email==='string'){
   const {data:record,error:readError}=await db.from('employees').select('email,membership_id').eq('id',id).eq('organization_id',ctx.organizationId).maybeSingle();
   if(readError||!record) throw Error();
   if(record.membership_id&&record.email!==payload.email.toLowerCase()){
    if(form.get('email_confirmed')!=='yes'||!admin) return {ok:false,message:'Verify the new email and confirm changing this login identity.'};
    const {data:members,error:membersError}=await db.rpc('list_workspace_members',{org_id:ctx.organizationId});if(membersError) throw Error();
    const target=(members as {id:string;user_id:string}[]).find(m=>m.id===record.membership_id);if(!target) throw Error();
    try{const {error:authError}=await admin.auth.admin.updateUserById(target.user_id,{email:payload.email.toLowerCase(),email_confirm:true});if(authError)return {ok:false,message:'Login email update rejected. Check for an existing account with this email.'};}
    catch{return {ok:false,message:'Login email status is uncertain. Check this account before retrying.'};}
    changedIdentity={userId:target.user_id,oldEmail:record.email};
   }
  }
  let saved;try{saved=await db.rpc('update_directory_record',{org_id:ctx.organizationId,record_kind:kind,record_id:id,payload:profilePayload});}catch{return {ok:false,message:changedIdentity?'Email synchronization status is uncertain. Check the login and directory before retrying.':'Connection interrupted. Check the directory before retrying.'};}
  const {error}=saved;
  if(error)await discardUnreferencedPhoto(photo);
  if(error&&changedIdentity&&admin){try{const {error:rollbackError}=await admin.auth.admin.updateUserById(changedIdentity.userId,{email:changedIdentity.oldEmail,email_confirm:true});if(rollbackError)throw Error();}catch{return {ok:false,message:'Email synchronization needs Owner review. Check authentication and directory email before retrying.'};}}
  if(error) return {ok:false,message:error.code==='23505'?'A record with these details already exists.':'Update failed. Check record access and field values.'};
  revalidatePath('/','layout');return {ok:true,message:'Changes saved to your database and audit history.'};
 }catch{return {ok:false,message:'Valid fields and Owner access are required.'};}
}
export async function changeAccountPassword(form:FormData):Promise<ActionResult>{
 try {
  const ctx=await requirePermission('users.manage');if(!ctx.roles.includes('Owner')) throw Error();
  const parsed=z.object({membership_id:z.uuid(),password:passwordSchema,confirmed:z.literal('yes')}).parse(Object.fromEntries(form));
  if(!process.env.SUPABASE_SECRET_KEY) return {ok:false,message:'Server account setup is unavailable.'};
  const db=await serverClient();
  const {data:members,error:memberError}=await db.rpc('list_workspace_members',{org_id:ctx.organizationId});
  if(memberError) throw Error();const target=(members as {id:string;user_id:string}[]).find(m=>m.id===parsed.membership_id);if(!target) throw Error();
  const {data:requestId,error:requestError}=await db.rpc('request_password_change',{org_id:ctx.organizationId,target_membership:target.id,confirmed:true});
  if(requestError||!requestId) return {ok:false,message:'Password change denied. Check account scope, confirmation, or rate limit.'};
  const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  let changed=false;
  try {const {error}=await admin.auth.admin.updateUserById(target.user_id,{password:parsed.password});changed=!error;}catch{return {ok:false,message:'Password update status is uncertain. Check this account before trying again.'};}
  const {error:auditError}=await admin.rpc('complete_password_change',{request_id:requestId,succeeded:changed});
  if(auditError) return {ok:false,message:'Password update requires audit review. Do not retry until its status is checked.'};
  revalidatePath('/','layout');return {ok:changed,message:changed?'Password changed and recorded in audit history.':'Authentication rejected the password change. Try a different password.'};
 }catch{return {ok:false,message:'Owner access and confirmation are required. Password must have at least 6 characters and fit within 72 UTF-8 bytes.'};}
}
