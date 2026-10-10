import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {workAdmin} from '../src/lib/work-server';
async function main(){
 const db=workAdmin();const {organizationId}=JSON.parse(await readFile('.sales-google.local.json','utf8')) as {organizationId:string};
 const fixtures=await db.from('organizations').select('id',{count:'exact',head:true}).like('display_name','CRM isolated verification %');assert.ifError(fixtures.error);assert.equal(fixtures.count,0);
 const employees=await db.from('employees').select('id',{count:'exact',head:true}).eq('organization_id',organizationId);assert.ifError(employees.error);assert.equal(employees.count,11);
 const tasks=await db.from('time_tasks').select('id',{count:'exact',head:true}).eq('organization_id',organizationId).like('title','CRM Verification %');assert.ifError(tasks.error);assert.equal(tasks.count,0);
 let page=1,remaining=0;for(;;){const users=await db.auth.admin.listUsers({page,perPage:1000});assert.ifError(users.error);remaining+=users.data.users.filter(u=>u.email?.startsWith('crm-verify-')).length;if(users.data.users.length<1000)break;page++;}assert.equal(remaining,0);
 await assert.rejects(readFile('test-results/verification-private.json'),{code:'ENOENT'});
 const report={checks:['No isolated verification organization remains','No temporary verification Auth accounts remain','No Jira fixture cache rows remain','Private test credentials file removed'],realEmployees:employees.count};await writeFile('test-results/cleanup-verification.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}
main().catch(e=>{console.error(e instanceof Error?e.message:'Cleanup verification failed');process.exitCode=1;});
