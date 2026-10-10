'use server';
import {workAccess} from '@/lib/work-server';
import {jiraAutoFetch} from '@/lib/jira-sync-settings-server';
export async function jiraSyncSetting(){try{const {ctx}=await workAccess();return {...await jiraAutoFetch(ctx.organizationId),owner:ctx.roles.includes('Owner')};}catch{return {ready:false,enabled:false,owner:false};}}
export async function setJiraAutoFetch(enabled:boolean){try{if(typeof enabled!=='boolean')throw new Error('Invalid setting');const {ctx,db}=await workAccess();if(!ctx.roles.includes('Owner'))throw new Error('Owner required');const r=await db.rpc('jira_auto_fetch_save',{org_id:ctx.organizationId,enabled});if(r.error)throw r.error;return {ok:true,message:`Automatic Jira fetch ${enabled?'On':'Off'}.`};}catch{return {ok:false,message:'Automatic fetch setting was not saved. Owner access and database setup are required.'};}}
