import {readFile} from 'node:fs/promises';
import {createDecipheriv} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
const app=JSON.parse(await readFile('.jira-oauth-app.local.json','utf8'));
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const {data,error}=await db.from('jira_oauth_connections').select('encrypted_tokens').eq('organization_id',app.organizationId).single();
if(error)throw new Error('Connection unavailable');
const packed=Buffer.from(data.encrypted_tokens,'base64');
const decipher=createDecipheriv('aes-256-gcm',Buffer.from(app.encryptionKey,'base64'),packed.subarray(0,12));
decipher.setAAD(Buffer.from(app.organizationId));decipher.setAuthTag(packed.subarray(-16));
const token=JSON.parse(Buffer.concat([decipher.update(packed.subarray(12,-16)),decipher.final()]).toString('utf8'));
if(token.expires_at<Date.now())throw new Error('Reconnect or refresh through CRM before discovery');
let people=[];
for(let start=0;start<1000;start+=100){
 const response=await fetch(`https://api.atlassian.com/ex/jira/${token.cloud_id}/rest/api/3/users/search?startAt=${start}&maxResults=100`,{headers:{Authorization:`Bearer ${token.access_token}`,Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw new Error(`Directory lookup HTTP ${response.status}`);
 const users=await response.json();people.push(...users.filter(u=>u.accountType==='atlassian'&&u.active).map(u=>({accountId:u.accountId,name:u.displayName,email:u.emailAddress||null})));
 if(users.length<100)break;
}
console.log(JSON.stringify({activePeople:people},null,2));
const {data:employees,error:employeeError}=await db.from('employees').select('id,display_name,email,membership_id').eq('organization_id',app.organizationId);
if(employeeError)throw new Error('Employee lookup failed');
console.log(JSON.stringify({crmEmployees:employees},null,2));
const {data:members}=await db.from('memberships').select('id,active,kind,membership_roles(roles(name))').eq('organization_id',app.organizationId);
const {data:links}=await db.from('jira_account_links').select('membership_id,account_id').eq('organization_id',app.organizationId);
console.log(JSON.stringify({members,existingJiraLinks:links},null,2));
const {writeFile}=await import('node:fs/promises');
const approvedPairs=[['Barath','Barath'],['Sneha','Sneha'],['Murugesh','Murugesh'],['Ajith','Ajith'],['Immanuel','Immanuel'],['Karthika','Karthika'],['Palani','Palani'],['Nanjil','Nanjil Manohar S'],['Muthu Buvanesh','Muthu']];
const quote=v=>"'"+String(v).replaceAll("'","''")+"'";
let sql="begin;\nselect set_config('request.jwt.claim.sub','33852255-e6b8-4de4-acd4-e96429fd35fd',true);\n";
for(const [crmName,jiraName] of approvedPairs){
 const e=employees.filter(e=>e.display_name===crmName),j=people.filter(p=>p.name===jiraName);
 if(e.length!==1||j.length!==1||!e[0].membership_id)throw new Error('Approved mapping is no longer unique');
 const member=members.find(m=>m.id===e[0].membership_id);
 if(!member?.active||member.kind!=='employee')throw new Error('Inactive employee');
 if(links.some(l=>(l.membership_id===e[0].membership_id&&l.account_id!==j[0].accountId)||(l.account_id===j[0].accountId&&l.membership_id!==e[0].membership_id)))throw new Error('Existing link conflict');
 sql+=`select public.link_jira_account(${quote(app.organizationId)}::uuid,${quote(e[0].membership_id)}::uuid,${quote(j[0].accountId)});\n`;
 if(crmName!==jiraName)sql+=`select public.update_directory_record(${quote(app.organizationId)}::uuid,'employee',${quote(e[0].id)}::uuid,(select jsonb_build_object('display_name',${quote(jiraName)},'email',email,'job_title',job_title,'department_id',department_id) from public.employees where id=${quote(e[0].id)}::uuid and organization_id=${quote(app.organizationId)}::uuid));\n`;
}
sql+='commit;\nselect e.display_name,e.email,l.account_id from public.employees e join public.jira_account_links l on l.membership_id=e.membership_id where e.organization_id='+quote(app.organizationId)+'::uuid order by e.display_name;\n';
await writeFile('docs/jira-approved-employee-setup.sql',sql);
console.log('Prepared 9 verified mappings and 2 name corrections using existing audited Owner functions.');
